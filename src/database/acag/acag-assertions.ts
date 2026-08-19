import { PM25_ABSURD_CEILING_UG_M3, PM25_ABSURD_FLOOR_UG_M3 } from './acag-extract';
import { distanceKm, distanceThresholdKm } from './acag-grid';
import { ACAG_DATASET_URL, ACAG_DATASET_VERSION } from '../../province/acag-attribution.constant';
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
 *
 * Since the review, the pin is an ALIAS of the attribution module's `ACAG_DATASET_VERSION`
 * (CODE123-I1 / SFH123-I1), which gives A-06 a second job: it is also the check binding the
 * artifact's version to the licence block the payload is served beside. An artifact carrying a
 * version this build's künye does not name cannot be loaded.
 */

export const ACAG_EXPECTED_PROVINCE_COUNT = 81;
/**
 * The pinned version, re-exported from its SINGLE source in the attribution module
 * (review CODE123-I1 / SFH123-I1). It used to be a third independent literal, so a refresh
 * could bump the artifacts while the served licence block still named the previous release.
 * The name is kept because it reads correctly at the call sites that pin an artifact.
 */
export const ACAG_PINNED_DATASET_VERSION = ACAG_DATASET_VERSION;
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
  //
  // The distance is RECOMPUTED from the four coordinates in the artifact rather than read from
  // its own `cellDistanceKm` (review CODE123-M5): this module's whole premise is that trusting a
  // recorded result means trusting a file to grade itself, and all four operands are already
  // here. A hand-edited `cellDistanceKm` now fails both the threshold check and the agreement
  // check below.
  const RECOMPUTE_TOLERANCE_KM = 1e-6;
  const disagreeing: string[] = [];
  let worst = 0;
  const farProvinces = series.provinces.filter((province) => {
    const recomputed = distanceKm(
      province.requestedLatitude,
      province.requestedLongitude,
      province.cellLatitude,
      province.cellLongitude,
    );
    worst = Math.max(worst, recomputed);
    if (Math.abs(recomputed - province.cellDistanceKm) > RECOMPUTE_TOLERANCE_KM) {
      disagreeing.push(province.plateCode);
    }
    const threshold = distanceThresholdKm(
      province.requestedLatitude,
      series.gridCellSizeDeg,
      series.gridCellSizeDeg,
    );
    return !(recomputed <= threshold);
  });
  const a04Passed = farProvinces.length === 0 && disagreeing.length === 0;
  results.push(
    result(
      'A-04',
      a04Passed,
      a04Passed
        ? `every cell is within half a cell of its province centre (worst ${worst.toFixed(3)} km, ` +
            'distances recomputed from the stored coordinates).'
        : [
            farProvinces.length > 0
              ? `beyond the threshold: ${farProvinces.map((p) => p.plateCode).join(', ')}.`
              : '',
            disagreeing.length > 0
              ? `recorded cellDistanceKm disagrees with the recomputed distance: ${disagreeing.join(', ')}.`
              : '',
          ]
            .filter((part) => part !== '')
            .join(' '),
    ),
  );

  // A-05 — every published value is a physically sane number.
  const badValues: string[] = [];
  for (const province of series.provinces) {
    for (const entry of province.values) {
      if (
        typeof entry.valueUgM3 !== 'number' ||
        !Number.isFinite(entry.valueUgM3) ||
        entry.valueUgM3 < PM25_ABSURD_FLOOR_UG_M3 ||
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
        ? `${String(valueCount)} value(s), all finite and in [${String(PM25_ABSURD_FLOOR_UG_M3)}, ` +
            `${String(PM25_ABSURD_CEILING_UG_M3)}] µg/m³.`
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
        ? `both artifacts pin ${ACAG_PINNED_DATASET_VERSION}. NOTE: in the FETCH phase this is ` +
            'tautological — the run wrote both values from this same constant. It becomes a real ' +
            'check at LOAD, against the committed files.'
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
  // The FLOOR is the point (review SFH123-I2). Written as a mismatch filter alone, this assertion
  // passes vacuously when NO file has a readable attribute — 27 nulls report exactly what 1 null
  // reports, and the manifest then records "every readable … equals the file year" after
  // comparing zero files. A-08c is the only check binding a file's CONTENT to the year it is
  // published under (the ledger's AÇIK 2), and it is gated on a nullable per-file field, so no
  // sibling assertion fences it the way A-01 fences A-04/A-05. The tolerance for an unreadable
  // attribute stays — an `h5wasm` bump could legitimately change the attribute shape — but the
  // count is now published in the detail string and a ZERO-readable run fails outright.
  const readable = manifest.files.filter((file) => file.timeCoverageAttribute !== null);
  const a08cPassed = timeCoverageMismatch.length === 0 && readable.length > 0;
  results.push(
    result(
      'A-08c',
      a08cPassed,
      timeCoverageMismatch.length > 0
        ? `TIMECOVERAGE disagrees with the file year for: ` +
            `${timeCoverageMismatch.map((f) => f.fileName).join(', ')}.`
        : readable.length === 0
          ? `NO file had a readable TIMECOVERAGE attribute (0 of ${String(manifest.files.length)}) ` +
            '— the year could not be verified against the files at all, which is what this ' +
            "assertion exists to do. Check the decoder against the provider's current " +
            'attribute layout before publishing.'
          : `${String(readable.length)} of ${String(manifest.files.length)} file(s) had a readable ` +
            'TIMECOVERAGE attribute; every one equals its file year.',
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

  // A-09 — the artifact's dataset URL must be the one this build's LICENCE BLOCK points at
  // (review CODE123-I1 / SFH123-I1).
  //
  // `pm25Annual.sourceUrl` comes from the committed manifest; the sibling
  // `pm25Annual.attribution.datasetUrl` comes from `acag-attribution.constant.ts`. Nothing else
  // reads `manifest.datasetUrl` — it was the one published string with no assertion of any kind
  // behind it — so a new artifact loaded against an old build (or the reverse) would serve one
  // object pointing at two different provider pages.
  //
  // **The VERSION half of this check is deliberately absent, and that is not an omission.**
  // `ACAG_PINNED_DATASET_VERSION` is now an alias of `ACAG_DATASET_VERSION` (the attribution
  // module's constant), so A-06 — which compares BOTH artifacts against that pin — is already the
  // binding between the artifact's version and the served licence block. A second version check
  // here would be a branch no input can reach, i.e. an assertion that can never fail and can
  // never be tested. The binding is A-06's; this comment is where a reader looking for it lands.
  if (manifest.datasetUrl !== ACAG_DATASET_URL) {
    throw new AcagLoadError(
      `the manifest's datasetUrl (${manifest.datasetUrl}) is not the URL this build publishes ` +
        `(${ACAG_DATASET_URL}). That URL is served as pm25Annual.sourceUrl, beside an ` +
        'attribution block pointing somewhere else.',
    );
  }

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
  /** `numeric(9,6)` is the column's scale; compare both sides there. See A-03 below. */
  const atColumnScale = (value: number): number => Number(value.toFixed(6));
  const byPlate = new Map(provinceRows.map((row) => [row.plateCode, row]));
  const drifted: string[] = [];
  for (const province of series.provinces) {
    const row = byPlate.get(province.plateCode);
    if (row === undefined) continue; // covered by A-02 above
    if (row.latitude === null || row.longitude === null) {
      drifted.push(`${province.plateCode} (database coordinate is NULL)`);
      continue;
    }
    // Compared AT THE COLUMN'S OWN SCALE, not bit-exactly (review CODE123-M6).
    //
    // Both sides are the same seeded decimal, but only one of them has been through
    // `numeric(9,6)`. Every current seed coordinate has at most 4 decimals, so exact equality
    // happens to hold today — and would start rejecting EVERY load the day a coordinate
    // correction carries 7+ decimals (`41.0138889` is stored as `41.013889`), blocking the line
    // over a 1e-7 round-trip difference. Six decimals is ~11 cm: far below the 0.01° (~1 km) cell
    // this line resolves, so nothing a drift check needs to catch can hide under it.
    if (
      atColumnScale(row.latitude) !== atColumnScale(province.requestedLatitude) ||
      atColumnScale(row.longitude) !== atColumnScale(province.requestedLongitude)
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
