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
import { MarineUnit, SeaBasin } from '../marine.types';
import { CmemsClient } from './cmems-client';
import type { CmemsPointValue } from './cmems-response';
import { toTilePixel } from './cmems-geo';
import { CMEMS_SELECTOR_ENTRIES } from './cmems-routing';
import { CmemsStacResolutionCache } from './cmems-stac.cache';
import { CmemsValueReader, type CmemsPointRef } from './cmems-value.reader';
import { CmemsWarmupTarget, type CmemsTourSummary } from './cmems-warmup.target';
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

/** Six Black Sea points → an 18-entry sweep queue, for the budget/concurrency tests. */
const MANY_POINTS: CmemsPointRef[] = Array.from({ length: 6 }, (_unused, index) => ({
  slugTr: `karadeniz-${String(index)}`,
  latitude: 41.9 + index * 0.01,
  longitude: 28.1 + index * 0.01,
  seaBasin: SeaBasin.BlackSea,
}));

function emptySummary(): CmemsTourSummary {
  return {
    resolutionsRefreshed: 0,
    resolutionsFailed: 0,
    resolutionsSkipped: 0,
    resolutionRetries: 0,
    refreshed: 0,
    failed: 0,
    skippedFresh: 0,
    suppressedByNegative: 0,
    deadlineSkipped: 0,
    forcedReresolves: 0,
  };
}

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
      stacCallTimeoutMs: 25_000,
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
  let events: {
    level: string;
    message: string;
    context: Readonly<Record<string, string | number | boolean | null>>;
  }[];
  let fetches: string[];
  let store: InProcessCacheStore;
  let cache: UpstreamCacheService;
  let stacCache: CmemsStacResolutionCache;
  let nowMs: number;
  let wmtsStatus: (url: string) => number;
  let stacStamp: number;
  /**
   * The STAC status as a function of WHICH stac call this is (1-based), so "the first ask fails
   * and the second lands" is expressible — the exact case the missing-resolution retry exists
   * for. A constant status cannot describe it.
   */
  let stacStatusFor: (stacCall: number) => number;

  function build(pointsOverride?: CmemsPointRef[]): {
    target: CmemsWarmupTarget;
    reader: CmemsValueReader;
  } {
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
          // Counted from `fetches`, which this call has already been pushed onto, so the first
          // catalogue call of a test is call 1.
          const status = stacStatusFor(stacCalls());
          if (status !== 200) {
            return Promise.resolve(new Response('upstream broken', { status }));
          }
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
      stacCallTimeoutMs: 25_000,
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
      loadPoints: () => Promise.resolve([...(pointsOverride ?? POINTS)]),
      now: () => nowMs,
    });
    return { target, reader };
  }

  const stacCalls = (): number => fetches.filter((url) => url.includes('product.stac.json')).length;
  const wmtsCalls = (): number => fetches.filter((url) => url.includes('teroWmts')).length;

  beforeEach(() => {
    metrics = new UpstreamMetrics();
    events = [];
    jest.spyOn(metrics, 'event').mockImplementation((level, message, context) => {
      events.push({ level, message, context });
    });
    fetches = [];
    nowMs = NOW;
    stacStamp = 202511;
    stacStatusFor = () => 200;
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

  // ── Review #82 I1 / I4 / M-VAL-1 / M-TEST-2 — the sweep loop's own edges. ──

  /** A pre-resolved ok outcome, bypassing the HTTP stack so the injected clock is exact. */
  function okOutcome(): { kind: 'ok'; value: CmemsPointValue; validAtMs: number } {
    return {
      kind: 'ok',
      value: {
        value: 21.4,
        unit: MarineUnit.Celsius,
        datasetId: 'PRODUCT/dataset',
        gridLatitude: 41.95,
        gridLongitude: 28.15,
        distanceKm: 0,
        validAtUtc: new Date(nowMs).toISOString(),
      },
      validAtMs: nowMs,
    };
  }

  it('mid-sweep budget exhaustion: in-flight entries finish, every remaining key is COUNTED as deadlineSkipped (I1)', async () => {
    const { target, reader } = build(MANY_POINTS); // 18-entry queue
    jest.spyOn(reader, 'refreshValue').mockImplementation(() => {
      // Each fetch consumes more than the whole 60 s slice — the FOUR workers have already
      // dequeued their first entry (the expiry check happens at dequeue), so exactly the
      // in-flight four land and all 14 remaining entries must be skipped, not silently lost.
      nowMs += 70_000;
      return Promise.resolve(okOutcome());
    });

    const summary = emptySummary();
    await target.sweepValues(new OperationDeadline(60_000, () => nowMs), summary);

    // The full summary asserted BY NAME (M-TEST-2): the contract is the shape of this object,
    // and 4 + 14 = 18 proves no entry fell out of the accounting.
    expect(summary).toEqual({
      resolutionsRefreshed: 0,
      resolutionsFailed: 0,
      resolutionsSkipped: 0,
      refreshed: 4,
      failed: 0,
      skippedFresh: 0,
      suppressedByNegative: 0,
      deadlineSkipped: 14,
      forcedReresolves: 0,
    });
  });

  it('the sweep never holds more than SWEEP_CONCURRENCY provider calls in flight — and does reach it (I1)', async () => {
    const { target, reader } = build(MANY_POINTS);
    let inFlight = 0;
    let maxInFlight = 0;
    jest.spyOn(reader, 'refreshValue').mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return okOutcome();
    });

    await target.sweepValues(new OperationDeadline(240_000, () => nowMs), emptySummary());
    // ≤ 4 is the §2.5 politeness bound; === 4 proves the sweep is genuinely parallel (a
    // serializing regression would pass a mere upper-bound assertion).
    expect(maxInFlight).toBe(4);
  });

  it('an unexpected refreshValue exception fails ONE entry, not its worker (I4)', async () => {
    const { target, reader } = build();
    let calls = 0;
    jest.spyOn(reader, 'refreshValue').mockImplementation(() => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('our bug'));
      return Promise.resolve(okOutcome());
    });

    const summary = emptySummary();
    await expect(
      target.sweepValues(new OperationDeadline(240_000, () => nowMs), summary),
    ).resolves.toBeUndefined();

    // All four entries accounted for: the throwing one counted as failed, the worker went on.
    expect(summary.failed).toBe(1);
    expect(summary.refreshed).toBe(3);
    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'error',
        message: expect.stringContaining('sweep entry failed unexpectedly'),
      }),
    );
  });

  it('a broken STAC upstream lands in resolutionsFailed, by name (validator note)', async () => {
    const { target } = build();
    stacStatusFor = () => 500;
    const summary = emptySummary();
    await target.refreshResolutions(new OperationDeadline(240_000, () => nowMs), summary);
    expect(summary.resolutionsRefreshed).toBe(0);
    expect(summary.resolutionsFailed).toBe(4);
    // MISSING resolutions, so each product is asked a SECOND time in the same tour (SST fix M2):
    // 4 products × (2 asks × 2 client attempts) = 16 catalogue calls, and four retries counted.
    expect(summary.resolutionRetries).toBe(4);
    expect(stacCalls()).toBe(16);
  });

  it('does NOT retry a product whose stored resolution is merely stale (missing ≠ stale)', async () => {
    const { target } = build();
    await target.refreshResolutions(new OperationDeadline(240_000, () => nowMs));
    fetches = [];

    // Past the 6 h STAC TTL: all four are due again, but each one HAS a stored resolution that
    // keeps serving, so a failed re-ask costs nobody anything and buys no second call.
    nowMs += 21_601_000;
    stacStatusFor = () => 500;
    const summary = emptySummary();
    await target.refreshResolutions(new OperationDeadline(240_000, () => nowMs), summary);

    expect(summary.resolutionsFailed).toBe(4);
    expect(summary.resolutionRetries).toBe(0);
    // 4 products × 2 client attempts, and no third: the retry pass is empty.
    expect(stacCalls()).toBe(8);
  });

  it('a missing resolution that fails once and lands on the retry counts as REFRESHED', async () => {
    const { target } = build();
    // The first pass is 4 products × 2 client attempts = 8 calls; everything after it is the
    // retry pass, which succeeds on its first attempt.
    stacStatusFor = (call) => (call <= 8 ? 500 : 200);
    const summary = emptySummary();
    await target.refreshResolutions(new OperationDeadline(240_000, () => nowMs), summary);

    expect(summary.resolutionsRefreshed).toBe(4);
    expect(summary.resolutionsFailed).toBe(0);
    expect(summary.resolutionRetries).toBe(4);
    expect(stacCalls()).toBe(12);
  });

  it('skips the retry pass when the slice ran out, and still counts the product failed', async () => {
    const { target } = build();
    const deadline = new OperationDeadline(10_000, () => nowMs);
    stacStatusFor = (call) => {
      // The slice expires exactly as the first pass ends (call 8 = product 4, attempt 2).
      if (call === 8) nowMs += 10_001;
      return 500;
    };
    const summary = emptySummary();
    await target.refreshResolutions(deadline, summary);

    expect(stacCalls()).toBe(8);
    expect(summary.resolutionRetries).toBe(0);
    expect(summary.resolutionsFailed).toBe(4);
    expect(summary.resolutionsSkipped).toBe(0);
  });

  it('an exhausted deadline COUNTS the products the resolution phase leaves behind (M-VAL-1)', async () => {
    const { target } = build();
    const spent = new OperationDeadline(1, () => nowMs);
    nowMs += 5;
    const summary = emptySummary();
    await target.refreshResolutions(spent, summary);
    expect(stacCalls()).toBe(0);
    expect(summary.resolutionsSkipped).toBe(4);
    expect(summary.resolutionsFailed).toBe(0);
  });

  it('says the SCALE of a resolution failure at WARN, once per tour (SST fix M3)', async () => {
    const { target } = build();
    stacStatusFor = () => 500;

    await target.refresh(new OperationDeadline(240_000, () => nowMs));

    const scaleLines = events.filter((event) =>
      event.message.includes('CMEMS STAC resolution failed this tour'),
    );
    expect(scaleLines).toHaveLength(1);
    expect(scaleLines[0]?.level).toBe('warn');
    // The counters are the point: an operator greping for warnings could previously see only
    // per-key lines and read a 21-point outage as a single point.
    expect(scaleLines[0]?.context).toEqual(
      expect.objectContaining({ resolutionsFailed: 4, resolutionRetries: 4 }),
    );
  });

  it('and stays silent on a healthy tour — the same assertion, with nothing to find', async () => {
    const { target } = build();
    await target.refresh(new OperationDeadline(240_000, () => nowMs));

    expect(
      events.filter((event) => event.message.includes('CMEMS STAC resolution failed this tour')),
    ).toHaveLength(0);
    // Proof the tour really ran rather than the filter looking in an empty list.
    expect(events.some((event) => event.message.includes('CMEMS warmup slice done'))).toBe(true);
  });
});
