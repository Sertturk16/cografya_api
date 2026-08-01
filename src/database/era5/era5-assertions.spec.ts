import { describe, expect, it } from '@jest/globals';
import type {
  Era5Manifest,
  Era5ProvinceCellRecord,
  Era5SeriesArtifact,
} from './era5-artifact.types';
import { evaluateEra5Assertions, PRECIPITATION_REGIME_PROBES } from './era5-assertions';
import { EXPECTED_FALLBACK_PLATE_CODES } from './era5-extract';
import { ERA5_EXPECTED_MONTH_COUNT } from './era5-request';

/**
 * The gate itself is under test: a gate nobody proves can fail is decoration.
 *
 * Each case starts from a fully-passing pair and breaks exactly one thing.
 */

const PLATE_CODES = Array.from({ length: 81 }, (_unused, index) =>
  String(index + 1).padStart(2, '0'),
);

function monthLabels(): string[] {
  const labels: string[] = [];
  for (let year = 1991; year <= 2020; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      labels.push(`${String(year)}-${String(month).padStart(2, '0')}`);
    }
  }
  return labels;
}

function buildProvince(plateCode: string): Era5ProvinceCellRecord {
  const fallback = EXPECTED_FALLBACK_PLATE_CODES.includes(plateCode);
  const regime = PRECIPITATION_REGIME_PROBES.find((probe) => probe.plateCode === plateCode);
  return {
    plateCode,
    requestedLatitude: 39.9,
    requestedLongitude: 32.85,
    latIndex: 26,
    lonIndex: 73,
    cellLatitude: 39.9,
    cellLongitude: 32.9,
    fallbackUsed: fallback,
    fallbackDistanceKm: fallback ? 9.5 : 0,
    annualMeanTempC: 12.3,
    annualTotalPrecipitationMm:
      regime === undefined ? 600 : (regime.minAnnualMm + regime.maxAnnualMm) / 2,
  };
}

function buildPassingPair(): { manifest: Era5Manifest; series: Era5SeriesArtifact } {
  const labels = monthLabels();
  const series: Era5SeriesArtifact = {
    schemaVersion: 1,
    generatedAtUtc: '2026-08-02T12:00:00.000Z',
    rawFileSha256: 'a'.repeat(64),
    firstYear: 1991,
    lastYear: 2020,
    monthCount: ERA5_EXPECTED_MONTH_COUNT,
    monthLabels: labels,
    provinces: PLATE_CODES.map((plateCode) => ({
      plateCode,
      tempMeanC: Array.from({ length: ERA5_EXPECTED_MONTH_COUNT }, () => 12.3),
      precipitationMm: Array.from({ length: ERA5_EXPECTED_MONTH_COUNT }, () => 50),
    })),
  };
  const manifest: Era5Manifest = {
    schemaVersion: 1,
    generatedAtUtc: '2026-08-02T12:00:00.000Z',
    userAgent: 'test',
    baseUrl: 'https://cds.climate.copernicus.eu/api/retrieve/v1',
    datasetId: 'reanalysis-era5-land-monthly-means',
    datasetUrl: 'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-monthly-means',
    doi: '10.24381/cds.68d2bb30',
    licence: 'CC-BY-4.0',
    requiredAttribution: 'Generated using Copernicus Climate Change Service information 2026.',
    areaSent: [42.5, 25.5, 35.5, 45.0],
    productionRequestBody: {},
    decoder: {
      package: 'jsfive',
      version: '0.4.0',
      inflatePackage: 'pako',
      inflateVersion: '2.2.0',
    },
    rawFile: { name: 'x.nc', sizeBytes: 19_801_767, sha256: 'a'.repeat(64), md5: 'b'.repeat(32) },
    axes: {
      latitude: { first: 42.5, last: 35.5, step: -0.1, length: 71 },
      longitude: { first: 25.5, last: 45.0, step: 0.1, length: 196 },
    },
    months: { count: ERA5_EXPECTED_MONTH_COUNT, firstIso: '1991-01-01', lastIso: '2020-12-01' },
    expver: { distinctValues: ['0001'], count: ERA5_EXPECTED_MONTH_COUNT },
    globalAttributes: {},
    variables: [],
    mask: { maskedCells: 3392, totalCells: 13916, maskedRatio: 0.2438, timeInvariant: true },
    provinces: PLATE_CODES.map(buildProvince),
    fallbackPlateCodes: [...EXPECTED_FALLBACK_PLATE_CODES],
    jobs: [
      {
        label: 'production',
        requestBody: {},
        costing: { cost: 1440, limit: 120000 },
        jobId: 'job-1',
        cdsStamps: { created: null, started: null, finished: null },
        queueSeconds: 17.3,
        runSeconds: 83.8,
        resultHost: 'object-store.os-api.cci2.ecmwf.int',
        declaredSizeBytes: 19_801_767,
        downloadedBytes: 19_801_767,
        declaredChecksumMd5: 'b'.repeat(32),
        computedChecksumMd5: 'b'.repeat(32),
        checksumVerified: true,
        sha256: 'a'.repeat(64),
        downloadMs: 11_360,
        decodeMs: 607,
        deleted: true,
      },
    ],
    requests: [],
    totals: { requestCount: 19, downloadedBytes: 19_801_767, wallClockMs: 300_000 },
    assertions: [],
  };
  return { manifest, series };
}

const failed = (results: ReturnType<typeof evaluateEra5Assertions>): string[] =>
  results.filter((result) => !result.passed).map((result) => result.id);

describe('evaluateEra5Assertions', () => {
  it('passes a healthy pair with NOTHING failing', () => {
    const { manifest, series } = buildPassingPair();
    expect(failed(evaluateEra5Assertions({ manifest, series, apiKey: 'secret' }))).toEqual([]);
  });

  it('fails when a province is missing', () => {
    const { manifest, series } = buildPassingPair();
    expect(
      failed(
        evaluateEra5Assertions({
          manifest: { ...manifest, provinces: manifest.provinces.slice(0, 80) },
          series,
          apiKey: null,
        }),
      ),
    ).toContain('provinces-81');
  });

  it('fails when a single month is missing from ONE series — completeness is absolute', () => {
    const { manifest, series } = buildPassingPair();
    const broken = series.provinces.map((province, index) =>
      index === 0 ? { ...province, tempMeanC: province.tempMeanC.slice(0, 359) } : province,
    );
    expect(
      failed(
        evaluateEra5Assertions({
          manifest,
          series: { ...series, provinces: broken },
          apiKey: null,
        }),
      ),
    ).toContain('series-complete');
  });

  it('fails when a SIXTH province starts using the fallback', () => {
    const { manifest, series } = buildPassingPair();
    const provinces = manifest.provinces.map((province) =>
      province.plateCode === '35'
        ? { ...province, fallbackUsed: true, fallbackDistanceKm: 6 }
        : province,
    );
    const results = evaluateEra5Assertions({
      manifest: {
        ...manifest,
        provinces,
        fallbackPlateCodes: [...EXPECTED_FALLBACK_PLATE_CODES, '35'],
      },
      series,
      apiKey: null,
    });
    expect(failed(results)).toContain('fallback-set-expected');
  });

  it('fails when a fallback exceeds the 25 km ceiling', () => {
    const { manifest, series } = buildPassingPair();
    const provinces = manifest.provinces.map((province) =>
      province.plateCode === '07' ? { ...province, fallbackDistanceKm: 26 } : province,
    );
    expect(
      failed(
        evaluateEra5Assertions({ manifest: { ...manifest, provinces }, series, apiKey: null }),
      ),
    ).toContain('fallback-distance-ceiling');
  });

  it('fails when a fallback fires WITHOUT recording its distance (an undeclared shift)', () => {
    const { manifest, series } = buildPassingPair();
    const provinces = manifest.provinces.map((province) =>
      province.plateCode === '07' ? { ...province, fallbackDistanceKm: 0 } : province,
    );
    expect(
      failed(
        evaluateEra5Assertions({ manifest: { ...manifest, provinces }, series, apiKey: null }),
      ),
    ).toContain('fallback-distance-recorded');
  });

  it('fails when a province records a shift WITHOUT the flag', () => {
    const { manifest, series } = buildPassingPair();
    const provinces = manifest.provinces.map((province) =>
      province.plateCode === '35' ? { ...province, fallbackDistanceKm: 4 } : province,
    );
    expect(
      failed(
        evaluateEra5Assertions({ manifest: { ...manifest, provinces }, series, apiKey: null }),
      ),
    ).toContain('no-undeclared-drift');
  });

  it('fails when the axis directions flip', () => {
    const { manifest, series } = buildPassingPair();
    expect(
      failed(
        evaluateEra5Assertions({
          manifest: {
            ...manifest,
            axes: { ...manifest.axes, latitude: { ...manifest.axes.latitude, step: 0.1 } },
          },
          series,
          apiKey: null,
        }),
      ),
    ).toContain('axis-directions');
  });

  it('fails when ERA5T (expver 0005) is mixed in', () => {
    const { manifest, series } = buildPassingPair();
    expect(
      failed(
        evaluateEra5Assertions({
          manifest: { ...manifest, expver: { distinctValues: ['0001', '0005'], count: 360 } },
          series,
          apiKey: null,
        }),
      ),
    ).toContain('expver-uniform');
  });

  it('fails when the mask is not time-invariant', () => {
    const { manifest, series } = buildPassingPair();
    expect(
      failed(
        evaluateEra5Assertions({
          manifest: { ...manifest, mask: { ...manifest.mask, timeInvariant: false } },
          series,
          apiKey: null,
        }),
      ),
    ).toContain('mask-time-invariant');
  });

  it('fails when a job was deleted before its download verified', () => {
    const { manifest, series } = buildPassingPair();
    const jobs = manifest.jobs.map((job) => ({ ...job, checksumVerified: false }));
    expect(
      failed(evaluateEra5Assertions({ manifest: { ...manifest, jobs }, series, apiKey: null })),
    ).toContain('jobs-verified-then-deleted');
  });

  it('catches the WRONG tp multiplier by magnitude class, in both directions', () => {
    const { manifest, series } = buildPassingPair();
    // `× 1000` only: three orders of magnitude low for the wet regime.
    const tooDry = manifest.provinces.map((province) =>
      province.plateCode === '53' ? { ...province, annualTotalPrecipitationMm: 73 } : province,
    );
    expect(
      failed(
        evaluateEra5Assertions({
          manifest: { ...manifest, provinces: tooDry },
          series,
          apiKey: null,
        }),
      ),
    ).toContain('precipitation-regime-53');

    // `× 24 × days × 1000`: three orders of magnitude high for the continental regime.
    const tooWet = manifest.provinces.map((province) =>
      province.plateCode === '42' ? { ...province, annualTotalPrecipitationMm: 9024 } : province,
    );
    expect(
      failed(
        evaluateEra5Assertions({
          manifest: { ...manifest, provinces: tooWet },
          series,
          apiKey: null,
        }),
      ),
    ).toContain('precipitation-regime-42');
  });

  it('fails when key material reaches an artifact', () => {
    const { manifest, series } = buildPassingPair();
    expect(
      failed(
        evaluateEra5Assertions({
          manifest: { ...manifest, userAgent: 'leaked-key-value' },
          series,
          apiKey: 'leaked-key-value',
        }),
      ),
    ).toContain('no-key-material');
  });
});
