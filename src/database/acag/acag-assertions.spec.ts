import { describe, expect, it } from '@jest/globals';
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
    provinces: PLATE_CODES.map((plateCode, index) => ({
      plateCode,
      requestedLatitude: 36 + index * 0.05,
      requestedLongitude: 32 + index * 0.05,
      latitudeIndex: 9000 + index,
      longitudeIndex: 20000 + index,
      cellLatitude: 36 + index * 0.05,
      cellLongitude: 32 + index * 0.05,
      cellDistanceKm: 0.3,
      values: YEARS.map((year) => ({ year, valueUgM3: 20 })),
    })),
    ...overrides,
  };
}

function buildFiles(): AcagFileRecord[] {
  return YEARS.map((year) => ({
    year,
    objectKey: `V6GL03/FineResolution/GL/Annual/V6GL03.CNNPM25.GL.${String(year)}01-${String(year)}12.nc`,
    url: '',
    fileName: `V6GL03.CNNPM25.GL.${String(year)}01-${String(year)}12.nc`,
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
    datasetUrl: 'https://www.satpm.org/v6-gl-03',
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
    expect(results.length).toBeGreaterThanOrEqual(7);
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
  const base = (): Parameters<typeof assertAcagLoadIsSafe>[0] => ({
    manifest: buildManifest(),
    series: buildSeries(),
    provinceRows: dbRows(),
    seriesSha256Actual: 'b'.repeat(64),
  });

  it('accepts a consistent artifact/database pair', () => {
    expect(() => assertAcagLoadIsSafe(base())).not.toThrow();
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

  it('A-03 refuses a province whose database coordinate is NULL', () => {
    const rows = dbRows();
    const [first, ...rest] = rows;
    if (first === undefined) throw new Error('unreachable');
    expect(() =>
      assertAcagLoadIsSafe({ ...base(), provinceRows: [{ ...first, latitude: null }, ...rest] }),
    ).toThrow(/A-03/);
  });
});
