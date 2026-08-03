import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import { Province } from '../../province/entities/province.entity';
import { canonicalJson } from '../climate/canonical-json';
import type { Era5Manifest, Era5SeriesArtifact } from './era5-artifact.types';
import { assertEra5LoadIsSafe, Era5LoadError } from './era5-load-assertions';
import { computeEra5Normals } from './era5-normals';

/**
 * `--phase=load` — derive the 30-year normals from the COMMITTED artifacts and write them.
 * Offline, deterministic, idempotent, all-or-nothing. No network, ever.
 *
 * This is the only phase CI or a deployment may run, and it is offline by construction: Copernicus
 * being down can never fail a build (ENGINEERING §5 — the two phases are never collapsed).
 *
 * ## Idempotency is a PUBLISHING-HONESTY property, not an optimisation
 * A province whose stored series already equals the derived one is left completely untouched — no
 * write, so `provinces.updated_at` does not move. That column is what the province page's
 * `dateModified` and the sitemap `lastmod` are built from. A re-run that bumped 81 `updated_at`
 * values would tell Google that 81 pages changed when nothing did.
 *
 * The comparison uses {@link canonicalJson}, and plain `JSON.stringify` would be WRONG here: the
 * stored value came back through Postgres `jsonb`, which re-sorts object keys, so two identical
 * documents serialise to different strings and every re-run rewrites all 81 rows. That defect was
 * paid for once on the retired MGM line; the lesson is carried, not the code.
 *
 * Writes go through the TypeORM repository rather than raw SQL so `@UpdateDateColumn` moves
 * exactly when a value genuinely changed, instead of depending on somebody remembering to set
 * `updated_at` by hand.
 *
 * ## Validate everything, then write everything or nothing
 * The entire gate (`era5-load-assertions.ts`) and both coverage directions are resolved BEFORE the
 * transaction opens. On the MGM line this was learned the expensive way: coverage was detected
 * inside the transaction loop and the throw fired after the transaction had already committed, so
 * 80 provinces were written — and their `updated_at` bumped — before the run reported failure.
 *
 * ## There is no "unpublishable province" class on this line
 * ERA5-Land is a uniform global reanalysis grid: every province's cell exists, and the five whose
 * administrative point falls in the sea read a declared nearest LAND cell (A-1), which is a
 * recorded shift and not a gap. So the MGM loader's withhold-and-clear branch is not carried over.
 * Its replacement is stricter: 81 of 81 must be derivable, or the run stops having written
 * nothing (SPEC §5.3).
 *
 * ## Statement size, against the pool-wide 30 s `statement_timeout`
 * The write is 81 INDEPENDENT single-row updates, each carrying one ~730-byte jsonb document
 * (measured on the committed artifact) — roughly 59 KB in total across the whole run. There is
 * deliberately no bulk/multi-row statement here: the per-row read-compare-write loop is what makes
 * the idempotency skip possible at all, and it also keeps every statement three orders of
 * magnitude away from the pool ceiling `data-source-options.ts` documents. Nothing in this file
 * needs a raised timeout, and nothing in it should ever grow into a single statement that would.
 */

export const ERA5_MANIFEST_FILE_NAME = 'era5-manifest.json';
export const ERA5_SERIES_FILE_NAME = 'era5-province-series.json';

export interface Era5LoadOptions {
  /** Directory holding the two committed artifacts. */
  inputDir: string;
}

export interface Era5LoadResult {
  updated: number;
  unchanged: number;
}

async function readJsonFile<T>(path: string): Promise<T> {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error: unknown) {
    throw new Era5LoadError(`cannot read ${path}`, { cause: error });
  }
  try {
    return JSON.parse(contents) as T;
  } catch (error: unknown) {
    // Wrapped for the same reason the read is: an operator seeing a bare `SyntaxError` has to
    // guess WHICH of the two artifacts is corrupt.
    throw new Era5LoadError(`${path} is not valid JSON`, { cause: error });
  }
}

/** Load the committed ERA5-Land artifacts into `provinces.climate_normals`. */
export async function loadEra5ClimateNormals(
  dataSource: DataSource,
  options: Era5LoadOptions,
): Promise<Era5LoadResult> {
  const manifest = await readJsonFile<Era5Manifest>(
    join(options.inputDir, ERA5_MANIFEST_FILE_NAME),
  );
  const series = await readJsonFile<Era5SeriesArtifact>(
    join(options.inputDir, ERA5_SERIES_FILE_NAME),
  );

  // Derive first: the gate needs the documents it is going to judge.
  const { normalsByPlateCode, annualChecks } = computeEra5Normals(series);
  assertEra5LoadIsSafe({ manifest, series, normalsByPlateCode, annualChecks });

  // Coverage against the DATABASE, in BOTH directions, before the transaction opens.
  const knownCodes = new Set(
    (await dataSource.getRepository(Province).find({ select: { plateCode: true } })).map(
      (province) => province.plateCode,
    ),
  );
  const missingFromDatabase = [...normalsByPlateCode.keys()]
    .filter((code) => !knownCodes.has(code))
    .sort();
  if (missingFromDatabase.length > 0) {
    throw new Era5LoadError(
      `the artifact covers province(s) that are not in the database: ` +
        `${missingFromDatabase.join(', ')}. Run \`pnpm db:seed:geography\` first — a climate ` +
        `series without its province is a silent no-op.`,
    );
  }
  // The other direction: a province in the database the artifact does not cover would keep a NULL
  // series forever with no error at any layer. Under the all-or-nothing design that is a defect.
  const uncovered = [...knownCodes].filter((code) => !normalsByPlateCode.has(code)).sort();
  if (uncovered.length > 0) {
    throw new Era5LoadError(
      `the artifact covers ${String(normalsByPlateCode.size)} of ${String(knownCodes.size)} ` +
        `provinces in the database — missing ${uncovered.join(', ')}. A province absent from the ` +
        `artifact keeps a NULL series silently; re-run the fetch phase rather than loading a ` +
        `partial artifact.`,
    );
  }

  let updated = 0;
  let unchanged = 0;

  await dataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Province);

    for (const [plateCode, normals] of normalsByPlateCode) {
      // Re-read inside the transaction: the pre-flight `find` above proved existence, this read is
      // the one the write is based on.
      const province = await repo.findOneOrFail({ where: { plateCode } });

      // Structural, ORDER-INDEPENDENT comparison — see the module docblock.
      if (canonicalJson(province.climateNormals) === canonicalJson(normals)) {
        unchanged += 1;
        continue;
      }

      province.climateNormals = normals;
      await repo.save(province);
      updated += 1;
    }
  });

  return { updated, unchanged };
}
