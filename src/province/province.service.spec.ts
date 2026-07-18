import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { buildClimate } from './province.service';
import {
  CLIMATE_SOURCE_MGM_GENERAL,
  type ClimateMonthlyNormal,
  type ClimateNormals,
} from './province.types';

/**
 * Pure, DB-free coverage of `buildClimate` — the composition `ProvinceService.toDetail` uses to
 * decide "does this province render a climate section?". Its docblock claims it is exported for
 * exactly this test, and the branch that most matters is the DEFENSIVE one: a stored series that
 * is present but not derivable must serve `climate: null` (never `derived: null`, never a 500 on
 * a public SEO page) AND emit an observable signal, because that state is unreachable via the
 * verified load path but reachable by any future migration/admin-CRUD/manual-SQL write. The e2e
 * can only manufacture a fully-null row; only a unit test can feed a present-but-corrupt one.
 *
 * Structural per CONVENTIONS §2 — no per-province fact is asserted.
 */

function makeValidNormals(): ClimateNormals {
  const months: ClimateMonthlyNormal[] = Array.from({ length: 12 }, (_unused, i) => ({
    month: i + 1,
    tempMeanC: 10 + i,
    tempMaxMeanC: null,
    tempMinMeanC: null,
    precipitationMm: 50,
    sunshineHours: null,
    rainyDays: null,
    tempRecordMaxC: null,
    tempRecordMaxDate: null,
    tempRecordMinC: null,
    tempRecordMinDate: null,
  }));
  return {
    source: CLIMATE_SOURCE_MGM_GENERAL,
    sourceUrl: 'https://www.mgm.gov.tr/veridegerlendirme/il-ve-ilceler-istatistik.aspx?k=A&m=TEST',
    periodStartYear: 1929,
    periodEndYear: 2025,
    months,
    records: {
      dailyMaxPrecipitationMm: null,
      fastestWindMs: null,
      maxSnowDepthCm: null,
    },
  };
}

describe('buildClimate', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null (silently) when the province has no stored series', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    expect(buildClimate(null, '34')).toBeNull();
    // The no-series case is EXPECTED, not a defect — it must NOT log.
    expect(warn).not.toHaveBeenCalled();
  });

  it('builds the full payload (series + derived) from a valid series', () => {
    const normals = makeValidNormals();
    const climate = buildClimate(normals, '34');
    expect(climate).not.toBeNull();
    expect(climate?.source).toBe(CLIMATE_SOURCE_MGM_GENERAL);
    expect(climate?.months).toHaveLength(12);
    // The derived block is present and its seasonal shares total exactly 100.
    const seasonal = climate?.derived.seasonalPrecipitation;
    expect(seasonal).toBeDefined();
    if (seasonal !== undefined) {
      expect(
        seasonal.winterPct + seasonal.springPct + seasonal.summerPct + seasonal.autumnPct,
      ).toBe(100);
    }
  });

  it('serves climate: null AND warns when a stored series is present but not derivable', () => {
    // A present-but-corrupt row: the import's all-or-nothing rule should make this impossible,
    // so reaching it is a defect that must be observable (I5) while still degrading gracefully.
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const corrupt = makeValidNormals();
    const july = corrupt.months[6];
    if (july === undefined) throw new Error('fixture malformed');
    july.tempMeanC = null; // breaks the core pair → not derivable

    expect(buildClimate(corrupt, '06')).toBeNull();
    // Observability: the corrupt branch logs, and names the plate code (public data, no PII).
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('06');
  });
});
