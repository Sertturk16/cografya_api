import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import { Province } from '../../province/entities/province.entity';
import {
  PM25_READING_POINT_PROVINCE_CENTRE,
  PM25_SOURCE_ACAG_SATPM25,
  type Pm25Annual,
} from '../../province/province.types';
import { canonicalJson } from '../climate/canonical-json';
import {
  ACAG_MANIFEST_FILE_NAME,
  ACAG_SERIES_FILE_NAME,
  type AcagManifest,
  type AcagSeriesArtifact,
} from './acag-artifact.types';
import { assertAcagLoadIsSafe } from './acag-assertions';
import { AcagLoadError } from './acag.errors';

/**
 * `--phase=load` — write the committed artifacts into `provinces.pm25_annual`.
 *
 * Offline, deterministic, idempotent, all-or-nothing. No network, ever: this is the only phase CI
 * or a deployment may run, so ACAG being unreachable can never fail a build (ENGINEERING §5).
 *
 * ## Idempotency is a PUBLISHING-HONESTY property, not an optimisation
 * A province whose stored document already equals the derived one is left untouched, so
 * `provinces.updated_at` does not move. That column feeds the page's `dateModified` and the
 * sitemap's `lastmod`; a re-run that bumped 81 rows would tell Google 81 pages changed when
 * nothing did. The comparison is {@link canonicalJson} and NOT `JSON.stringify`: the stored side
 * came back through Postgres `jsonb`, which re-sorts object keys, so two identical documents
 * serialise differently and every re-run would rewrite all 81 rows. That defect was paid for once
 * on the retired MGM line — the lesson is carried, not the code.
 *
 * ## Validate everything, then write everything or nothing
 * The whole gate (including the fidelity rule `A-03`) resolves BEFORE the transaction opens. The
 * MGM line learned this the expensive way: a check inside the transaction loop threw after 80
 * rows had already been written and their `updated_at` bumped.
 */

export interface AcagLoadOptions {
  /** Directory holding the two committed artifacts. */
  inputDir: string;
}

export interface AcagLoadResult {
  updated: number;
  unchanged: number;
}

async function readJsonFile<T>(path: string): Promise<{ parsed: T; raw: string }> {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error: unknown) {
    throw new AcagLoadError(`cannot read ${path}`, { cause: error });
  }
  try {
    return { parsed: JSON.parse(contents) as T, raw: contents };
  } catch (error: unknown) {
    // Wrapped for the same reason the read is: a bare `SyntaxError` makes an operator guess WHICH
    // of the two artifacts is corrupt.
    throw new AcagLoadError(`${path} is not valid JSON`, { cause: error });
  }
}

/**
 * Grid cell size, rounded to the precision the CONTRACT publishes (review CODE123-M1).
 *
 * The artifact keeps the raw measurement — the float32 median step, `0.009998321533203125` — and
 * that is right: the step is derived from the file's own axis and never from the provider's
 * `LAT_DELTA` claim. Publishing 18 significant digits of float32 decode noise as "the grid's cell
 * size" is the part that was wrong. Six decimals is finer than any difference between the two
 * axes' measured steps and coarser than the decode noise, so the served figure describes the grid
 * without pretending to a precision the measurement does not carry.
 *
 * Rounded HERE, at the publish boundary, rather than in the fetch phase: the committed artifact
 * stays the raw evidence, and no re-fetch is needed to change a presentation decision.
 */
export function publishedGridCellSizeDeg(measured: number): number {
  return Number(measured.toFixed(6));
}

/**
 * Build the STORED document for one province.
 *
 * Named `buildStored…` against the service's `buildServedPm25Annual` (review CODE123-M7): the two
 * sit at opposite ends of the pipeline with different signatures and different return types, and
 * a single shared name made `grep` return two unrelated hits.
 *
 * Everything published here comes from the artifact; nothing is invented at load time. The two
 * literals are the type-level tokens (`source`, `readingPoint`) whose whole purpose is to name
 * what the numbers are.
 */
export function buildStoredPm25Annual(
  series: AcagSeriesArtifact,
  province: AcagSeriesArtifact['provinces'][number],
  datasetUrl: string,
): Pm25Annual {
  return {
    source: PM25_SOURCE_ACAG_SATPM25,
    datasetVersion: series.datasetVersion,
    sourceUrl: datasetUrl,
    gridCellSizeDeg: publishedGridCellSizeDeg(series.gridCellSizeDeg),
    unit: series.unit,
    readingPoint: PM25_READING_POINT_PROVINCE_CENTRE,
    cellLatitude: province.cellLatitude,
    cellLongitude: province.cellLongitude,
    cellDistanceKm: province.cellDistanceKm,
    years: province.values.map((entry) => ({ year: entry.year, valueUgM3: entry.valueUgM3 })),
  };
}

/** Load the committed ACAG artifacts into `provinces.pm25_annual`. */
export async function loadAcagPm25(
  dataSource: DataSource,
  options: AcagLoadOptions,
): Promise<AcagLoadResult> {
  const { parsed: manifest } = await readJsonFile<AcagManifest>(
    join(options.inputDir, ACAG_MANIFEST_FILE_NAME),
  );
  const { parsed: series, raw: seriesRaw } = await readJsonFile<AcagSeriesArtifact>(
    join(options.inputDir, ACAG_SERIES_FILE_NAME),
  );

  const provinceRows = await dataSource
    .getRepository(Province)
    .find({ select: { plateCode: true, latitude: true, longitude: true } });

  assertAcagLoadIsSafe({
    manifest,
    series,
    provinceRows,
    seriesSha256Actual: createHash('sha256').update(seriesRaw, 'utf8').digest('hex'),
  });

  let updated = 0;
  let unchanged = 0;

  await dataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Province);
    for (const record of series.provinces) {
      // Re-read inside the transaction: the gate above proved existence, this read is the one the
      // write is based on.
      const province = await repo.findOneOrFail({ where: { plateCode: record.plateCode } });
      const document = buildStoredPm25Annual(series, record, manifest.datasetUrl);

      if (canonicalJson(province.pm25Annual) === canonicalJson(document)) {
        unchanged += 1;
        continue;
      }

      province.pm25Annual = document;
      await repo.save(province);
      updated += 1;
    }
  });

  return { updated, unchanged };
}
