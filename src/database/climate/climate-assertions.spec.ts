import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIMATE_SOURCE_MGM_GENERAL, type ClimateNormals } from '../../province/province.types';
import type { ClimateManifestArtifact, ClimateNormalsArtifact } from './climate-artifact.types';
import {
  assertArtifactsCorroborate,
  assertClimateNormalsShape,
  assertDecimalRoundTrip,
  findUnpublishableReason,
} from './climate-assertions';
import { parseMgmGeneralStatisticsPage, type MgmParseResult } from './mgm-parser';

const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'test', 'fixtures', 'mgm');
const SOURCE_URL =
  'https://www.mgm.gov.tr/veridegerlendirme/il-ve-ilceler-istatistik.aspx?k=A&m=ICEL';

function parseFixture(): MgmParseResult {
  const html = readFileSync(join(FIXTURE_DIR, 'k-a-icel.tables.html'), 'utf8');
  return parseMgmGeneralStatisticsPage(html, { mgmKey: 'ICEL', sourceUrl: SOURCE_URL });
}

/** Deep clone via JSON — also proves the shape survives a JSON round-trip, which is what
 * `jsonb` storage does to it anyway. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('assertDecimalRoundTrip', () => {
  it('passes on a freshly parsed page', () => {
    const parsed = parseFixture();

    expect(() =>
      assertDecimalRoundTrip('33', parsed.normals, parsed.raw.metricRows, parsed.raw.recordCells),
    ).not.toThrow();
  });

  it('CATCHES a silently truncated decimal — the defect no range check can see', () => {
    // This is the test the whole manifest exists for (PLAN.md risk #1). Simulate exactly
    // what `parseFloat("10,4")` does: keep the integer part, drop the fraction.
    const parsed = parseFixture();
    const corrupted = clone(parsed.normals);
    const target = corrupted.months.find(
      (month) => month.tempMeanC !== null && !Number.isInteger(month.tempMeanC),
    );
    expect(target).toBeDefined();
    if (target?.tempMeanC != null) target.tempMeanC = Math.trunc(target.tempMeanC);

    expect(() =>
      assertDecimalRoundTrip('33', corrupted, parsed.raw.metricRows, parsed.raw.recordCells),
    ).toThrow(/DECIMAL ROUND-TRIP FAILED/);

    // …and here is WHY the round-trip is not redundant with the range invariants: the very
    // same corrupted series sails through the ordering checks, because a truncated mean is
    // still between the min and the max. Range checks cannot substitute for this.
    expect(() => assertClimateNormalsShape('33', corrupted)).not.toThrow();
  });

  it('catches a reading that was dropped to null while the source had a value', () => {
    const parsed = parseFixture();
    const corrupted = clone(parsed.normals);
    const target = corrupted.months[0];
    expect(target).toBeDefined();
    if (target) target.tempMeanC = null;

    expect(() =>
      assertDecimalRoundTrip('33', corrupted, parsed.raw.metricRows, parsed.raw.recordCells),
    ).toThrow(/a reading was dropped/);
  });

  it('catches a corrupted record value and a corrupted record date', () => {
    const parsed = parseFixture();

    const badValue = clone(parsed.normals);
    const record = badValue.records.dailyMaxPrecipitationMm;
    expect(record).not.toBeNull();
    if (record) record.value = Math.trunc(record.value) + 1;
    expect(() =>
      assertDecimalRoundTrip('33', badValue, parsed.raw.metricRows, parsed.raw.recordCells),
    ).toThrow(/DECIMAL ROUND-TRIP FAILED/);

    const badDate = clone(parsed.normals);
    const dateRecord = badDate.records.dailyMaxPrecipitationMm;
    if (dateRecord) dateRecord.date = '1999-01-01';
    expect(() =>
      assertDecimalRoundTrip('33', badDate, parsed.raw.metricRows, parsed.raw.recordCells),
    ).toThrow(/does not re-print/);
  });
});

describe('occurrence dates — enrichment that must never cost us a reading', () => {
  it('catches a monthly occurrence date that was dropped while the source had one', () => {
    const parsed = parseFixture();
    const corrupted = clone(parsed.normals);
    const target = corrupted.months.find((month) => month.tempRecordMaxDate !== null);
    expect(target).toBeDefined();
    if (target) target.tempRecordMaxDate = null;

    expect(() =>
      assertDecimalRoundTrip('33', corrupted, parsed.raw.metricRows, parsed.raw.recordCells),
    ).toThrow(/a date was dropped/);
  });

  it('catches a monthly occurrence date that no longer re-prints to the source string', () => {
    const parsed = parseFixture();
    const corrupted = clone(parsed.normals);
    const target = corrupted.months.find((month) => month.tempRecordMinDate !== null);
    if (target) target.tempRecordMinDate = '1900-01-01';

    expect(() =>
      assertDecimalRoundTrip('33', corrupted, parsed.raw.metricRows, parsed.raw.recordCells),
    ).toThrow(/does not re-print/);
  });

  it('accepts a null date when the source printed none — and KEEPS the reading', () => {
    // The regression gate: absence of a date is MGM's omission, not our data loss.
    const parsed = parseFixture();
    const normals = clone(parsed.normals);
    const rawRows = clone(parsed.raw.metricRows).map((row) => ({
      ...row,
      rawMonthlyTitles: row.rawMonthlyTitles.map(() => ''),
    }));
    for (const month of normals.months) {
      month.tempRecordMaxDate = null;
      month.tempRecordMinDate = null;
    }

    expect(() =>
      assertDecimalRoundTrip('33', normals, rawRows, parsed.raw.recordCells),
    ).not.toThrow();
    // The readings themselves survived untouched.
    expect(normals.months.some((month) => month.tempRecordMaxC !== null)).toBe(true);
    expect(() => assertClimateNormalsShape('33', normals)).not.toThrow();
  });

  it('rejects an occurrence date standing without its reading', () => {
    const corrupted = clone(parseFixture().normals);
    const target = corrupted.months.find((month) => month.tempRecordMaxDate !== null);
    if (target) target.tempRecordMaxC = null;

    expect(() => assertClimateNormalsShape('33', corrupted)).toThrow(/without its reading/);
  });

  it('rejects a non-ISO stored occurrence date', () => {
    const corrupted = clone(parseFixture().normals);
    const target = corrupted.months.find((month) => month.tempRecordMaxDate !== null);
    if (target) target.tempRecordMaxDate = '08.01.1971';

    expect(() => assertClimateNormalsShape('33', corrupted)).toThrow(/not ISO YYYY-MM-DD/);
  });
});

describe('findUnpublishableReason — the all-or-nothing core pair', () => {
  it('accepts a complete series', () => {
    expect(findUnpublishableReason(parseFixture().normals)).toBeNull();
  });

  it('rejects a series with a gap in either core measure', () => {
    const missingTemp = clone(parseFixture().normals);
    const firstMonth = missingTemp.months[0];
    if (firstMonth) firstMonth.tempMeanC = null;
    expect(findUnpublishableReason(missingTemp)).toMatch(/core pair incomplete/);

    const missingPrecip = clone(parseFixture().normals);
    const lastMonth = missingPrecip.months[11];
    if (lastMonth) lastMonth.precipitationMm = null;
    expect(findUnpublishableReason(missingPrecip)).toMatch(/core pair incomplete/);
  });

  it('still accepts a series whose OPTIONAL measures are entirely absent', () => {
    // The extras degrade gracefully — the web drops a table column that is null in all 12
    // months. Only the core pair is all-or-nothing.
    const withoutExtras = clone(parseFixture().normals);
    for (const month of withoutExtras.months) {
      month.sunshineHours = null;
      month.rainyDays = null;
      month.tempRecordMaxC = null;
      month.tempRecordMinC = null;
    }

    expect(findUnpublishableReason(withoutExtras)).toBeNull();
  });

  it('rejects a series whose months are not 1-12 in order', () => {
    const shuffled = clone(parseFixture().normals);
    shuffled.months.reverse();

    expect(findUnpublishableReason(shuffled)).toMatch(/months must be 1-12 in order/);
  });
});

describe('assertClimateNormalsShape', () => {
  it('accepts a freshly parsed series', () => {
    expect(() => assertClimateNormalsShape('33', parseFixture().normals)).not.toThrow();
  });

  it('rejects a non-MGM source URL', () => {
    const corrupted = clone(parseFixture().normals);
    corrupted.sourceUrl = 'https://example.com/climate';

    expect(() => assertClimateNormalsShape('33', corrupted)).toThrow(/not an MGM URL/);
  });

  it('rejects a swapped min/max row', () => {
    const corrupted = clone(parseFixture().normals);
    const month = corrupted.months[0];
    if (month && month.tempMeanC !== null) month.tempMinMeanC = month.tempMeanC + 10;

    expect(() => assertClimateNormalsShape('33', corrupted)).toThrow(/above mean/);
  });

  it('rejects an impossible rainy-day count', () => {
    const corrupted = clone(parseFixture().normals);
    const month = corrupted.months[0];
    if (month) month.rainyDays = 45;

    expect(() => assertClimateNormalsShape('33', corrupted)).toThrow(/rainy days/);
  });

  it('rejects a non-ascending measurement period', () => {
    const corrupted = clone(parseFixture().normals);
    corrupted.periodEndYear = corrupted.periodStartYear;

    expect(() => assertClimateNormalsShape('33', corrupted)).toThrow(/not ascending/);
  });
});

describe('assertArtifactsCorroborate', () => {
  const GENERATED_AT = '2026-07-18T12:00:00.000Z';

  function buildArtifacts(normals: ClimateNormals): {
    normalsArtifact: ClimateNormalsArtifact;
    manifest: ClimateManifestArtifact;
  } {
    const parsed = parseFixture();
    return {
      normalsArtifact: {
        generatedAtUtc: GENERATED_AT,
        source: CLIMATE_SOURCE_MGM_GENERAL,
        entries: [{ plateCode: '33', normals }],
      },
      manifest: {
        generatedAtUtc: GENERATED_AT,
        source: CLIMATE_SOURCE_MGM_GENERAL,
        userAgent: 'CografyaPlatformBot/1.0',
        anomalies: [],
        entries: [
          {
            plateCode: '33',
            mgmKey: 'ICEL',
            mgmNameTr: 'Mersin',
            url: SOURCE_URL,
            fetchedAtUtc: GENERATED_AT,
            httpStatus: 200,
            pageSha256: 'x'.repeat(64),
            periodStartYear: normals.periodStartYear,
            periodEndYear: normals.periodEndYear,
            rawMetricRows: parsed.raw.metricRows,
            rawRecordCells: parsed.raw.recordCells,
          },
        ],
      },
    };
  }

  it('accepts two artifacts from the same run', () => {
    const { normalsArtifact, manifest } = buildArtifacts(parseFixture().normals);

    expect(() => assertArtifactsCorroborate(normalsArtifact, manifest)).not.toThrow();
  });

  it('rejects artifacts from different runs', () => {
    // Otherwise the raw cells the round-trip check trusts would not belong to the values
    // being written, and the check would be theatre.
    const { normalsArtifact, manifest } = buildArtifacts(parseFixture().normals);
    manifest.generatedAtUtc = '2026-07-19T12:00:00.000Z';

    expect(() => assertArtifactsCorroborate(normalsArtifact, manifest)).toThrow(/different runs/);
  });

  it('rejects a province present in the normals but absent from the manifest', () => {
    const { normalsArtifact, manifest } = buildArtifacts(parseFixture().normals);
    manifest.entries = [];

    expect(() => assertArtifactsCorroborate(normalsArtifact, manifest)).toThrow(
      /absent from the manifest/,
    );
  });

  it('rejects a period disagreement between the two artifacts', () => {
    const { normalsArtifact, manifest } = buildArtifacts(parseFixture().normals);
    const entry = manifest.entries[0];
    if (entry) entry.periodStartYear += 1;

    expect(() => assertArtifactsCorroborate(normalsArtifact, manifest)).toThrow(
      /disagrees with the series/,
    );
  });

  it('rejects duplicate plate codes', () => {
    const { normalsArtifact, manifest } = buildArtifacts(parseFixture().normals);
    const entry = normalsArtifact.entries[0];
    if (entry) normalsArtifact.entries.push(entry);

    expect(() => assertArtifactsCorroborate(normalsArtifact, manifest)).toThrow(
      /duplicate plate codes/,
    );
  });

  it('rejects a manifest entry with no matching series (the other direction)', () => {
    // The normals→manifest direction was already covered; this is its mirror. An extra
    // manifest entry means either the two files came from different runs or a province was
    // dropped from the normals after the fact — the second is exactly the omission this
    // pair of files is supposed to be able to see.
    const { normalsArtifact, manifest } = buildArtifacts(parseFixture().normals);
    const entry = manifest.entries[0];
    if (entry) manifest.entries.push({ ...entry, plateCode: '34' });

    expect(() => assertArtifactsCorroborate(normalsArtifact, manifest)).toThrow(
      /present in climate-manifest.json but absent from climate-normals.json/,
    );
  });
});

describe('the round-trip covers stored values, not only raw rows', () => {
  it('rejects a stored value whose metric has no raw row to be checked against', () => {
    // The round-trip iterates the RAW rows, so before this check a value whose manifest row
    // was deleted was never re-printed, never compared, and passed. Given the module's own
    // threat model — the artifact is hand-editable between the two phases — that was the
    // seam the design exists to close.
    const parsed = parseFixture();
    const withoutSunshine = parsed.raw.metricRows.filter(
      (row) => row.label !== 'Ortalama Güneşlenme Süresi (saat)',
    );
    expect(withoutSunshine.length).toBe(parsed.raw.metricRows.length - 1);

    expect(() =>
      assertDecimalRoundTrip('33', parsed.normals, withoutSunshine, parsed.raw.recordCells),
    ).toThrow(/carry values but the manifest holds no raw source row/);
  });

  it('rejects a missing raw record cell, whose whole column would otherwise escape the check', () => {
    const parsed = parseFixture();
    const withoutSnow = parsed.raw.recordCells.filter((cell) => cell.field !== 'maxSnowDepthCm');

    expect(() =>
      assertDecimalRoundTrip('33', parsed.normals, parsed.raw.metricRows, withoutSnow),
    ).toThrow(/no raw cell for record column/);
  });

  it('does NOT demand a raw row for a metric that is null in all 12 months', () => {
    // Coverage is required of values, not of fields: MGM legitimately omits whole rows for
    // some stations, and demanding a raw row for a field that carries nothing would turn a
    // normal page into a failed import.
    const parsed = parseFixture();
    const normals = clone(parsed.normals);
    for (const month of normals.months) month.sunshineHours = null;
    const withoutSunshine = parsed.raw.metricRows.filter(
      (row) => row.label !== 'Ortalama Güneşlenme Süresi (saat)',
    );

    expect(() =>
      assertDecimalRoundTrip('33', normals, withoutSunshine, parsed.raw.recordCells),
    ).not.toThrow();
  });
});

describe('record plausibility', () => {
  it('rejects a negative record magnitude', () => {
    // Rainfall, wind speed and snow depth are magnitudes. The monthly values were
    // range-checked; the records were not, so a sign flip had no cheap check at all.
    const normals = clone(parseFixture().normals);
    normals.records.dailyMaxPrecipitationMm = { value: -1, date: null };

    expect(() => assertClimateNormalsShape('33', normals)).toThrow(/negative magnitude/);
  });
});
