import { describe, expect, it } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { CachedRead } from '../upstream/cache/upstream-cache.service';
import type { Province } from '../province/entities/province.entity';
import type { CompiledRun } from './air-quality-compile';
import { AirQualityReadService } from './air-quality-read.service';
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
  } as unknown as AirQualitySeriesReader;
  return new AirQualityReadService(repository, reader);
}

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

  it('404s a well-formed plate code that names no province', async () => {
    const service = buildService({ provinces: [province('06')], read: COLD_READ });
    await expect(service.getProvince('99')).rejects.toBeInstanceOf(NotFoundException);
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
