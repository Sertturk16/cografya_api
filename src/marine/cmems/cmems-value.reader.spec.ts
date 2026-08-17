import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { InProcessSingleFlight } from '../../upstream/cache/single-flight';
import { UpstreamCacheService } from '../../upstream/cache/upstream-cache.service';
import { InProcessCacheStore } from '../../upstream/cache/upstream-cache.store';
import { CircuitBreaker } from '../../upstream/circuit-breaker';
import { OperationDeadline } from '../../upstream/operation-deadline';
import { ProviderBudget } from '../../upstream/provider-budget';
import { UpstreamHttpClient } from '../../upstream/upstream-http.client';
import { UpstreamMetrics } from '../../upstream/upstream-metrics';
import type { MarineUpstreamConfig } from '../marine-upstream.config';
import { SeaBasin } from '../marine.types';
import { CmemsClient } from './cmems-client';
import { cmemsSelectorKey, CMEMS_BASIN_ROUTING } from './cmems-routing';
import type { CmemsProductResolution } from './cmems-stac';
import { CmemsStacResolutionCache } from './cmems-stac.cache';
import { CmemsValueReader, cmemsValueKey, type CmemsPointRef } from './cmems-value.reader';

/**
 * The reader's own decisions, against REAL cache/client instances (in-process store, injected
 * fetch — the `EcmwfSeriesReader` spec's harness pattern): where a provider call may happen,
 * what a missing/failed resolution yields, and the M-SFH-1 clamp signal. Structural only.
 */

const NOW = Date.parse('2026-08-02T12:10:00.000Z');

const BLACK_SEA_POINT: CmemsPointRef = {
  slugTr: 'test-noktasi',
  latitude: 41.95,
  longitude: 28.15,
  seaBasin: SeaBasin.BlackSea,
};

const MARMARA_POINT: CmemsPointRef = {
  slugTr: 'marmara-noktasi',
  latitude: 40.85,
  longitude: 28.8,
  seaBasin: SeaBasin.Marmara,
};

const BLKSEA_PHY = 'BLKSEA_ANALYSISFORECAST_PHY_007_001';
const BLKSEA_PHY_DATASET = 'cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202511';

function makeConfig(): MarineUpstreamConfig {
  return {
    budgets: {
      ecmwf: { perMinute: 60, perHour: 400, perDay: 2_000 },
      cmems: { perMinute: 300, perHour: 5_000, perDay: 20_000 },
    },
    ttls: {
      ok: 3_600,
      no_data: 86_400,
      transient: 60,
      rate_limited: 300,
      client_error: 900,
      schema_error: 300,
    },
    ceilings: { staleMaxSeconds: 21_600, validAtMaxAgeSeconds: 10_800 },
    requestDeadlineMs: 6_000,
    warmupDeadlineMs: 300_000,
    warmupIntervalSeconds: 900,
    warmupEnabled: true,
    ecmwf: {
      enabled: true,
      baseUrl: 'https://primary.test',
      failoverBaseUrl: null,
      forecastHours: 6,
      singleCallTimeoutMs: 3_000,
      tourBudgetMs: 180_000,
      maxStepsPerTour: 2,
      tourMaxBytes: 10_000_000,
      cycleMaxBytes: 20_000_000,
      maxRangeBytes: 8_388_608,
      cycleMaxAgeSeconds: 86_400,
      staleMaxSeconds: 43_200,
    },
    cmems: {
      wmtsBaseUrl: 'https://wmts.test/teroWmts',
      stacBaseUrl: 'https://stac.test/metadata',
      singleCallTimeoutMs: 6_000,
      tourBudgetMs: 60_000,
      stacTtlSeconds: 21_600,
    },
  };
}

function resolutionFor(
  productId: string,
  overrides: Partial<CmemsProductResolution> = {},
): CmemsProductResolution {
  const selections = [];
  for (const route of Object.values(CMEMS_BASIN_ROUTING)) {
    for (const selector of [route.seaSurfaceTemperature, route.wave]) {
      if (selector === null || selector.productId !== productId) continue;
      selections.push({
        selectorKey: cmemsSelectorKey(selector),
        selection: { datasetId: BLKSEA_PHY_DATASET, stamp: 202511 },
      });
    }
  }
  return {
    productId,
    license: 'proprietary',
    doi: '10.48670/mds-00355',
    temporalExtent: { startUtc: '2021-01-01T00:00:00Z', endUtc: '2026-08-10T23:00:00Z' },
    updateFrequency: 'daily: 16:00',
    admpUpdatedUtc: '2026-08-01T11:06:46Z',
    selections,
    ...overrides,
  };
}

function featureBody(point: CmemsPointRef, variableId: string, units: string): string {
  return JSON.stringify({
    features: [
      {
        properties: {
          lat: point.latitude,
          lon: point.longitude,
          variableId,
          datasetId: `${BLKSEA_PHY}/${BLKSEA_PHY_DATASET}`,
          value: 21.4,
          units,
        },
      },
    ],
  });
}

describe('CmemsValueReader', () => {
  let metrics: UpstreamMetrics;
  let events: { level: string; message: string }[];
  let fetches: string[];
  let store: InProcessCacheStore;
  let cache: UpstreamCacheService;
  let stacCache: CmemsStacResolutionCache;
  let nowMs: number;

  function build(responder: (url: string) => Response): CmemsValueReader {
    const breaker = new CircuitBreaker(metrics, {
      failureThreshold: 10,
      openMs: 10_000,
      now: () => nowMs,
    });
    const budget = new ProviderBudget(metrics, null, () => nowMs);
    const http = new UpstreamHttpClient(metrics, budget, breaker, {
      singleCallTimeoutMs: 6_000,
      userAgent: 'TestBot/1.0',
      fetchImpl: (input) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        fetches.push(url);
        return Promise.resolve(responder(url));
      },
      sleepImpl: () => Promise.resolve(),
      now: () => nowMs,
    });
    const client = new CmemsClient(http, {
      wmtsBaseUrl: 'https://wmts.test/teroWmts',
      stacBaseUrl: 'https://stac.test/metadata',
      limits: makeConfig().budgets.cmems,
      singleCallTimeoutMs: 6_000,
    });
    return new CmemsValueReader(cache, client, stacCache, makeConfig(), metrics, () => nowMs);
  }

  beforeEach(() => {
    metrics = new UpstreamMetrics();
    events = [];
    jest.spyOn(metrics, 'event').mockImplementation((level, message) => {
      events.push({ level, message });
    });
    fetches = [];
    nowMs = NOW;
    store = new InProcessCacheStore(() => nowMs);
    cache = new UpstreamCacheService(store, new InProcessSingleFlight(metrics), metrics, {
      now: () => nowMs,
    });
    stacCache = new CmemsStacResolutionCache(null, metrics, () => nowMs);
  });

  it('without a stored STAC resolution the refresh answers transient and NEVER fetches — no STAC call on a value path, and it says so once PER PRODUCT', async () => {
    const reader = build(() => new Response('unreachable', { status: 500 }));
    const unresolvedLines = (): { level: string; message: string }[] =>
      events.filter((event) => event.message.includes('no STAC resolution yet'));

    const outcome = await reader.refreshValue(
      BLACK_SEA_POINT,
      'seaSurfaceTemperature',
      new OperationDeadline(6_000, () => nowMs),
    );
    expect(outcome).toMatchObject({ kind: 'transient' });
    expect(fetches).toEqual([]);

    // FU-SST-UNAVAIL: of the three branches here that reach no provider — so that none of
    // `UpstreamHttpClient.record`'s per-kind lines covers them — this was the only one that
    // also emitted nothing of its own. Unlogged, the field publishes with a populated
    // `fetchedAtUtc` and leaves no trace anywhere a human looks: measured as ZERO log lines
    // on a cold conditions read.
    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        message: expect.stringContaining('no STAC resolution yet'),
      }),
    );

    // The throttle KEY is the property under test, not merely "an identical call is quiet":
    // the spy captures `(level, message)` and never the key, so repeating the SAME (point,
    // field) would pass under every candidate key — global, per product, per point — and both
    // wrong choices are damaging (a global key re-silences 3 of 4 products; a per-point key
    // emits up to 78 lines a sweep). The two calls below discriminate between them.
    //
    // NOTE: the window itself rides REAL `Date.now()` (`UpstreamMetrics.throttledEvent`), not
    // this harness's injected `nowMs`. Advancing `nowMs` here would NOT reopen the window;
    // expiry is pinned in `upstream-metrics.spec.ts` with a stubbed clock, and only the
    // suppression half belongs at this call site.

    // (a) Same product, different point — the Marmara SST sub-model lives in the BLKSEA PHY
    // document — so a per-point key would emit a second line. It must stay at one.
    const sameProduct = await reader.refreshValue(
      MARMARA_POINT,
      'seaSurfaceTemperature',
      new OperationDeadline(6_000, () => nowMs),
    );
    expect(sameProduct).toMatchObject({ kind: 'transient' });
    expect(fetches).toEqual([]);
    expect(unresolvedLines()).toHaveLength(1);

    // (b) Different product (BLKSEA WAV) — a single global key would swallow this one, which
    // is the mutation that restores the original silence for three of the four products.
    const otherProduct = await reader.refreshValue(
      BLACK_SEA_POINT,
      'waveHeight',
      new OperationDeadline(6_000, () => nowMs),
    );
    expect(otherProduct).toMatchObject({ kind: 'transient' });
    expect(fetches).toEqual([]);
    expect(unresolvedLines()).toHaveLength(2);
  });

  it('a resolution whose selector matched nothing answers schema_error, fail-closed, no fetch', async () => {
    await stacCache.set(
      BLKSEA_PHY,
      resolutionFor(BLKSEA_PHY, {
        selections: [
          {
            selectorKey: `${BLKSEA_PHY}/2.5km`,
            selection: { datasetId: null, reason: 'no candidate' },
          },
        ],
      }),
    );
    const reader = build(() => new Response('unreachable', { status: 500 }));
    const outcome = await reader.refreshValue(
      BLACK_SEA_POINT,
      'seaSurfaceTemperature',
      new OperationDeadline(6_000, () => nowMs),
    );
    expect(outcome.kind).toBe('schema_error');
    expect(fetches).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({ level: 'error', message: expect.stringContaining('no dataset') }),
    );
  });

  it('a resolved product yields ONE GetFeatureInfo call with the resolved dataset path and an ok value', async () => {
    await stacCache.set(BLKSEA_PHY, resolutionFor(BLKSEA_PHY));
    const reader = build(
      () =>
        new Response(featureBody(BLACK_SEA_POINT, 'thetao', 'degrees_C'), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const outcome = await reader.refreshValue(
      BLACK_SEA_POINT,
      'seaSurfaceTemperature',
      new OperationDeadline(6_000, () => nowMs),
    );
    expect(outcome.kind).toBe('ok');
    expect(fetches).toHaveLength(1);
    expect(fetches[0]).toContain(encodeURIComponent(`${BLKSEA_PHY}/${BLKSEA_PHY_DATASET}`));
    // The explicit hour-aligned time= is always sent (never defaulted).
    expect(fetches[0]).toContain('time=');

    // The negative control for the unresolved-STAC WARN: a RESOLVED product must stay silent.
    // Without this, moving that `throttledEvent` above its `if (stored === null)` guard keeps
    // every other assertion in this file green while every healthy warmup tour reports the
    // catalogue unresolved — a permanent false alarm on the one signal FU-SST-UNAVAIL added,
    // and the kind an operator learns to filter out.
    expect(events.filter((event) => event.message.includes('no STAC resolution yet'))).toHaveLength(
      0,
    );
  });

  it('logs the clamp signal when the temporal extent moves the instant off the nearest hour (M-SFH-1)', async () => {
    await stacCache.set(
      BLKSEA_PHY,
      resolutionFor(BLKSEA_PHY, {
        // Extent ends before "now": the selection clamps down to the newest servable hour.
        temporalExtent: { startUtc: '2021-01-01T00:00:00Z', endUtc: '2026-08-02T09:30:00Z' },
      }),
    );
    const reader = build(
      () =>
        new Response(featureBody(BLACK_SEA_POINT, 'thetao', 'degrees_C'), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    await reader.refreshValue(
      BLACK_SEA_POINT,
      'seaSurfaceTemperature',
      new OperationDeadline(6_000, () => nowMs),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ level: 'warn', message: expect.stringContaining('clamped') }),
    );
  });

  it('peekValue never fetches and never writes — a later readValue still refreshes (U-1)', async () => {
    await stacCache.set(BLKSEA_PHY, resolutionFor(BLKSEA_PHY));
    const reader = build(
      () =>
        new Response(featureBody(BLACK_SEA_POINT, 'thetao', 'degrees_C'), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const peeked = await reader.peekValue(BLACK_SEA_POINT, 'seaSurfaceTemperature');
    expect(peeked).toMatchObject({ value: null, origin: 'unavailable' });
    expect(fetches).toEqual([]);

    const read = await reader.readValue(
      BLACK_SEA_POINT,
      'seaSurfaceTemperature',
      new OperationDeadline(6_000, () => nowMs),
    );
    expect(read.kind).toBe('ok');
    expect(fetches).toHaveLength(1);
  });

  it('asking for a Marmara wave is a loud routing-bug outcome, never a provider call', async () => {
    const reader = build(() => new Response('unreachable', { status: 500 }));
    const outcome = await reader.refreshValue(
      MARMARA_POINT,
      'waveHeight',
      new OperationDeadline(6_000, () => nowMs),
    );
    expect(outcome.kind).toBe('client_error');
    expect(fetches).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ level: 'error' }));
  });

  it('the value key layout is per (field, slug) — the negative-TTL split the plan requires', () => {
    expect(cmemsValueKey('seaSurfaceTemperature', 'test-noktasi')).toBe(
      'marine:cmems:value:seaSurfaceTemperature:test-noktasi',
    );
  });
});
