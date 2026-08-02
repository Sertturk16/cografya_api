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
import { toTilePixel } from './cmems-geo';
import { CMEMS_SELECTOR_ENTRIES } from './cmems-routing';
import { CmemsStacResolutionCache } from './cmems-stac.cache';
import { CmemsValueReader, type CmemsPointRef } from './cmems-value.reader';
import { CmemsWarmupTarget } from './cmems-warmup.target';
import { CMEMS_VARIABLE_IDS, CMEMS_ZOOM, type CmemsLayerField } from './cmems.constants';

/**
 * The tour target's own rules, against a REAL cache/client/reader stack with an injected fetch
 * (the reader spec's harness, one level up): staleness-driven due-ness, the tour-slice budget,
 * the once-per-tour forced re-resolution, and the never-throw contract.
 */

const NOW = Date.parse('2026-08-02T12:10:00.000Z');

const POINTS: CmemsPointRef[] = [
  { slugTr: 'karadeniz-noktasi', latitude: 41.95, longitude: 28.15, seaBasin: SeaBasin.BlackSea },
  { slugTr: 'marmara-noktasi', latitude: 40.85, longitude: 28.8, seaBasin: SeaBasin.Marmara },
];
/** 3 Black Sea keys + 1 Marmara key (waves are not_supported there — never queried). */
const EXPECTED_VALUE_CALLS = 4;

const XML_400 =
  '<ExceptionReport xmlns="http://www.opengis.net/ows/1.1"><Exception>' +
  'TIME is out of range</Exception></ExceptionReport>';

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

/** A synthetic product STAC document valid for every selector the product serves. */
function stacBody(productId: string, stamp: number): string {
  const items = CMEMS_SELECTOR_ENTRIES.filter(
    (entry) => entry.selector.productId === productId,
  ).map((entry) => ({
    rel: 'item',
    href:
      `cmems_mod_tst_${entry.selector.acceptedVariableTokens[0] ?? 'wav'}_anfc_` +
      `${entry.selector.gridToken}_PT1H-m_${String(stamp)}/dataset.stac.json`,
  }));
  return JSON.stringify({
    id: productId,
    license: 'proprietary',
    extent: { temporal: { interval: [['2021-01-01T00:00:00Z', '2026-08-10T23:00:00Z']] } },
    properties: { updateFrequencies: { daily: '16:00' }, admp_updated: '2026-08-01T11:06:46Z' },
    links: items,
  });
}

/** Which fixture point a WMTS request addresses — the URL builder's own arithmetic, inverted
 * by lookup: precompute each point's tile/pixel address and index by it. */
const POINT_BY_PIXEL: ReadonlyMap<string, CmemsPointRef> = new Map(
  POINTS.map((point) => {
    const pixel = toTilePixel(point.latitude, point.longitude, CMEMS_ZOOM);
    return [
      `${String(pixel.tileRow)}/${String(pixel.tileCol)}/${String(pixel.i)}/${String(pixel.j)}`,
      point,
    ];
  }),
);

function pointForUrl(url: string): CmemsPointRef {
  const params = new URL(url).searchParams;
  const key = `${params.get('TileRow') ?? ''}/${params.get('TileCol') ?? ''}/${params.get('I') ?? ''}/${params.get('J') ?? ''}`;
  const point = POINT_BY_PIXEL.get(key);
  if (point === undefined) throw new Error(`no fixture point at pixel ${key}`);
  return point;
}

describe('CmemsWarmupTarget', () => {
  let metrics: UpstreamMetrics;
  let events: { level: string; message: string }[];
  let fetches: string[];
  let store: InProcessCacheStore;
  let cache: UpstreamCacheService;
  let stacCache: CmemsStacResolutionCache;
  let nowMs: number;
  let wmtsStatus: (url: string) => number;
  let stacStamp: number;

  function build(): { target: CmemsWarmupTarget; reader: CmemsValueReader } {
    const breaker = new CircuitBreaker(metrics, {
      failureThreshold: 100,
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
        if (url.includes('/product.stac.json')) {
          const productId = url.split('/').at(-2) ?? '';
          return Promise.resolve(
            new Response(stacBody(productId, stacStamp), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
        const status = wmtsStatus(url);
        if (status !== 200) {
          return Promise.resolve(
            new Response(XML_400, {
              status,
              headers: { 'content-type': 'text/xml; charset=utf-8' },
            }),
          );
        }
        const parsed = new URL(url);
        const layer = parsed.searchParams.get('layer') ?? '';
        const variableId = layer.split('/').pop() ?? '';
        const datasetPath = layer.slice(0, layer.length - variableId.length - 1);
        const field = (Object.entries(CMEMS_VARIABLE_IDS).find(
          ([, id]) => id === variableId,
        )?.[0] ?? 'seaSurfaceTemperature') as CmemsLayerField;
        const units =
          field === 'seaSurfaceTemperature' ? 'degrees_C' : field === 'waveHeight' ? 'm' : 'degree';
        const value = field === 'seaSurfaceTemperature' ? 21.4 : field === 'waveHeight' ? 0.8 : 120;
        // Echo the exact requested coordinate (snap distance 0) — resolved from the pixel
        // address with the same arithmetic the URL builder used.
        const point = pointForUrl(url);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              features: [
                {
                  properties: {
                    lat: point.latitude,
                    lon: point.longitude,
                    variableId,
                    datasetId: datasetPath,
                    value,
                    units,
                  },
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
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
    const reader = new CmemsValueReader(
      cache,
      client,
      stacCache,
      makeConfig(),
      metrics,
      () => nowMs,
    );
    const target = new CmemsWarmupTarget({
      reader,
      stacCache,
      cache,
      config: makeConfig(),
      metrics,
      loadPoints: () => Promise.resolve([...POINTS]),
      now: () => nowMs,
    });
    return { target, reader };
  }

  const stacCalls = (): number => fetches.filter((url) => url.includes('product.stac.json')).length;
  const wmtsCalls = (): number => fetches.filter((url) => url.includes('teroWmts')).length;

  beforeEach(() => {
    metrics = new UpstreamMetrics();
    events = [];
    jest.spyOn(metrics, 'event').mockImplementation((level, message) => {
      events.push({ level, message });
    });
    fetches = [];
    nowMs = NOW;
    stacStamp = 202511;
    wmtsStatus = () => 200;
    store = new InProcessCacheStore(() => nowMs);
    cache = new UpstreamCacheService(store, new InProcessSingleFlight(metrics), metrics, {
      now: () => nowMs,
    });
    stacCache = new CmemsStacResolutionCache(null, metrics, () => nowMs);
  });

  it('a cold tour resolves 4 product documents, sweeps every missing key, and the very next tour is a no-op', async () => {
    const { target } = build();
    await target.refresh(new OperationDeadline(240_000, () => nowMs));

    expect(stacCalls()).toBe(4); // five selectors, four documents (BLKSEA PHY serves two)
    expect(wmtsCalls()).toBe(EXPECTED_VALUE_CALLS);

    fetches = [];
    nowMs += 900_000; // one tour interval — values still fresh (1 h TTL), resolutions fresh (6 h)
    await target.refresh(new OperationDeadline(240_000, () => nowMs));
    expect(fetches).toEqual([]);
  });

  it('sweeps ONLY the keys that have gone stale, at the hourly boundary', async () => {
    const { target } = build();
    await target.refresh(new OperationDeadline(240_000, () => nowMs));
    fetches = [];

    nowMs += 3_700_000; // past the 1 h value TTL, inside the 6 h STAC TTL
    await target.refresh(new OperationDeadline(240_000, () => nowMs));
    expect(stacCalls()).toBe(0);
    expect(wmtsCalls()).toBe(EXPECTED_VALUE_CALLS);
  });

  it('consumes at most its OWN slice: an exhausted tour deadline yields zero work', async () => {
    const { target } = build();
    const spent = new OperationDeadline(1, () => nowMs);
    nowMs += 5; // the tour deadline is already gone when the target is visited
    await target.refresh(spent);
    expect(fetches).toEqual([]);
  });

  it('a 400-XML sweep forces AT MOST ONE STAC re-resolution per product per tour (the retired-dataset heal)', async () => {
    const { target } = build();
    await target.refresh(new OperationDeadline(240_000, () => nowMs));
    fetches = [];

    // Everything 400s now — the retired-id signature on every key of both products.
    wmtsStatus = () => 400;
    stacStamp = 202512;
    nowMs += 3_700_000;
    await target.refresh(new OperationDeadline(240_000, () => nowMs));

    // 3 products are actually queried by these two points (BLKSEA PHY ×2 selectors + BLKSEA
    // WAV; the fixture has no Med/Aegean point) — but the FIRST 400 per product re-resolves,
    // and later keys of the same product read the overwritten resolution. The gate must have
    // fired once per DISTINCT product with a 400, never once per key.
    const products = new Set(
      fetches
        .filter((url) => url.includes('product.stac.json'))
        .map((url) => url.split('/').at(-2)),
    );
    // Both queried products (BLKSEA physics + BLKSEA waves) 400 on their first key…
    expect(products.size).toBe(2);
    // …and the total re-resolve count equals the distinct-product count: once per product,
    // never once per failing key — the storm protection.
    expect(stacCalls()).toBe(products.size);
    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        message: expect.stringContaining('forced STAC re-resolution'),
      }),
    );
  });

  it('NEVER throws — a broken loadPoints is counted loudly and swallowed', async () => {
    const { target } = build();
    const failing = new CmemsWarmupTarget({
      reader: build().reader,
      stacCache,
      cache,
      config: makeConfig(),
      metrics,
      loadPoints: () => Promise.reject(new Error('db down')),
      now: () => nowMs,
    });
    void target;
    await expect(
      failing.refresh(new OperationDeadline(240_000, () => nowMs)),
    ).resolves.toBeUndefined();
    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'error',
        message: expect.stringContaining('failed unexpectedly'),
      }),
    );
  });
});
