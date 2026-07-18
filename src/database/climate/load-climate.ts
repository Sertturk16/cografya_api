import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import { Province } from '../../province/entities/province.entity';
import { canonicalJson } from './canonical-json';
import type {
  ClimateAnomaly,
  ClimateManifestArtifact,
  ClimateNormalsArtifact,
} from './climate-artifact.types';
import {
  ClimateImportError,
  assertArtifactsCorroborate,
  assertClimateNormalsShape,
  assertDecimalRoundTrip,
} from './climate-assertions';

/**
 * `--phase=load` — reads the COMMITTED artifacts and upserts them. No network, ever.
 *
 * This is the only phase CI sees, and it is deterministic and offline by construction: MGM
 * being down can never fail a build.
 *
 * ## Idempotency, and why it is a correctness property here rather than a nicety
 * A province whose stored series already equals the artifact is left completely untouched —
 * no write, so `provinces.updated_at` does not move. That column is what the province page's
 * `dateModified` and the sitemap `lastmod` are built from (this is the very reason the plan
 * chose a `jsonb` column over a child table). A re-run that bumped 81 `updated_at` values
 * would tell Google that 81 pages changed when nothing did — so "no-op means no write" is a
 * publishing-honesty rule, not an optimisation.
 *
 * Because these writes go through the TypeORM repository, `@UpdateDateColumn` moves exactly
 * when a value genuinely changed. That is deliberate: raw SQL would have required setting
 * `updated_at` by hand, which is the kind of thing that silently gets forgotten.
 */

export interface LoadPhaseOptions {
  /** Directory holding `climate-normals.json` + `climate-manifest.json`. */
  inputDir: string;
}

export interface LoadPhaseResult {
  updated: number;
  unchanged: number;
}

async function readJsonFile<T>(path: string): Promise<T> {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error: unknown) {
    throw new ClimateImportError(`cannot read ${path}`, { cause: error });
  }
  try {
    return JSON.parse(contents) as T;
  } catch (error: unknown) {
    // Wrapped for the same reason the read is: an operator seeing a bare `SyntaxError` has to
    // guess WHICH of the two artifacts is corrupt.
    throw new ClimateImportError(`${path} is not valid JSON`, { cause: error });
  }
}

/**
 * Load the artifacts into `provinces.climate_normals`.
 *
 * Every entry is validated on the write path — shape first, then the decimal round-trip
 * against the manifest's raw source cells — because the artifact is what actually reaches
 * the database. Validating only at fetch time would leave the file hand-editable between
 * the two phases with nothing checking it.
 */
export async function loadClimateNormals(
  dataSource: DataSource,
  options: LoadPhaseOptions,
): Promise<LoadPhaseResult> {
  const normalsArtifact = await readJsonFile<ClimateNormalsArtifact>(
    join(options.inputDir, 'climate-normals.json'),
  );
  const manifest = await readJsonFile<ClimateManifestArtifact>(
    join(options.inputDir, 'climate-manifest.json'),
  );

  assertArtifactsCorroborate(normalsArtifact, manifest);
  const manifestByCode = new Map(manifest.entries.map((entry) => [entry.plateCode, entry]));

  // Anomalies are declared per province, so the round-trip check can tell "we deliberately
  // refused an impossible source value" from "we lost a reading" — the load phase re-runs that
  // check against the artifact and would otherwise reject our own recorded refusals.
  const anomaliesByCode = new Map<string, ClimateAnomaly[]>();
  for (const anomaly of manifest.anomalies) {
    const existing = anomaliesByCode.get(anomaly.plateCode);
    if (existing) existing.push(anomaly);
    else anomaliesByCode.set(anomaly.plateCode, [anomaly]);
  }

  // Validate EVERYTHING before writing ANYTHING: a run must not leave half the provinces
  // updated because entry 57 was malformed.
  for (const entry of normalsArtifact.entries) {
    const manifestEntry = manifestByCode.get(entry.plateCode);
    if (!manifestEntry) {
      throw new ClimateImportError(
        `${entry.plateCode}: no manifest entry (cannot verify raw values).`,
      );
    }
    assertClimateNormalsShape(entry.plateCode, entry.normals);
    assertDecimalRoundTrip(
      entry.plateCode,
      entry.normals,
      manifestEntry.rawMetricRows,
      manifestEntry.rawRecordCells,
      anomaliesByCode.get(entry.plateCode) ?? [],
    );
  }

  // Province coverage is resolved HERE, before the transaction opens, and in BOTH directions.
  //
  // It used to be detected inside the transaction loop, with the `throw` firing after
  // `dataSource.transaction(...)` had already resolved — so 80 provinces committed (bumping
  // their `updated_at`) and only then did the process exit 1. The failure was loud but
  // misleading: an operator seeing "load failed" could not assume nothing had been written,
  // which breaks the all-or-nothing model every other check in this file maintains and
  // contradicts the comment above.
  const artifactCodes = normalsArtifact.entries.map((entry) => entry.plateCode);
  const knownCodes = new Set(
    (await dataSource.getRepository(Province).find({ select: { plateCode: true } })).map(
      (province) => province.plateCode,
    ),
  );

  const missingProvinces = artifactCodes.filter((code) => !knownCodes.has(code));
  if (missingProvinces.length > 0) {
    throw new ClimateImportError(
      `the artifact covers province(s) that are not in the database: ${missingProvinces.join(', ')}. ` +
        `Run \`pnpm db:seed:geography\` first — a climate series without its province is a silent no-op.`,
    );
  }

  // The other direction, which nothing checked before: a province in the database that the
  // artifact does not cover. That is the load-side backstop for a fetch run which dropped a
  // province (its series would simply stay NULL forever, with no error at any layer). Under
  // the all-or-nothing design every seeded province gets a series, so a gap is a defect, not
  // a configuration.
  //
  // A DECLARED-unpublishable province counts as covered: the run fetched its page and recorded
  // that an impossible core value left it with no publishable series. That is a decision with an
  // audit trail, which is the opposite of the silent gap this check guards against — so it is
  // accepted here and then acted on explicitly below.
  const unpublishableCodes = new Set(
    (manifest.unpublishable ?? []).map((province) => province.plateCode),
  );
  const covered = new Set([...artifactCodes, ...unpublishableCodes]);
  const uncovered = [...knownCodes].filter((code) => !covered.has(code)).sort();
  if (uncovered.length > 0) {
    throw new ClimateImportError(
      `the artifact covers ${covered.size} of ${knownCodes.size} provinces in the database — ` +
        `missing ${uncovered.join(', ')}. A province absent from the artifact keeps a NULL ` +
        `series silently; re-run the fetch phase rather than loading a partial artifact.`,
    );
  }

  let updated = 0;
  let unchanged = 0;

  await dataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Province);

    for (const entry of normalsArtifact.entries) {
      // Re-read inside the transaction: the pre-flight `find` above proved existence, this
      // read is the one the write is based on.
      const province = await repo.findOneOrFail({ where: { plateCode: entry.plateCode } });

      // Structural comparison, ORDER-INDEPENDENT — see `canonical-json.ts`. Plain
      // `JSON.stringify` equality is wrong here: `province.climateNormals` came back through
      // Postgres `jsonb`, which re-sorts object keys, so two identical documents produced
      // different strings and every re-run rewrote all 81 rows.
      if (canonicalJson(province.climateNormals) === canonicalJson(entry.normals)) {
        unchanged += 1;
        continue;
      }

      province.climateNormals = entry.normals;
      await repo.save(province);
      updated += 1;
    }

    // Declared-unpublishable provinces are actively CLEARED, not merely skipped.
    //
    // Skipping would leave last year's series in place while the manifest says this year's run
    // refused to publish one — the database quietly disagreeing with the artifact, and a page
    // rendering a chart the current run declined to stand behind. Idempotency still holds: a
    // province already NULL is not written, so `updated_at` (and with it `dateModified` and the
    // sitemap `lastmod`) does not move on a re-run.
    for (const plateCode of unpublishableCodes) {
      const province = await repo.findOneOrFail({ where: { plateCode } });
      if (province.climateNormals === null) {
        unchanged += 1;
        continue;
      }
      province.climateNormals = null;
      await repo.save(province);
      updated += 1;
    }
  });

  return { updated, unchanged };
}
