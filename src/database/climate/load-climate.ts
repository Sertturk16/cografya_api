import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import { Province } from '../../province/entities/province.entity';
import type { ClimateManifestArtifact, ClimateNormalsArtifact } from './climate-artifact.types';
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
  /** Provinces present in the artifact but absent from the database. */
  missingProvinces: string[];
}

async function readJsonFile<T>(path: string): Promise<T> {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error: unknown) {
    throw new ClimateImportError(`cannot read ${path}`, { cause: error });
  }
  return JSON.parse(contents) as T;
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
    );
  }

  let updated = 0;
  let unchanged = 0;
  const missingProvinces: string[] = [];

  await dataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Province);

    for (const entry of normalsArtifact.entries) {
      const province = await repo.findOne({ where: { plateCode: entry.plateCode } });
      if (!province) {
        missingProvinces.push(entry.plateCode);
        continue;
      }

      // Structural comparison via canonical JSON. The artifact and the stored document are
      // both produced by this codebase from the same interface, so key order is stable.
      if (JSON.stringify(province.climateNormals) === JSON.stringify(entry.normals)) {
        unchanged += 1;
        continue;
      }

      province.climateNormals = entry.normals;
      await repo.save(province);
      updated += 1;
    }
  });

  if (missingProvinces.length > 0) {
    throw new ClimateImportError(
      `the artifact covers province(s) that are not in the database: ${missingProvinces.join(', ')}. ` +
        `Run \`pnpm db:seed:geography\` first — a climate series without its province is a silent no-op.`,
    );
  }

  return { updated, unchanged, missingProvinces };
}
