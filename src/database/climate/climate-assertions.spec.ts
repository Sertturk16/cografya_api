import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIMATE_SOURCE_MGM_GENERAL, type ClimateNormals } from '../../province/province.types';
import type { ClimateManifestArtifact, ClimateNormalsArtifact } from './climate-artifact.types';
import {
  CORE_PAIR_FIELDS,
  assertArtifactsCorroborate,
  assertClimateNormalsShape,
  assertDecimalRoundTrip,
  findUnpublishableReason,
} from './climate-assertions';
import {
  METRIC_ROW_LABELS,
  RECORD_COLUMNS,
  parseMgmGeneralStatisticsPage,
  type MgmParseResult,
  type MgmRawMetricRow,
} from './mgm-parser';

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

  /**
   * The artifact is hand-editable between the two phases, and the served payload is built as
   * `{ ...normals, derived }` — so a key added here is a key SERVED, outside every DTO and
   * outside `openapi.json`. Nothing downstream can catch it: the DTOs only `implements` the
   * interfaces and the response is a plain object, so there is no serializer whitelist in the
   * path. The load assertion is the boundary that can still refuse it.
   */
  describe('unknown/missing keys', () => {
    it('REFUSES a key hand-added to the series root — it would reach the public payload', () => {
      const corrupted = clone(parseFixture().normals) as unknown as Record<string, unknown>;
      corrupted.internalNote = 'not part of the contract';

      expect(() => assertClimateNormalsShape('33', corrupted as unknown as ClimateNormals)).toThrow(
        /unknown key\(s\) "internalNote"/,
      );
    });

    it('REFUSES a key hand-added to a single month — nested keys ride the same spread', () => {
      const corrupted = clone(parseFixture().normals);
      const month = corrupted.months[0] as unknown as Record<string, unknown>;
      month.humidityPct = 61;

      expect(() => assertClimateNormalsShape('33', corrupted)).toThrow(
        /months\[0\] carries unknown key\(s\) "humidityPct"/,
      );
    });

    it('REFUSES a key hand-added to `records` and to a single record object', () => {
      const withExtraRecords = clone(parseFixture().normals);
      (withExtraRecords.records as unknown as Record<string, unknown>).hottestDayC = 41.5;
      expect(() => assertClimateNormalsShape('33', withExtraRecords)).toThrow(
        /"records" carries unknown key\(s\) "hottestDayC"/,
      );

      const withExtraRecordField = clone(parseFixture().normals);
      const record = Object.values(withExtraRecordField.records).find((value) => value !== null);
      expect(record).toBeDefined();
      (record as unknown as Record<string, unknown>).station = 'ICEL';
      expect(() => assertClimateNormalsShape('33', withExtraRecordField)).toThrow(
        /carries unknown key\(s\) "station"/,
      );
    });

    it('REFUSES a DELETED key — the contract promises a value or an explicit null', () => {
      const corrupted = clone(parseFixture().normals);
      const month = corrupted.months[0] as unknown as Record<string, unknown>;
      delete month.sunshineHours;

      expect(() => assertClimateNormalsShape('33', corrupted)).toThrow(
        /months\[0\] is missing key\(s\) "sunshineHours"/,
      );
    });

    it('REFUSES a DELETED key at the other three levels too, and names the level', () => {
      // Symmetry with the unknown-key direction above, which is exercised at all four levels.
      // The `missing` half is one shared branch, but the EXPECTED list is passed per call site,
      // so a call site wired to the wrong array — or dropped entirely — only shows up level by
      // level. `sourceUrl` is chosen deliberately at the root: a later check would also reject
      // its absence, with `not an MGM URL`, so this pins that the key set is verified FIRST and
      // the operator is told which key is gone rather than which rule tripped over it.
      const withoutSourceUrl = clone(parseFixture().normals) as unknown as Record<string, unknown>;
      delete withoutSourceUrl.sourceUrl;
      expect(() =>
        assertClimateNormalsShape('33', withoutSourceUrl as unknown as ClimateNormals),
      ).toThrow(/the series is missing key\(s\) "sourceUrl"/);

      const withoutRecordColumn = clone(parseFixture().normals);
      delete (withoutRecordColumn.records as unknown as Record<string, unknown>).maxSnowDepthCm;
      expect(() => assertClimateNormalsShape('33', withoutRecordColumn)).toThrow(
        /"records" is missing key\(s\) "maxSnowDepthCm"/,
      );

      const withoutRecordDate = clone(parseFixture().normals);
      expect(withoutRecordDate.records.dailyMaxPrecipitationMm).not.toBeNull();
      delete (
        withoutRecordDate.records.dailyMaxPrecipitationMm as unknown as Record<string, unknown>
      ).date;
      expect(() => assertClimateNormalsShape('33', withoutRecordDate)).toThrow(
        /records\.dailyMaxPrecipitationMm is missing key\(s\) "date"/,
      );
    });

    it('accepts the parsed series unchanged — the rule matches what the parser produces', () => {
      // The guard is only useful if the honest path satisfies it; a check the real data cannot
      // pass would just be deleted by the next engineer.
      expect(() => assertClimateNormalsShape('33', parseFixture().normals)).not.toThrow();
    });
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

  it('REGRESSION (PR #65 C1): rejects a page fetched AFTER the run was stamped', () => {
    // The defect this PR shipped and review caught: the artifact's `generatedAtUtc` was captured
    // BEFORE a ~70-minute loop, so it necessarily preceded every `fetchedAtUtc` and the two
    // fields could describe different sessions with nothing objecting. Stamping the artifact
    // when the run FINISHES makes this a real invariant; this is the one-line check that turns
    // it into a CI failure instead of something a reviewer has to notice.
    const { normalsArtifact, manifest } = buildArtifacts(parseFixture().normals);
    const entry = manifest.entries[0];
    if (entry === undefined) throw new Error('malformed fixture');
    entry.fetchedAtUtc = '2026-07-18T12:00:01.000Z';

    expect(() => assertArtifactsCorroborate(normalsArtifact, manifest)).toThrow(
      /AFTER the artifact's generatedAtUtc/,
    );
  });

  it('does NOT require fetchedAtUtc to be ordered — a resumable harvest is legitimate', () => {
    // Deliberately not asserted. Monotonicity is a property of one transport strategy (a single
    // serial pass), not of the data: the committed artifact's stamps are genuine and out of
    // alphabetical order because the harvest ran in resumable batches. An assertion honest data
    // cannot satisfy has only two outcomes, and both are worse than no assertion — rewriting
    // real timestamps, or deleting the check.
    const { normalsArtifact, manifest } = buildArtifacts(parseFixture().normals);
    const entry = manifest.entries[0];
    if (entry === undefined) throw new Error('malformed fixture');
    entry.fetchedAtUtc = '2026-07-18T11:00:00.000Z';

    expect(() => assertArtifactsCorroborate(normalsArtifact, manifest)).not.toThrow();
  });

  it('rejects an unparseable provenance stamp instead of comparing NaN', () => {
    const { normalsArtifact, manifest } = buildArtifacts(parseFixture().normals);
    const entry = manifest.entries[0];
    if (entry === undefined) throw new Error('malformed fixture');
    entry.fetchedAtUtc = 'last tuesday';

    expect(() => assertArtifactsCorroborate(normalsArtifact, manifest)).toThrow(/ISO-8601/);
  });

  it('rejects a manifest with no anomalies array — with a NAMED error, not a TypeError', () => {
    // The consumer iterates `manifest.anomalies` directly. A file predating the field, a bad
    // merge or a hand-edit produced a bare `TypeError: not iterable`, which tells an operator
    // nothing about which of the two artifacts is wrong.
    const { normalsArtifact, manifest } = buildArtifacts(parseFixture().normals);
    const withoutAnomalies = { ...manifest } as Partial<ClimateManifestArtifact>;
    delete withoutAnomalies.anomalies;

    expect(() =>
      assertArtifactsCorroborate(normalsArtifact, withoutAnomalies as ClimateManifestArtifact),
    ).toThrow(/no "anomalies" array/);
  });

  const PRECIPITATION_LABEL = 'Aylık Toplam Yağış Miktarı Ortalaması (mm)';

  /**
   * Withhold `33` the way a real run does: refuse an impossible CORE value, drop the series, and
   * leave BOTH the anomaly and the negative raw cell behind as evidence.
   */
  function withholdProvince(manifest: ClimateManifestArtifact): void {
    const entry = manifest.entries[0];
    if (entry === undefined) throw new Error('malformed fixture');
    const row = entry.rawMetricRows.find((candidate) => candidate.label === PRECIPITATION_LABEL);
    if (row === undefined) throw new Error('fixture has no precipitation row');

    row.rawMonthlyCells[0] = '-5,0';
    manifest.anomalies = [
      {
        plateCode: entry.plateCode,
        sourceLabel: 'Aylık Toplam Yağış Miktarı Ortalaması',
        field: 'precipitationMm',
        month: 1,
        rawCell: '-5',
        reason: 'a negative precipitationMm is physically impossible',
      },
    ];
    manifest.unpublishable = [
      { plateCode: entry.plateCode, reason: 'core pair incomplete: precipitationMm[1]' },
    ];
  }

  it('accepts a withheld province when a verified core anomaly stands behind it', () => {
    // The ruled outcome for an impossible CORE value: the province is fetched, recorded and
    // deliberately not published. Its manifest entry has no counterpart in the normals, which
    // would otherwise read as a dropped province.
    const { normalsArtifact, manifest } = buildArtifacts(parseFixture().normals);
    normalsArtifact.entries.pop();
    withholdProvince(manifest);

    expect(() => assertArtifactsCorroborate(normalsArtifact, manifest)).not.toThrow();
  });

  it('REFUSES a withheld province with no anomaly behind it — the declaration is evidence-free', () => {
    // The defect the fix for I1 introduced: `unpublishable[]` suppresses the coverage check that
    // exists to catch a silently dropped province, and structural validation alone made
    // membership sufficient. Append one line, delete the province from the normals, and a
    // genuinely dropped province passes — and has its stored series actively cleared.
    const { normalsArtifact, manifest } = buildArtifacts(parseFixture().normals);
    const dropped = normalsArtifact.entries.pop();
    if (dropped === undefined) throw new Error('malformed fixture');
    manifest.unpublishable = [
      { plateCode: dropped.plateCode, reason: 'core pair incomplete: precipitationMm[1]' },
    ];

    expect(() => assertArtifactsCorroborate(normalsArtifact, manifest)).toThrow(
      /no anomaly on a core field/,
    );
  });

  it('REFUSES a withheld province whose supporting anomaly names a good reading', () => {
    // One level deeper: the declaration cites an anomaly, but that anomaly is itself a lie. The
    // chain has to terminate at MGM's own string, not at another claim.
    const { normalsArtifact, manifest } = buildArtifacts(parseFixture().normals);
    normalsArtifact.entries.pop();
    withholdProvince(manifest);
    const entry = manifest.entries[0];
    const row = entry?.rawMetricRows.find((candidate) => candidate.label === PRECIPITATION_LABEL);
    if (row === undefined) throw new Error('fixture has no precipitation row');
    row.rawMonthlyCells[0] = '117,5'; // the source cell restored to a perfectly good reading

    expect(() => assertArtifactsCorroborate(normalsArtifact, manifest)).toThrow(
      /not an impossible value/,
    );
  });

  it('REFUSES a withheld province supported only by a NON-core anomaly', () => {
    // A refused snow record does not empty the core pair, so it cannot justify withholding a
    // province. This is the "anomaly-induced only" narrowing — which previously existed solely in
    // the fetch phase, the phase that does not write.
    const { normalsArtifact, manifest } = buildArtifacts(parseFixture().normals);
    const dropped = normalsArtifact.entries.pop();
    if (dropped === undefined) throw new Error('malformed fixture');
    manifest.anomalies = [
      {
        plateCode: dropped.plateCode,
        sourceLabel: 'En Yüksek Kar',
        field: 'maxSnowDepthCm',
        month: null,
        rawCell: '-1 cm',
        reason: 'a negative En Yüksek Kar is physically impossible',
      },
    ];
    manifest.unpublishable = [
      { plateCode: dropped.plateCode, reason: 'core pair incomplete: precipitationMm[1]' },
    ];

    expect(() => assertArtifactsCorroborate(normalsArtifact, manifest)).toThrow(
      /no anomaly on a core field/,
    );
  });

  it('rejects a province that is declared unpublishable AND published', () => {
    const { normalsArtifact, manifest } = buildArtifacts(parseFixture().normals);
    withholdProvince(manifest);

    expect(() => assertArtifactsCorroborate(normalsArtifact, manifest)).toThrow(
      /contradicts itself/,
    );
  });

  it('rejects an unpublishable declaration with no provenance behind it', () => {
    // An unpublishable province is one we DID fetch and chose not to publish. Declaring one we
    // never fetched would let the coverage check be silenced by assertion rather than evidence.
    const { normalsArtifact, manifest } = buildArtifacts(parseFixture().normals);
    manifest.unpublishable = [{ plateCode: '06', reason: 'core pair incomplete' }];

    expect(() => assertArtifactsCorroborate(normalsArtifact, manifest)).toThrow(
      /no manifest entry/,
    );
  });

  it('CORE_PAIR_FIELDS agrees with what findUnpublishableReason actually enforces, BOTH ways', () => {
    // The two live in one file now, but they are still two expressions of one rule, and
    // `CORE_PAIR_FIELDS` is what the load phase uses to decide whether a withheld province is
    // justified. Pinned mechanically rather than by comment.
    //
    // Swept over EVERY metric field rather than over `CORE_PAIR_FIELDS` alone, so the pin holds in
    // both directions. A single canary would catch a bad ADDITION to the set but not the reverse:
    // if `findUnpublishableReason` ever started requiring a third measure and the set were not
    // updated, a one-directional test stays green while the two rules have silently diverged —
    // and the load phase would then accept a withholding the fetch phase would never produce.
    for (const field of Object.values(METRIC_ROW_LABELS)) {
      const normals = clone(parseFixture().normals);
      for (const month of normals.months) month[field] = null;

      const isCore = CORE_PAIR_FIELDS.has(field);
      expect({ field, unpublishable: findUnpublishableReason(normals) !== null }).toEqual({
        field,
        unpublishable: isCore,
      });
    }

    // Guards the sweep itself: an empty or core-only field list would make the above vacuous.
    expect(Object.values(METRIC_ROW_LABELS).length).toBeGreaterThan(CORE_PAIR_FIELDS.size);
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

/**
 * The anomaly list disables the decimal round-trip — this module's strongest check, and the only
 * one that can see a reading silently dropped to null. Treated as an ALLOWLIST it was a hole the
 * size of the whole defence: the manifest is hand-editable between the two phases (that is this
 * module's own stated threat model), so appending one line to `anomalies` and nulling the
 * matching value would publish a `null` where MGM printed a real number, with nothing objecting.
 *
 * These tests pin the fix: a declaration is a CLAIM about the source, honoured only when the raw
 * cell it names really does hold an impossible value.
 */
describe('anomaly declarations are verified against the source, not trusted', () => {
  /** The raw source row backing a given field, for tests that need to edit it. */
  function rawRowFor(parsed: MgmParseResult, label: string): MgmRawMetricRow {
    const row = parsed.raw.metricRows.find((candidate) => candidate.label === label);
    if (row === undefined) throw new Error(`fixture has no "${label}" row`);
    return row;
  }

  const SUNSHINE_LABEL = 'Ortalama Güneşlenme Süresi (saat)';

  it('HONOURS an anomaly whose source cell really is impossible — and skips the round-trip', () => {
    // The anomaly-CONSUMING branch, which no test drove before: none of the 81 committed
    // provinces has a monthly anomaly, so every real-data test exercised only the record-level
    // bypass. A key-format mismatch between where the anomaly is created and where it is looked
    // up would therefore have surfaced on the day MGM first published a negative monthly value —
    // precisely the scenario the mechanism exists for.
    const parsed = parseFixture();
    const normals = clone(parsed.normals);
    const rawRows = clone(parsed.raw.metricRows);
    const row = rawRows.find((candidate) => candidate.label === SUNSHINE_LABEL);
    if (row === undefined) throw new Error('fixture has no sunshine row');

    row.rawMonthlyCells[2] = '-3,1';
    const march = normals.months[2];
    if (march === undefined) throw new Error('fixture has no March');
    march.sunshineHours = null;

    expect(() =>
      assertDecimalRoundTrip('33', normals, rawRows, parsed.raw.recordCells, [
        {
          sourceLabel: 'Ortalama Güneşlenme Süresi',
          field: 'sunshineHours',
          month: 3,
          rawCell: '-3,1',
          reason: 'a negative sunshineHours is physically impossible',
        },
      ]),
    ).not.toThrow();
  });

  it('REFUSES a fabricated anomaly whose source cell holds a perfectly good reading', () => {
    // The attack the allowlist permitted, in full: null a real value, append one line, and the
    // load phase writes `null` to Postgres indistinguishably from a genuine MGM gap.
    const parsed = parseFixture();
    const normals = clone(parsed.normals);
    const march = normals.months[2];
    if (march === undefined) throw new Error('fixture has no March');
    // The source cell is left EXACTLY as MGM printed it — only the declaration is a lie.
    march.sunshineHours = null;

    expect(() =>
      assertDecimalRoundTrip('33', normals, parsed.raw.metricRows, parsed.raw.recordCells, [
        {
          sourceLabel: 'Ortalama Güneşlenme Süresi',
          field: 'sunshineHours',
          month: 3,
          rawCell: 'fabricated',
          reason: 'fabricated',
        },
      ]),
    ).toThrow(/not an impossible value/);
  });

  it('REFUSES an anomaly on a field that has no impossible-value rule', () => {
    // `tempMinMeanC` and `tempMaxMeanC` were the most exposed fields of all: the ordering
    // invariant short-circuits to PASS the moment either is null, so nothing anywhere objected.
    // A negative temperature is an ordinary January, so no anomaly can ever be justified on one.
    const parsed = parseFixture();
    const normals = clone(parsed.normals);
    const march = normals.months[2];
    if (march === undefined) throw new Error('fixture has no March');
    march.tempMinMeanC = null;

    expect(() =>
      assertDecimalRoundTrip('33', normals, parsed.raw.metricRows, parsed.raw.recordCells, [
        {
          sourceLabel: 'Ortalama En Düşük Sıcaklık',
          field: 'tempMinMeanC',
          month: 3,
          rawCell: '-2,0',
          reason: 'fabricated',
        },
      ]),
    ).toThrow(/no impossible-value rule/);
  });

  it('REFUSES an anomaly declared alongside a value that IS published', () => {
    // An anomaly exempts a cell from the round-trip. Declared over a live value it would exempt
    // a real number from the only check that can see it truncated — the T3 trap, re-opened.
    const parsed = parseFixture();
    const normals = clone(parsed.normals);
    const rawRows = clone(parsed.raw.metricRows);
    const row = rawRows.find((candidate) => candidate.label === SUNSHINE_LABEL);
    if (row === undefined) throw new Error('fixture has no sunshine row');
    row.rawMonthlyCells[2] = '-3,1';

    expect(() =>
      assertDecimalRoundTrip('33', normals, rawRows, parsed.raw.recordCells, [
        {
          sourceLabel: 'Ortalama Güneşlenme Süresi',
          field: 'sunshineHours',
          month: 3,
          rawCell: '-3,1',
          reason: 'fabricated',
        },
      ]),
    ).toThrow(/IS published/);
  });

  it('REFUSES an anomaly naming a field the manifest holds no raw row for', () => {
    const parsed = parseFixture();
    const normals = clone(parsed.normals);
    for (const month of normals.months) month.sunshineHours = null;
    const withoutSunshine = parsed.raw.metricRows.filter(
      (candidate) => candidate.label !== SUNSHINE_LABEL,
    );

    expect(() =>
      assertDecimalRoundTrip('33', normals, withoutSunshine, parsed.raw.recordCells, [
        {
          sourceLabel: 'Ortalama Güneşlenme Süresi',
          field: 'sunshineHours',
          month: 3,
          rawCell: '-3,1',
          reason: 'fabricated',
        },
      ]),
    ).toThrow(/no raw source row/);
  });

  it('REFUSES a fabricated RECORD anomaly, the shape the real committed one takes', () => {
    const parsed = parseFixture();
    const normals = clone(parsed.normals);
    normals.records.dailyMaxPrecipitationMm = null;

    expect(() =>
      assertDecimalRoundTrip('33', normals, parsed.raw.metricRows, parsed.raw.recordCells, [
        {
          sourceLabel: 'Günlük Toplam En Yüksek Yağış Miktarı',
          field: 'dailyMaxPrecipitationMm',
          month: null,
          rawCell: 'fabricated',
          reason: 'fabricated',
        },
      ]),
    ).toThrow(/not an impossible value/);
  });

  it('HONOURS a record anomaly whose source cell is genuinely negative', () => {
    const parsed = parseFixture();
    const normals = clone(parsed.normals);
    const rawCells = clone(parsed.raw.recordCells);
    const cell = rawCells.find((candidate) => candidate.field === 'maxSnowDepthCm');
    if (cell === undefined) throw new Error('fixture has no snow record cell');
    cell.rawValue = '-1 cm';
    cell.rawDate = '15.02.2004';
    normals.records.maxSnowDepthCm = null;

    expect(() =>
      assertDecimalRoundTrip('33', normals, parsed.raw.metricRows, rawCells, [
        {
          sourceLabel: 'En Yüksek Kar',
          field: 'maxSnowDepthCm',
          month: null,
          rawCell: '-1 cm (2004-02-15)',
          reason: 'a negative En Yüksek Kar is physically impossible',
        },
      ]),
    ).not.toThrow();
  });

  it('REFUSES an anomaly naming a month outside 1-12', () => {
    const parsed = parseFixture();
    const normals = clone(parsed.normals);

    expect(() =>
      assertDecimalRoundTrip('33', normals, parsed.raw.metricRows, parsed.raw.recordCells, [
        {
          sourceLabel: 'Ortalama Güneşlenme Süresi',
          field: 'sunshineHours',
          month: 13,
          rawCell: '-1',
          reason: 'fabricated',
        },
      ]),
    ).toThrow(/not 1-12/);
  });

  it('the sunshine row exists in the fixture — otherwise the tests above are vacuous', () => {
    expect(rawRowFor(parseFixture(), SUNSHINE_LABEL).rawMonthlyCells).toHaveLength(12);
  });
});

describe('record plausibility', () => {
  it('every record column states its impossible-value rule explicitly', () => {
    // The monthly sweep was always an allowlist; the record sweep was a blanket rule. MGM
    // publishes `En Düşük Sıcaklık`, so the day a temperature record joins this table a blanket
    // rule would silently null every legitimate sub-zero record. Requiring the flag per column
    // makes adding one a decision that cannot be made by omission.
    for (const column of RECORD_COLUMNS) {
      expect(typeof column.nonNegative).toBe('boolean');
    }
  });

  it('rejects a negative record magnitude', () => {
    // Rainfall, wind speed and snow depth are magnitudes. The monthly values were
    // range-checked; the records were not, so a sign flip had no cheap check at all.
    const normals = clone(parseFixture().normals);
    normals.records.dailyMaxPrecipitationMm = { value: -1, date: null };

    expect(() => assertClimateNormalsShape('33', normals)).toThrow(/negative magnitude/);
  });
});
