import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { buildClimate } from './province.service';
import {
  CLIMATE_SOURCE_ERA5_LAND_MONTHLY,
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
    precipitationMm: 50,
  }));
  return {
    source: CLIMATE_SOURCE_ERA5_LAND_MONTHLY,
    sourceUrl: 'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-monthly-means',
    periodStartYear: 1991,
    periodEndYear: 2020,
    months,
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
    expect(climate?.source).toBe(CLIMATE_SOURCE_ERA5_LAND_MONTHLY);
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

  it('REFUSES a stale MGM-shaped document rather than serving the retired contract', () => {
    // Review #87, CR87-I1. `buildClimate` spreads the stored document verbatim onto a public
    // response, and an MGM-era document passes every structural check `computeClimateDerived`
    // makes (12 ordered months, finite core pair). So a database still holding MGM documents that
    // receives this build before `db:import:era5 --phase=load` runs would serve
    // `source: "mgm_general"`, the removed `records` block and eight fields that exist in no DTO
    // and in no generated web type — at 200, with no signal. Absent beats wrong.
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const stale = makeValidNormals();
    // Written past the type deliberately: `ClimateSource` has one member, so this shape is
    // unrepresentable in TypeScript — and reachable in a `jsonb` column, which is the whole point.
    (stale as unknown as Record<string, unknown>).source = 'mgm_general';
    (stale as unknown as Record<string, unknown>).records = { dailyMaxPrecipitationMm: null };

    expect(buildClimate(stale, '34')).toBeNull();
    // It is a DEFECT, so it must be observable — and must name both the offending value and the
    // command that fixes it, since the operator's real problem is deploy ordering.
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('34');
    expect(message).toContain('mgm_general');
    expect(message).toContain('db:import:era5 --phase=load');
  });

  it('serves climate: null AND warns when a stored series is present but not derivable', () => {
    // A present-but-corrupt row: the import's all-or-nothing rule should make this impossible,
    // so reaching it is a defect that must be observable (I5) while still degrading gracefully.
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const corrupt = makeValidNormals();
    const july = corrupt.months[6];
    if (july === undefined) throw new Error('fixture malformed');
    // Written past the type on purpose: the core pair is non-nullable in the contract, but this
    // object comes out of a `jsonb` column where the type is an assertion, not a guarantee.
    (july as unknown as Record<string, unknown>).tempMeanC = null;

    expect(buildClimate(corrupt, '06')).toBeNull();
    // Observability: the corrupt branch logs, and names the plate code (public data, no PII).
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('06');
  });

  it('returns null (silently, no crash) when the column is absent as undefined', () => {
    // A projection that omits `climate_normals` hands `buildClimate` `undefined`, not `null`. An
    // absent series is the same EXPECTED, silent no-climate case as an explicit NULL (the `== null`
    // guard) — it must not fall through and destructure-throw a 500 on the list/detail read.
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    expect(buildClimate(undefined as unknown as ClimateNormals, '34')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('serves null AND warns for a present-but-malformed jsonb shape the type forbids', () => {
    // Present-but-corrupt shapes the compile-time type believes impossible but a jsonb column can
    // still hold: a DEFECT, so — exactly like an incomplete core pair — they serve null and log,
    // rather than throwing a TypeError inside the derivation.
    //
    // Both fixtures carry a VALID `source` on purpose (review #87, CF87-M2). Without it they exit
    // at the source branch added above and never reach the SHAPE guard this test names, so the
    // test would pass while proving something else entirely — a bare `{}` would be "refused" for
    // the wrong reason. The shape guard is what has to fire here.
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const withSource = (extra: Record<string, unknown>): ClimateNormals =>
      ({ source: CLIMATE_SOURCE_ERA5_LAND_MONTHLY, ...extra }) as unknown as ClimateNormals;

    expect(buildClimate(withSource({}), '35')).toBeNull();
    expect(buildClimate(withSource({ months: null }), '35')).toBeNull();
    expect(buildClimate(withSource({ months: 'not-an-array' }), '35')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
    // …and it is the DERIVABILITY message, not the source message — i.e. the shape guard is what
    // rejected them.
    for (const call of warn.mock.calls) {
      expect(String(call[0])).toContain('not derivable');
    }
  });
});
