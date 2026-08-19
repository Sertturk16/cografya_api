import { PM25_ABSURD_CEILING_UG_M3 } from './acag-extract';
import { distanceThresholdKm } from './acag-grid';
import type { AcagAssertionResult, AcagManifest, AcagSeriesArtifact } from './acag-artifact.types';
import { ACAG_ARTIFACT_SCHEMA_VERSION } from './acag-artifact.types';
import { AcagLoadError } from './acag.errors';

/**
 * The machine-checked gate, `A-01`…`A-08` (plan §6.3).
 *
 * It runs TWICE on purpose: the fetch phase embeds the results in the manifest so a reviewer can
 * read them in the diff, and the load phase re-runs the same functions against the committed
 * files before it opens a transaction. Trusting the recorded results would mean trusting a file
 * to grade itself.
 *
 * **The version pin.** `V6.GL.03` is not a preference here: the provider recalibrated the whole
 * time series for this version ("for the entire time series", its own page), so a series mixing
 * versions is a fabricated trend. `A-06` is what makes that unshippable rather than merely
 * discouraged.
 */

export const ACAG_EXPECTED_PROVINCE_COUNT = 81;
export const ACAG_PINNED_DATASET_VERSION = 'V6.GL.03';
export const ACAG_EXPECTED_FIRST_YEAR = 1998;
export const ACAG_EXPECTED_LAST_YEAR = 2024;

function result(id: string, passed: boolean, detail: string): AcagAssertionResult {
  return { id, passed, detail };
}

export interface AcagStructuralInput {
  manifest: Pick<AcagManifest, 'datasetVersion' | 'files' | 'schemaVersion'>;
  series: AcagSeriesArtifact;
}

/**
 * `A-01`, `A-04`…`A-08` — everything provable from the two artifacts alone, with no database.
 *
 * Returns results rather than throwing so the fetch phase can write them into the manifest even
 * when one fails; {@link assertAllPassed} is what turns a failure into a stop.
 */
export function runAcagStructuralAssertions(input: AcagStructuralInput): AcagAssertionResult[] {
  const { manifest, series } = input;
  const results: AcagAssertionResult[] = [];

  // A-01 — completeness.
  results.push(
    result(
      'A-01',
      series.provinces.length === ACAG_EXPECTED_PROVINCE_COUNT,
      `${String(series.provinces.length)} province record(s) (expected ` +
        `${String(ACAG_EXPECTED_PROVINCE_COUNT)}).`,
    ),
  );

  // A-04 — every cell sits within half a cell diagonal of its province centre.
  const farProvinces = series.provinces.filter((province) => {
    const threshold = distanceThresholdKm(
      province.requestedLatitude,
      series.gridCellSizeDeg,
      series.gridCellSizeDeg,
    );
    return !(province.cellDistanceKm <= threshold);
  });
  const worst = series.provinces.reduce(
    (max, province) => Math.max(max, province.cellDistanceKm),
    0,
  );
  results.push(
    result(
      'A-04',
      farProvinces.length === 0,
      farProvinces.length === 0
        ? `every cell is within half a cell of its province centre (worst ${worst.toFixed(3)} km).`
        : `province(s) beyond the threshold: ${farProvinces.map((p) => p.plateCode).join(', ')}.`,
    ),
  );

  // A-05 — every published value is a physically sane number.
  const badValues: string[] = [];
  for (const province of series.provinces) {
    for (const entry of province.values) {
      if (
        typeof entry.valueUgM3 !== 'number' ||
        !Number.isFinite(entry.valueUgM3) ||
        entry.valueUgM3 <= 0 ||
        entry.valueUgM3 > PM25_ABSURD_CEILING_UG_M3
      ) {
        badValues.push(`${province.plateCode}/${String(entry.year)}`);
      }
    }
  }
  const valueCount = series.provinces.reduce((sum, p) => sum + p.values.length, 0);
  results.push(
    result(
      'A-05',
      badValues.length === 0,
      badValues.length === 0
        ? `${String(valueCount)} value(s), all finite and in (0, ${String(PM25_ABSURD_CEILING_UG_M3)}] µg/m³.`
        : `non-sane value(s): ${badValues.slice(0, 10).join(', ')}.`,
    ),
  );

  // A-06 — one dataset version, everywhere.
  const versionMatches =
    manifest.datasetVersion === ACAG_PINNED_DATASET_VERSION &&
    series.datasetVersion === ACAG_PINNED_DATASET_VERSION;
  results.push(
    result(
      'A-06',
      versionMatches,
      versionMatches
        ? `both artifacts pin ${ACAG_PINNED_DATASET_VERSION}.`
        : `manifest="${manifest.datasetVersion}", series="${series.datasetVersion}", expected ` +
            `"${ACAG_PINNED_DATASET_VERSION}" — a mixed-version series is a fabricated trend.`,
    ),
  );

  // A-07 — the year set is contiguous, ascending, complete, and identical on every province.
  const expectedYears: number[] = [];
  for (let year = ACAG_EXPECTED_FIRST_YEAR; year <= ACAG_EXPECTED_LAST_YEAR; year += 1) {
    expectedYears.push(year);
  }
  const yearsMatch =
    series.years.length === expectedYears.length &&
    series.years.every((year, index) => year === expectedYears[index]);
  const provincesWithWrongYears = series.provinces.filter(
    (province) =>
      province.values.length !== series.years.length ||
      province.values.some((entry, index) => entry.year !== series.years[index]),
  );
  const fileYears = [...manifest.files.map((file) => file.year)].sort((a, b) => a - b);
  const filesMatch =
    fileYears.length === expectedYears.length &&
    fileYears.every((year, index) => year === expectedYears[index]);
  results.push(
    result(
      'A-07',
      yearsMatch && provincesWithWrongYears.length === 0 && filesMatch,
      yearsMatch && provincesWithWrongYears.length === 0 && filesMatch
        ? `${String(series.years.length)} year(s), ${String(ACAG_EXPECTED_FIRST_YEAR)}-` +
            `${String(ACAG_EXPECTED_LAST_YEAR)}, identical on all provinces and files.`
        : `year set mismatch (series=${String(series.years.length)}, files=` +
            `${String(fileYears.length)}, provinces off=${String(provincesWithWrongYears.length)}).`,
    ),
  );

  // A-08a — schema versions the load phase knows how to read.
  const schemaOk =
    manifest.schemaVersion === ACAG_ARTIFACT_SCHEMA_VERSION &&
    series.schemaVersion === ACAG_ARTIFACT_SCHEMA_VERSION;
  results.push(
    result(
      'A-08a',
      schemaOk,
      schemaOk
        ? `both artifacts declare schema v${String(ACAG_ARTIFACT_SCHEMA_VERSION)}.`
        : 'schema version mismatch between the artifacts and this code.',
    ),
  );

  // Every file carries a hash, and the file's own year agrees with the name it was fetched under.
  const hashless = manifest.files.filter((file) => !/^[0-9a-f]{64}$/.test(file.sha256));
  results.push(
    result(
      'A-08b',
      hashless.length === 0,
      hashless.length === 0
        ? `${String(manifest.files.length)} file(s), each with a SHA-256.`
        : `file(s) without a valid SHA-256: ${hashless.map((f) => f.fileName).join(', ')}.`,
    ),
  );

  // The ledger's AÇIK 2: the year is verified against the FILE, not the provider's page.
  const timeCoverageMismatch = manifest.files.filter(
    (file) =>
      file.timeCoverageAttribute !== null &&
      file.timeCoverageAttribute.trim() !== String(file.year),
  );
  results.push(
    result(
      'A-08c',
      timeCoverageMismatch.length === 0,
      timeCoverageMismatch.length === 0
        ? 'every readable TIMECOVERAGE attribute equals the file year.'
        : `TIMECOVERAGE disagrees with the file year for: ` +
            `${timeCoverageMismatch.map((f) => f.fileName).join(', ')}.`,
    ),
  );

  return results;
}

/** Turn a failed assertion into a stop, naming every failure rather than the first. */
export function assertAllPassed(results: readonly AcagAssertionResult[], phase: string): void {
  const failed = results.filter((entry) => !entry.passed);
  if (failed.length > 0) {
    throw new AcagLoadError(
      `${phase}: ${String(failed.length)} assertion(s) failed —\n` +
        failed.map((entry) => `  ${entry.id}: ${entry.detail}`).join('\n'),
    );
  }
}

export interface AcagLoadGateInput {
  manifest: AcagManifest;
  series: AcagSeriesArtifact;
  /** The province rows as they exist in the database right now. */
  provinceRows: readonly { plateCode: string; latitude: number | null; longitude: number | null }[];
  /** SHA-256 recomputed from the series file on disk. */
  seriesSha256Actual: string;
}

/**
 * The load-phase gate: the structural assertions, plus the three that need the database
 * (`A-02`, `A-03`) or the file on disk (`A-08`).
 *
 * `A-03` is this line's **fidelity rule** (ENGINEERING §5). Range and ordering invariants cannot
 * see that a value belongs to a point the seed has since corrected; comparing the artifact's
 * `requested*` coordinates against the live province row can. A mismatch means the artifact is
 * stale, not that the database is wrong — so the fix is a re-fetch, and the message says so.
 */
export function assertAcagLoadIsSafe(input: AcagLoadGateInput): void {
  const { manifest, series, provinceRows, seriesSha256Actual } = input;

  assertAllPassed(runAcagStructuralAssertions({ manifest, series }), 'load gate');

  // A-08 — the series file is the one the fetch phase produced.
  if (manifest.seriesSha256 !== seriesSha256Actual) {
    throw new AcagLoadError(
      `the series artifact's SHA-256 (${seriesSha256Actual}) does not match the manifest's ` +
        `(${manifest.seriesSha256}). The artifact was edited after the fetch run; re-run ` +
        '`--phase=fetch` rather than loading a file whose provenance is broken.',
    );
  }

  // A-02 — coverage in BOTH directions, before anything is written.
  const dbCodes = new Set(provinceRows.map((row) => row.plateCode));
  const artifactCodes = new Set(series.provinces.map((province) => province.plateCode));
  const missingFromDatabase = [...artifactCodes].filter((code) => !dbCodes.has(code)).sort();
  if (missingFromDatabase.length > 0) {
    throw new AcagLoadError(
      `the artifact covers province(s) absent from the database: ` +
        `${missingFromDatabase.join(', ')}. Run \`pnpm db:seed:geography\` first — a series ` +
        'without its province is a silent no-op.',
    );
  }
  const uncovered = [...dbCodes].filter((code) => !artifactCodes.has(code)).sort();
  if (uncovered.length > 0) {
    throw new AcagLoadError(
      `the artifact covers ${String(artifactCodes.size)} of ${String(dbCodes.size)} provinces ` +
        `in the database — missing ${uncovered.join(', ')}. A province absent from the artifact ` +
        'would keep a NULL value silently; re-run the fetch phase.',
    );
  }

  // A-03 — the fidelity rule.
  const byPlate = new Map(provinceRows.map((row) => [row.plateCode, row]));
  const drifted: string[] = [];
  for (const province of series.provinces) {
    const row = byPlate.get(province.plateCode);
    if (row === undefined) continue; // covered by A-02 above
    if (row.latitude === null || row.longitude === null) {
      drifted.push(`${province.plateCode} (database coordinate is NULL)`);
      continue;
    }
    // Exact equality is right here: both sides are the SAME seeded decimal, not a computation.
    if (
      row.latitude !== province.requestedLatitude ||
      row.longitude !== province.requestedLongitude
    ) {
      drifted.push(
        `${province.plateCode} (artifact ${String(province.requestedLatitude)},` +
          `${String(province.requestedLongitude)} vs database ${String(row.latitude)},` +
          `${String(row.longitude)})`,
      );
    }
  }
  if (drifted.length > 0) {
    throw new AcagLoadError(
      `FIDELITY RULE (A-03): ${String(drifted.length)} province(s) were extracted against a ` +
        `coordinate the database no longer holds — ${drifted.slice(0, 5).join('; ')}. The ` +
        'published value would describe the wrong point. Re-run `--phase=fetch` against the ' +
        'current seed.',
    );
  }
}
