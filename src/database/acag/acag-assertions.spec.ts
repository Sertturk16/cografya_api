import { describe, expect, it } from '@jest/globals';
import { distanceKm } from './acag-grid';
import { acagFileNameForYear, acagObjectKeyForYear } from './acag-fetch';
import { ACAG_DATASET_URL, ACAG_DATASET_VERSION } from '../../province/acag-attribution.constant';
import {
  ACAG_EXPECTED_FIRST_YEAR,
  ACAG_EXPECTED_LAST_YEAR,
  ACAG_PINNED_DATASET_VERSION,
  assertAcagLoadIsSafe,
  assertAllPassed,
  runAcagStructuralAssertions,
} from './acag-assertions';
import {
  ACAG_ARTIFACT_SCHEMA_VERSION,
  type AcagFileRecord,
  type AcagManifest,
  type AcagSeriesArtifact,
} from './acag-artifact.types';
import { AcagLoadError } from './acag.errors';

const YEARS = Array.from(
  { length: ACAG_EXPECTED_LAST_YEAR - ACAG_EXPECTED_FIRST_YEAR + 1 },
  (_, index) => ACAG_EXPECTED_FIRST_YEAR + index,
);

const PLATE_CODES = Array.from({ length: 81 }, (_, index) => String(index + 1).padStart(2, '0'));

function buildSeries(overrides: Partial<AcagSeriesArtifact> = {}): AcagSeriesArtifact {
  return {
    schemaVersion: ACAG_ARTIFACT_SCHEMA_VERSION,
    datasetVersion: ACAG_PINNED_DATASET_VERSION,
    unit: 'µg/m3',
    gridCellSizeDeg: 0.01,
    years: [...YEARS],
    // The fixture is SELF-CONSISTENT on purpose: A-04 now recomputes the haversine from the four
    // stored coordinates (review CODE123-M5), so a hand-written `cellDistanceKm` that its own
    // coordinates do not produce is a failure — as it should be.
    provinces: PLATE_CODES.map((plateCode, index) => {
      const requestedLatitude = 36 + index * 0.05;
      const requestedLongitude = 32 + index * 0.05;
      const cellLatitude = requestedLatitude + 0.002;
      const cellLongitude = requestedLongitude + 0.002;
      return {
        plateCode,
        requestedLatitude,
        requestedLongitude,
        latitudeIndex: 9000 + index,
        longitudeIndex: 20000 + index,
        cellLatitude,
        cellLongitude,
        cellDistanceKm: distanceKm(
          requestedLatitude,
          requestedLongitude,
          cellLatitude,
          cellLongitude,
        ),
        values: YEARS.map((year) => ({ year, valueUgM3: 20 })),
      };
    }),
    ...overrides,
  };
}

function buildFiles(): AcagFileRecord[] {
  // Derived exactly as production derives them (review CODE123R2-M7): hardcoded `V6GL03`
  // literals here would keep naming the old release after a version bump, so the fixture would
  // stop describing what the code builds.
  return YEARS.map((year) => ({
    year,
    objectKey: acagObjectKeyForYear(year),
    url: '',
    fileName: acagFileNameForYear(year),
    bytes: 450_000_000,
    sha256: 'a'.repeat(64),
    timeCoverageAttribute: String(year),
    downloadMs: 1,
    decodeMs: 1,
    rawDeleted: true,
  }));
}

function buildManifest(overrides: Partial<AcagManifest> = {}): AcagManifest {
  return {
    schemaVersion: ACAG_ARTIFACT_SCHEMA_VERSION,
    generatedAtUtc: '2026-08-19T00:00:00.000Z',
    sourceMode: 'download',
    userAgent: 'cografya-platform/1.0',
    datasetVersion: ACAG_PINNED_DATASET_VERSION,
    datasetUrl: ACAG_DATASET_URL,
    licenceName: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/?ref=chooser-v1',
    bucketBaseUrl: 'http://satpmdata.s3.amazonaws.com',
    decoder: { package: 'h5wasm', version: '0.10.3' },
    window: {
      fullLatitudeLength: 13000,
      fullLongitudeLength: 36000,
      rowOffset: 9529,
      columnOffset: 20529,
      rowCount: 742,
      columnCount: 1992,
      latitudeStep: 0.01,
      longitudeStep: 0.01,
      latitudeFirst: 35.295,
      latitudeLast: 42.705,
      longitudeFirst: 25.295,
      longitudeLast: 45.205,
    },
    files: buildFiles(),
    seriesSha256: 'b'.repeat(64),
    assertions: [],
    ...overrides,
  };
}

const dbRows = (): { plateCode: string; latitude: number | null; longitude: number | null }[] =>
  PLATE_CODES.map((plateCode, index) => ({
    plateCode,
    latitude: 36 + index * 0.05,
    longitude: 32 + index * 0.05,
  }));

function idsOf(results: ReturnType<typeof runAcagStructuralAssertions>, passed: boolean): string[] {
  return results.filter((entry) => entry.passed === passed).map((entry) => entry.id);
}

describe('runAcagStructuralAssertions', () => {
  it('passes a well-formed pair of artifacts', () => {
    const results = runAcagStructuralAssertions({
      manifest: buildManifest(),
      series: buildSeries(),
    });
    expect(idsOf(results, false)).toEqual([]);
    // The EXACT count, not a floor (review TEST123-M4): a floor of 7 let the whole A-08a block be
    // deleted with every remaining assertion still green.
    expect(results).toHaveLength(8);
    expect(results.map((entry) => entry.id)).toEqual([
      'A-01',
      'A-04',
      'A-05',
      'A-06',
      'A-07',
      'A-08a',
      'A-08b',
      'A-08c',
    ]);
  });

  it('A-01 fails when a province is missing', () => {
    const series = buildSeries();
    const results = runAcagStructuralAssertions({
      manifest: buildManifest(),
      series: { ...series, provinces: series.provinces.slice(0, 80) },
    });
    expect(idsOf(results, false)).toContain('A-01');
  });

  it('A-04 fails when a cell is farther than half a cell from its province centre', () => {
    const series = buildSeries();
    const [first, ...rest] = series.provinces;
    if (first === undefined) throw new Error('unreachable');
    const results = runAcagStructuralAssertions({
      manifest: buildManifest(),
      series: { ...series, provinces: [{ ...first, cellDistanceKm: 40 }, ...rest] },
    });
    expect(idsOf(results, false)).toContain('A-04');
  });

  it('A-05 fails on a non-sane value', () => {
    const series = buildSeries();
    const [first, ...rest] = series.provinces;
    if (first === undefined) throw new Error('unreachable');
    const results = runAcagStructuralAssertions({
      manifest: buildManifest(),
      series: {
        ...series,
        provinces: [{ ...first, values: [{ year: 2024, valueUgM3: -1 }] }, ...rest],
      },
    });
    expect(idsOf(results, false)).toContain('A-05');
  });

  /**
   * The version pin is not bookkeeping: the provider recalibrates the WHOLE series per version, so
   * a mixed-version series would publish a trend that no single dataset supports.
   */
  it('A-06 fails when the artifacts disagree on the dataset version', () => {
    const results = runAcagStructuralAssertions({
      manifest: buildManifest(),
      series: buildSeries({ datasetVersion: 'V6.GL.02.04' }),
    });
    expect(idsOf(results, false)).toContain('A-06');
  });

  it('A-07 fails when a province is missing a year', () => {
    const series = buildSeries();
    const [first, ...rest] = series.provinces;
    if (first === undefined) throw new Error('unreachable');
    const results = runAcagStructuralAssertions({
      manifest: buildManifest(),
      series: { ...series, provinces: [{ ...first, values: first.values.slice(1) }, ...rest] },
    });
    expect(idsOf(results, false)).toContain('A-07');
  });

  it('A-08a fails when an artifact declares a schema version this build cannot read', () => {
    const results = runAcagStructuralAssertions({
      manifest: buildManifest({
        schemaVersion: (ACAG_ARTIFACT_SCHEMA_VERSION + 1) as typeof ACAG_ARTIFACT_SCHEMA_VERSION,
      }),
      series: buildSeries(),
    });
    expect(idsOf(results, false)).toContain('A-08a');
  });

  /**
   * A-07 is a conjunction of three independent sub-conditions and only the per-province one had a
   * negative test (review TEST123-M5) — either of the other two could be deleted with the suite
   * still green.
   */
  it('A-07 fails when the manifest is missing a YEAR FILE', () => {
    const results = runAcagStructuralAssertions({
      manifest: buildManifest({ files: buildFiles().slice(1) }),
      series: buildSeries(),
    });
    expect(idsOf(results, false)).toContain('A-07');
  });

  it('A-07 fails when the series year set is short', () => {
    const results = runAcagStructuralAssertions({
      manifest: buildManifest(),
      series: buildSeries({ years: YEARS.slice(1) }),
    });
    expect(idsOf(results, false)).toContain('A-07');
  });

  /**
   * The A-08c FLOOR (review SFH123-I2). One unreadable attribute is tolerated; ALL of them
   * unreadable means the year was never verified against the files at all, which is the one thing
   * this assertion exists to do.
   */
  it('A-08c FAILS when no file has a readable TIMECOVERAGE attribute', () => {
    const results = runAcagStructuralAssertions({
      manifest: buildManifest({
        files: buildFiles().map((file) => ({ ...file, timeCoverageAttribute: null })),
      }),
      series: buildSeries(),
    });
    expect(idsOf(results, false)).toContain('A-08c');
    const detail = results.find((entry) => entry.id === 'A-08c')?.detail ?? '';
    expect(detail).toMatch(/NO file had a readable/);
  });

  it('A-08c states HOW MANY files it actually verified', () => {
    const files = buildFiles();
    const [first, ...rest] = files;
    if (first === undefined) throw new Error('unreachable');
    const results = runAcagStructuralAssertions({
      manifest: buildManifest({ files: [{ ...first, timeCoverageAttribute: null }, ...rest] }),
      series: buildSeries(),
    });
    const entry = results.find((item) => item.id === 'A-08c');
    expect(entry?.passed).toBe(true);
    // The count is what distinguishes 26-of-27 verified from 0-of-27 verified.
    expect(entry?.detail).toMatch(/26 of 27/);
  });

  /**
   * A-04 recomputes the haversine rather than re-reading the artifact's own number
   * (review CODE123-M5) — a hand-edited `cellDistanceKm` is now caught.
   */
  it('A-04 fails when the recorded cellDistanceKm disagrees with the coordinates', () => {
    const series = buildSeries();
    const [first, ...rest] = series.provinces;
    if (first === undefined) throw new Error('unreachable');
    const results = runAcagStructuralAssertions({
      manifest: buildManifest(),
      series: { ...series, provinces: [{ ...first, cellDistanceKm: 0.0001 }, ...rest] },
    });
    expect(idsOf(results, false)).toContain('A-04');
    expect(results.find((entry) => entry.id === 'A-04')?.detail).toMatch(/disagrees/);
  });

  it('A-05 fails on a value below the plausibility FLOOR (a ÷1000 unit change)', () => {
    const series = buildSeries();
    const [first, ...rest] = series.provinces;
    if (first === undefined) throw new Error('unreachable');
    const results = runAcagStructuralAssertions({
      manifest: buildManifest(),
      series: {
        ...series,
        provinces: [{ ...first, values: [{ year: 2024, valueUgM3: 0.02 }] }, ...rest],
      },
    });
    expect(idsOf(results, false)).toContain('A-05');
  });

  it('A-08b fails when a file record has no real SHA-256', () => {
    const files = buildFiles();
    const [first, ...rest] = files;
    if (first === undefined) throw new Error('unreachable');
    const results = runAcagStructuralAssertions({
      manifest: buildManifest({ files: [{ ...first, sha256: 'not-a-hash' }, ...rest] }),
      series: buildSeries(),
    });
    expect(idsOf(results, false)).toContain('A-08b');
  });

  /** The ledger's AÇIK 2: the year is verified against the FILE, not the provider's page. */
  it('A-08c fails when TIMECOVERAGE disagrees with the file year', () => {
    const files = buildFiles();
    const [first, ...rest] = files;
    if (first === undefined) throw new Error('unreachable');
    const results = runAcagStructuralAssertions({
      manifest: buildManifest({ files: [{ ...first, timeCoverageAttribute: '1066' }, ...rest] }),
      series: buildSeries(),
    });
    expect(idsOf(results, false)).toContain('A-08c');
  });

  it('A-08c PASSES when the attribute was unreadable (null), without claiming agreement', () => {
    const files = buildFiles();
    const [first, ...rest] = files;
    if (first === undefined) throw new Error('unreachable');
    const results = runAcagStructuralAssertions({
      manifest: buildManifest({ files: [{ ...first, timeCoverageAttribute: null }, ...rest] }),
      series: buildSeries(),
    });
    expect(idsOf(results, false)).not.toContain('A-08c');
  });
});

describe('assertAllPassed', () => {
  it('names every failure, not just the first', () => {
    expect(() =>
      assertAllPassed(
        [
          { id: 'A-01', passed: false, detail: 'one' },
          { id: 'A-05', passed: false, detail: 'two' },
        ],
        'test',
      ),
    ).toThrow(/A-01[\s\S]*A-05/);
  });

  it('is silent when everything passed', () => {
    expect(() =>
      assertAllPassed([{ id: 'A-01', passed: true, detail: 'ok' }], 'test'),
    ).not.toThrow();
  });
});

describe('assertAcagLoadIsSafe', () => {
  /**
   * The gate now reconciles the manifest's RECORDED assertion block against a fresh computation
   * (A-10, review SFH123R2-I1), so a consistent fixture must carry the recorded block too.
   */
  const consistentManifest = (): AcagManifest => {
    const manifest = buildManifest();
    return {
      ...manifest,
      assertions: runAcagStructuralAssertions({ manifest, series: buildSeries() }),
    };
  };

  const base = (): Parameters<typeof assertAcagLoadIsSafe>[0] => ({
    manifest: consistentManifest(),
    series: buildSeries(),
    provinceRows: dbRows(),
    seriesSha256Actual: 'b'.repeat(64),
  });

  it('accepts a consistent artifact/database pair', () => {
    expect(() => assertAcagLoadIsSafe(base())).not.toThrow();
  });

  /**
   * A-10 — the committed evidence must describe the gate that is running (review SFH123R2-I1).
   *
   * This matters beyond bookkeeping: A-08c's floor tolerates SOME unreadable attributes, so what
   * distinguishes "1 of 27 verified" from "27 of 27" is the recorded detail STRING. A stale string
   * can tell a reviewer the year was verified against every file when it was verified against one.
   */
  it('refuses a manifest whose recorded assertion DETAIL no longer matches the gate', () => {
    const manifest = consistentManifest();
    const [first, ...rest] = manifest.assertions;
    if (first === undefined) throw new Error('unreachable');
    expect(() =>
      assertAcagLoadIsSafe({
        ...base(),
        manifest: {
          ...manifest,
          assertions: [
            { ...first, detail: 'every readable TIMECOVERAGE attribute equals…' },
            ...rest,
          ],
        },
      }),
    ).toThrow(/no longer describes this build's gate/);
  });

  it('refuses a hand-set passed: true in the recorded block', () => {
    // The marine precedent's own test: a recorded `passed` that disagrees with the recomputation
    // must be unloadable, or the file grades itself.
    const manifest = consistentManifest();
    const doctored = manifest.assertions.map((entry) =>
      entry.id === 'A-01' ? { ...entry, passed: false } : entry,
    );
    expect(() =>
      assertAcagLoadIsSafe({ ...base(), manifest: { ...manifest, assertions: doctored } }),
    ).toThrow(/no longer describes this build's gate/);
  });

  it('refuses a manifest that records an assertion this build no longer computes', () => {
    const manifest = consistentManifest();
    expect(() =>
      assertAcagLoadIsSafe({
        ...base(),
        manifest: {
          ...manifest,
          assertions: [...manifest.assertions, { id: 'A-99', passed: true, detail: 'gone' }],
        },
      }),
    ).toThrow(/no longer computes it/);
  });

  it('refuses a manifest with an EMPTY recorded block', () => {
    const manifest = consistentManifest();
    expect(() =>
      assertAcagLoadIsSafe({ ...base(), manifest: { ...manifest, assertions: [] } }),
    ).toThrow(/absent from the manifest/);
  });

  it('A-08 refuses a series file edited after the fetch run', () => {
    expect(() => assertAcagLoadIsSafe({ ...base(), seriesSha256Actual: 'c'.repeat(64) })).toThrow(
      /SHA-256/,
    );
  });

  it('A-02 refuses an artifact covering a province the database does not have', () => {
    expect(() => assertAcagLoadIsSafe({ ...base(), provinceRows: dbRows().slice(0, 80) })).toThrow(
      /absent from the database/,
    );
  });

  it('A-02 refuses an artifact that does not cover every province in the database', () => {
    const series = buildSeries();
    expect(() =>
      assertAcagLoadIsSafe({
        ...base(),
        series: { ...series, provinces: series.provinces.slice(0, 80) },
      }),
    ).toThrow(AcagLoadError);
  });

  /**
   * THE FIDELITY RULE (ENGINEERING §5). A seed correction to a province centre leaves every
   * structural invariant intact while the published value silently describes the old point. This
   * is the only check that can see it.
   */
  it('A-03 refuses when a province centre moved in the seed after extraction', () => {
    const rows = dbRows();
    const [first, ...rest] = rows;
    if (first === undefined) throw new Error('unreachable');
    expect(() =>
      assertAcagLoadIsSafe({
        ...base(),
        provinceRows: [{ ...first, latitude: (first.latitude ?? 0) + 0.5 }, ...rest],
      }),
    ).toThrow(/FIDELITY RULE \(A-03\)/);
  });

  /**
   * A-09 — the artifact's provenance must agree with the licence block it is served beside
   * (review CODE123-I1 / SFH123-I1). Single-sourcing the constants makes them agree when
   * everything is rebuilt together; this catches the case it cannot — a new artifact against an
   * old build, or the reverse.
   */
  it('refuses an artifact whose version disagrees with the served attribution block', () => {
    // A-06 is the binding: its pin is an alias of the attribution module's constant, so an
    // artifact naming a version this build's künye does not name cannot load.
    expect(() =>
      assertAcagLoadIsSafe({ ...base(), series: buildSeries({ datasetVersion: 'V6.GL.04' }) }),
    ).toThrow(/A-06/);
  });

  it('binds the version pin to the SAME constant the served attribution block publishes', () => {
    // The single-sourcing itself, asserted rather than assumed (review CODE123-I1 / SFH123-I1).
    expect(ACAG_PINNED_DATASET_VERSION).toBe(ACAG_DATASET_VERSION);
  });

  it('refuses a manifest whose datasetUrl is not the URL this build publishes', () => {
    expect(() =>
      assertAcagLoadIsSafe({
        ...base(),
        // Consistent recorded block, so A-10 does not fire first and mask the URL check.
        manifest: { ...consistentManifest(), datasetUrl: `${ACAG_DATASET_URL}-stale` },
      }),
    ).toThrow(/is not the URL this build publishes/);
  });

  it('accepts the manifest URL the attribution block actually publishes', () => {
    // The positive half: the fixture's URL is the constant, not a literal that happens to match.
    expect(buildManifest().datasetUrl).toBe(ACAG_DATASET_URL);
  });

  /**
   * A-03 compares at the column's own scale (review CODE123-M6): a 7-decimal seed coordinate
   * must not block every load over a `numeric(9,6)` round-trip difference.
   */
  it('A-03 tolerates a difference below the column scale, and still catches a real drift', () => {
    const rows = dbRows();
    const [first, ...rest] = rows;
    if (first === undefined) throw new Error('unreachable');
    expect(() =>
      assertAcagLoadIsSafe({
        ...base(),
        provinceRows: [{ ...first, latitude: (first.latitude ?? 0) + 1e-8 }, ...rest],
      }),
    ).not.toThrow();
    expect(() =>
      assertAcagLoadIsSafe({
        ...base(),
        provinceRows: [{ ...first, latitude: (first.latitude ?? 0) + 1e-4 }, ...rest],
      }),
    ).toThrow(/FIDELITY RULE \(A-03\)/);
  });

  it('A-03 refuses a province whose database coordinate is NULL', () => {
    const rows = dbRows();
    const [first, ...rest] = rows;
    if (first === undefined) throw new Error('unreachable');
    expect(() =>
      assertAcagLoadIsSafe({ ...base(), provinceRows: [{ ...first, latitude: null }, ...rest] }),
    ).toThrow(/A-03/);
  });
});
