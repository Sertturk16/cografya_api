import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { CachedRead } from '../upstream/cache/upstream-cache.service';
import { UpstreamMetrics } from '../upstream/upstream-metrics';
import type { Province } from '../province/entities/province.entity';
import type { CompiledRun } from './air-quality-compile';
import { AirQualityReadService } from './air-quality-read.service';
import { CAMS_ADS_PROVIDER } from './air-quality-upstream.config';
import { readAirQualityCacheAge } from './air-quality-cache-age.interceptor';
import type { AirQualitySeriesReader } from './air-quality-series.reader';
import type { AirQualityProvinceListItemDto } from './dto/air-quality-province-list-item.dto';
import { AirQualityFreshness, AirQualityPollutant, AirQualityStatus } from './air-quality.types';

/**
 * The read service's own decisions, against fakes: the cold degradation, the plate-code 404
 * branches, the Q3 coordinate rule, the cache-age carrier and the hub's `no-store` threshold.
 * The real Postgres behaviour is proved by the e2e suite; what is proved HERE is the branching
 * that a database cannot show.
 *
 * Structural throughout — no concentration below is a claim about the world.
 */

const RUN_UTC = '2026-08-02T00:00:00.000Z';
const MS_PER_HOUR = 3_600_000;

function province(plateCode: string, overrides: Partial<Province> = {}): Province {
  return {
    plateCode,
    slugTr: `il-${plateCode}`,
    slugEn: `province-${plateCode}`,
    nameTr: `İl ${plateCode}`,
    latitude: 39.9,
    longitude: 32.8,
    ...overrides,
  } as Province;
}

function compiledRun(plateCodes: readonly string[]): CompiledRun {
  const base = Date.parse(RUN_UTC);
  return {
    runUtc: RUN_UTC,
    datasetId: 'cams-europe-air-quality-forecasts',
    analysisEndUtc: null,
    stepHours: 1,
    timesUtc: [0, 1, 2].map((offset) => new Date(base + offset * MS_PER_HOUR).toISOString()),
    horizonEndUtc: new Date(base + 2 * MS_PER_HOUR).toISOString(),
    provinces: plateCodes.map((plateCode) => ({
      plateCode,
      gridLatitude: 39.95,
      gridLongitude: 32.85,
      distanceKm: 3.1,
      ingestedAtUtc: RUN_UTC,
      concentrations: {
        [AirQualityPollutant.Pm2_5]: [5, 5, 5],
        [AirQualityPollutant.Pm10]: [9, 9, 9],
        [AirQualityPollutant.No2]: [12, 12, 12],
        [AirQualityPollutant.O3]: [30, 30, 30],
        [AirQualityPollutant.So2]: [20, 20, 20],
      },
      support: {
        [AirQualityPollutant.Pm2_5]: 'ok',
        [AirQualityPollutant.Pm10]: 'ok',
        [AirQualityPollutant.No2]: 'ok',
        [AirQualityPollutant.O3]: 'ok',
        [AirQualityPollutant.So2]: 'ok',
      },
    })),
  };
}

function okRead(run: CompiledRun): CachedRead<CompiledRun> {
  return {
    value: run,
    kind: 'ok',
    freshness: 'fresh',
    cacheAgeSeconds: 17,
    staleSinceUtc: null,
    validAtUtc: run.timesUtc[0] ?? null,
    fetchedAtUtc: RUN_UTC,
    reason: null,
    origin: 'fresh_hit',
  };
}

const COLD_READ: CachedRead<CompiledRun> = {
  value: null,
  kind: 'transient',
  freshness: null,
  cacheAgeSeconds: null,
  staleSinceUtc: null,
  validAtUtc: null,
  fetchedAtUtc: null,
  reason: 'nothing stored yet',
  origin: 'refreshed',
};

/**
 * A NEGATIVE cache entry that really was served from cache, so it carries a real age.
 *
 * The state review #84 I1 is about: `UpstreamCacheService.fromNegative` puts a genuine
 * `cacheAgeSeconds` on a `value: null` read, because the age belongs to the ENTRY. Nothing in the
 * response it produces is data, so nothing in it may claim a data age.
 */
const NEGATIVE_READ_WITH_AGE: CachedRead<CompiledRun> = {
  ...COLD_READ,
  cacheAgeSeconds: 240,
  origin: 'negative_hit',
};

function buildService(input: {
  provinces: Province[];
  read: CachedRead<CompiledRun>;
}): AirQualityReadService {
  const repository = {
    find: () => Promise.resolve(input.provinces),
    findOne: (options: { where: { plateCode: string } }) =>
      Promise.resolve(
        input.provinces.find((row) => row.plateCode === options.where.plateCode) ?? null,
      ),
  } as unknown as Repository<Province>;
  const reader = {
    readRun: () => Promise.resolve(input.read),
    // The post-cache R2 report sink (review #84 I2). Present on the fake so the service's call is
    // exercised rather than merely type-erased — a fake missing it would only fail on the branch
    // nobody tests, which is the whole defect class this review named.
    reportPostCacheNormalisation: (count: number) => {
      normalisationReports.push(count);
    },
  } as unknown as AirQualitySeriesReader;
  return new AirQualityReadService(repository, reader, metrics);
}

/** Every post-cache R2 report the service made during the current test. */
let normalisationReports: number[] = [];

/**
 * A REAL `UpstreamMetrics`, not a fake — the throttle and the emission seam are the behaviour
 * under test in the Q3 cases below, and a hand-written fake would have to reimplement both.
 * Only `event` is spied, which is where `throttledEvent` lands when it decides to emit.
 */
let metrics: UpstreamMetrics;
let events: { level: string; message: string }[] = [];

beforeEach(() => {
  normalisationReports = [];
  metrics = new UpstreamMetrics();
  events = [];
  jest.spyOn(metrics, 'event').mockImplementation((level, message) => {
    events.push({ level, message });
  });
});

describe('AirQualityReadService — the hub', () => {
  it('lists EVERY province even on the cold path, all unavailable', async () => {
    const service = buildService({
      provinces: [province('06'), province('34')],
      read: COLD_READ,
    });
    const items = await service.listProvinces();
    expect(items.map((item) => item.plateCode)).toEqual(['06', '34']);
    for (const item of items) {
      expect(item.status).toBe(AirQualityStatus.Unavailable);
      expect(item.band).toBeNull();
      expect(item.category).toBeNull();
      expect(item.dominantPollutant).toBeNull();
      expect(item.validAtUtc).toBeNull();
    }
  });

  it('publishes a band for a covered province and leaves an uncovered one unavailable', async () => {
    // One province skipped by the shape guard must not darken the rest — the whole point of
    // skipping a row rather than failing the run.
    const service = buildService({
      provinces: [province('06'), province('34')],
      read: okRead(compiledRun(['06'])),
    });
    const items = await service.listProvinces();
    expect(items[0]?.status).toBe(AirQualityStatus.Ok);
    expect(items[0]?.band).not.toBeNull();
    expect(items[1]?.status).toBe(AirQualityStatus.Unavailable);
    expect(items[1]?.band).toBeNull();
  });

  it('attaches the cache age to the array body without changing its serialization', async () => {
    const service = buildService({
      provinces: [province('06')],
      read: okRead(compiledRun(['06'])),
    });
    const items = await service.listProvinces();
    expect(readAirQualityCacheAge(items)).toBe(17);
    expect(JSON.parse(JSON.stringify(items))).toHaveLength(1);
  });

  it('publishes NO cache age when the read carried no data (review #84 I1)', async () => {
    // A negative entry's age describes the ENTRY. Publishing it beside an all-unavailable body
    // tells an operator "this data is 4 minutes old" about data the response does not contain.
    const service = buildService({
      provinces: [province('06')],
      read: NEGATIVE_READ_WITH_AGE,
    });
    const items = await service.listProvinces();
    expect(items[0]?.status).toBe(AirQualityStatus.Unavailable);
    expect(readAirQualityCacheAge(items)).toBeNull();

    const detail = await service.getProvince('06');
    expect(detail.dataAvailable).toBe(false);
    expect(readAirQualityCacheAge(detail)).toBeNull();
  });

  it('treats "at least one province carries a value" as data (Atlas ruling Q7)', () => {
    const item = (status: AirQualityStatus): AirQualityProvinceListItemDto => ({
      plateCode: '06',
      slugTr: 'ankara',
      slugEn: 'ankara',
      band: null,
      category: null,
      dominantPollutant: null,
      status,
      validAtUtc: null,
    });
    const cold = [item(AirQualityStatus.Unavailable)];
    const partial = [item(AirQualityStatus.Unavailable), item(AirQualityStatus.NoData)];
    expect(AirQualityReadService.hubHasData(cold)).toBe(false);
    // A `no_data` province still means the run reached it — the hub is cacheable. The stricter
    // "every province must be ok" reading was rejected: one skipped row would then keep the whole
    // hub uncacheable forever.
    expect(AirQualityReadService.hubHasData(partial)).toBe(true);
    expect(AirQualityReadService.hubHasData([])).toBe(false);
  });
});

describe('AirQualityReadService — the detail endpoint', () => {
  it('answers 200 with an honest unavailable payload on the cold path', async () => {
    const service = buildService({ provinces: [province('06')], read: COLD_READ });
    const dto = await service.getProvince('06');
    expect(dto.current.status).toBe(AirQualityStatus.Unavailable);
    expect(dto.series).toBeNull();
    expect(dto.dataAvailable).toBe(false);
    // The licence notice attaches to the published section, not to whether a value resolved.
    expect(dto.attribution.attributionText).toContain('Copernicus Atmosphere Monitoring Service');
    expect(dto.attribution.noticeKeys.length).toBeGreaterThan(0);
  });

  it('publishes the series and the run year on the warm path', async () => {
    const service = buildService({
      provinces: [province('06')],
      read: okRead(compiledRun(['06'])),
    });
    const dto = await service.getProvince('06');
    expect(dto.dataAvailable).toBe(true);
    expect(dto.current.status).toBe(AirQualityStatus.Ok);
    expect(dto.current.freshness).toBe(AirQualityFreshness.Fresh);
    expect(dto.series?.timesUtc).toHaveLength(3);
    expect(dto.series?.bands).toHaveLength(3);
    expect(dto.series?.analysisEndUtc).toBeNull();
    expect(dto.attribution.attributionText).toContain(String(new Date(RUN_UTC).getUTCFullYear()));
  });

  it('404s a well-formed plate code that names no province — and reports NOTHING', async () => {
    const service = buildService({ provinces: [province('06')], read: COLD_READ });
    await expect(service.getProvince('99')).rejects.toBeInstanceOf(NotFoundException);
    // The silence is as deliberate as the report in the next test, so it is pinned with the same
    // weight: 18 of the 99 well-formed two-digit codes name no province, and this route is
    // unauthenticated. Counting caller behaviour here would be a log-inflation lever and would
    // bury the ONE case that means our own data is wrong.
    expect(events).toHaveLength(0);
    expect(metrics.get('airq.province_coordinates_missing', CAMS_ADS_PROVIDER)).toBe(0);
  });

  it('404s a province with no reference point rather than inventing coordinates (Q3)', async () => {
    // The DTO's latitude/longitude are non-nullable; publishing 0/0 — or any invented pair —
    // would be a data-honesty breach on a public page. The province stays in the lean hub, which
    // carries no coordinates at all.
    const service = buildService({
      provinces: [province('06', { latitude: null, longitude: null })],
      read: COLD_READ,
    });
    await expect(service.getProvince('06')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports the Q3 404 as an ERROR and counts it — the half that shipped missing', async () => {
    // Review #84 CR-5 / DEC 2026-08-03a §2: the 404 alone is silent, so a seed regression that
    // nulls a province's coordinates takes a whole page off the site with nothing logged.
    const service = buildService({
      provinces: [province('06', { latitude: null, longitude: null })],
      read: COLD_READ,
    });
    await expect(service.getProvince('06')).rejects.toBeInstanceOf(NotFoundException);
    expect(events).toHaveLength(1);
    expect(events[0]?.level).toBe('error');
    expect(metrics.get('airq.province_coordinates_missing', CAMS_ADS_PROVIDER)).toBe(1);
  });

  it('throttles the report per PROVINCE — a second broken province is never hidden', async () => {
    // Two properties in one case, because they are the same design decision: the repeat is
    // suppressed (this route is public, so the report must not scale with traffic) while a
    // DIFFERENT province still gets its own line. A single shared throttle key would have made
    // the second province invisible for the whole window.
    const service = buildService({
      provinces: [
        province('06', { latitude: null, longitude: null }),
        province('34', { latitude: null, longitude: null }),
      ],
      read: COLD_READ,
    });
    await expect(service.getProvince('06')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getProvince('06')).rejects.toBeInstanceOf(NotFoundException);
    expect(events).toHaveLength(1);
    expect(metrics.get('airq.province_coordinates_missing', CAMS_ADS_PROVIDER)).toBe(1);

    await expect(service.getProvince('34')).rejects.toBeInstanceOf(NotFoundException);
    expect(events).toHaveLength(2);
    // Counted on EMISSION, so the counter tracks the two emitted lines, not the three requests.
    expect(metrics.get('airq.province_coordinates_missing', CAMS_ADS_PROVIDER)).toBe(2);
  });

  it('degrades ONE province honestly when the run does not cover it', async () => {
    const service = buildService({
      provinces: [province('06'), province('34')],
      read: okRead(compiledRun(['06'])),
    });
    const covered = await service.getProvince('06');
    const uncovered = await service.getProvince('34');
    expect(covered.dataAvailable).toBe(true);
    expect(uncovered.dataAvailable).toBe(false);
    expect(uncovered.current.status).toBe(AirQualityStatus.Unavailable);
    expect(uncovered.series).toBeNull();
    // Identity is still served in full — the page renders, only the widget degrades.
    expect(uncovered.nameTr).toBe('İl 34');
  });
});

/**
 * Review #84 I2: the post-cache R2 pass must reach a counter, not just null a value.
 *
 * The pass exists for a payload an EARLIER deployment cached, so it fires exactly when nobody is
 * reading today's compile logs. Silent, it is indistinguishable from a legitimate `no_data`.
 */
describe('AirQualityReadService — the post-cache R2 report', () => {
  /**
   * A cached run carrying a raw sentinel — a shape today's compile would never emit.
   *
   * EVERY step is corrupted, not just the first: the published step is `selectStepIndex(…,
   * Date.now())`, so which one the hub reads depends on the wall clock relative to the fixture's
   * timestamps. A single corrupted step would make this test pass or fail by time of day.
   */
  function corruptedRun(plateCodes: readonly string[] = ['06']): CompiledRun {
    const run = compiledRun(plateCodes);
    const steps = run.timesUtc.length;
    return {
      ...run,
      provinces: run.provinces.map((target) => ({
        ...target,
        concentrations: {
          ...target.concentrations,
          [AirQualityPollutant.Pm2_5]: Array.from({ length: steps }, () => -999),
        },
      })),
    };
  }

  it('reports ONCE per request, with the whole tally, when the hub substitutes', async () => {
    // TWO corrupted provinces on purpose (review #84 NM-2). With one, `[1]` is the expected result
    // under BOTH "once per request" and "once per province", so the assertion could not fail on the
    // behaviour its name pins. With two, per-request gives `[2]` and per-province gives `[1, 1]`.
    const service = buildService({
      provinces: [province('06'), province('34')],
      read: okRead(corruptedRun(['06', '34'])),
    });
    await service.listProvinces();
    expect(normalisationReports).toEqual([2]);
  });

  it('counts the detail endpoint tally ONCE per value, not once per builder', async () => {
    // Review #84 NM-1: the index counts step `stepIndex`, the series counts every step INCLUDING
    // that one, so handing the tally to both reported these 3 corrupted values as 4. The exact
    // number is the assertion — `toBeGreaterThan(0)` could not see the double count.
    const service = buildService({ provinces: [province('06')], read: okRead(corruptedRun()) });
    const dto = await service.getProvince('06');
    // 3 steps × the one corrupted pollutant, counted once each.
    expect(dto.series?.timesUtc).toHaveLength(3);
    expect(normalisationReports).toEqual([3]);
  });

  it('stays silent on a clean run and on the cold path', async () => {
    const clean = buildService({ provinces: [province('06')], read: okRead(compiledRun(['06'])) });
    await clean.listProvinces();
    await clean.getProvince('06');
    const cold = buildService({ provinces: [province('06')], read: COLD_READ });
    await cold.listProvinces();
    await cold.getProvince('06');
    expect(normalisationReports).toEqual([]);
  });
});
