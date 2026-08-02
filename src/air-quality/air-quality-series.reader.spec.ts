import { beforeEach, describe, expect, it } from '@jest/globals';
import type {
  CachedRead,
  ReadThroughOptions,
  UpstreamCacheService,
} from '../upstream/cache/upstream-cache.service';
import { OperationDeadline } from '../upstream/operation-deadline';
import { UpstreamMetrics } from '../upstream/upstream-metrics';
import type { CompiledRun } from './air-quality-compile';
import type { AirQualityReadStorePort, AirQualityRunSeriesRow } from './air-quality-read.store';
import { AIR_QUALITY_RUN_CACHE_KEY, AirQualitySeriesReader } from './air-quality-series.reader';
import { CAMS_ADS_PROVIDER, type AirQualityUpstreamConfig } from './air-quality-upstream.config';
import { ALL_AIR_QUALITY_POLLUTANTS } from './air-quality.types';
import type {
  AirQualityRun,
  AirQualityStoredConcentrations,
  AirQualityStoredSupport,
} from './entities/air-quality-run.entity';

/**
 * The reader's OWN policies, against a pass-through cache fake: which run is served, the
 * never-throw refresh contract, the loud row-skip, and BOTH halves of the run-age ceiling. The
 * real `UpstreamCacheService` semantics (TTLs, single-flight, stale-while-revalidate) have their
 * own spec; what must be proven HERE is what the reader hands the cache and what it refuses to
 * let out of it.
 *
 * Structural throughout — the concentrations are synthetic and no assertion claims an air-quality
 * fact.
 */

const RUN_UTC = new Date('2026-08-02T00:00:00.000Z');
const NOW = Date.parse('2026-08-02T06:00:00.000Z');
const RUN_MAX_AGE_SECONDS = 172_800;

function makeConfig(): AirQualityUpstreamConfig {
  return {
    enabled: true,
    ingestEnabled: true,
    analysisEnabled: true,
    ingestIntervalSeconds: 900,
    ingestDeadlineMs: 300_000,
    budgets: { [CAMS_ADS_PROVIDER]: { perMinute: 30, perHour: 120, perDay: 400 } },
    ttls: {
      ok: 3_600,
      no_data: 86_400,
      transient: 60,
      rate_limited: 300,
      client_error: 900,
      schema_error: 300,
    },
    ceilings: { staleMaxSeconds: 43_200, validAtMaxAgeSeconds: 5_400 },
    runMaxAgeSeconds: RUN_MAX_AGE_SECONDS,
    ads: {
      baseUrl: 'https://ads.test',
      datasetId: 'cams-europe-air-quality-forecasts',
      objectStoreHosts: ['object-store.test'],
      apiKey: null,
      area: [42.5, 25.5, 35.5, 45],
      forecastHours: 3,
      submitAfterUtcHour: 8,
      maxAttemptsPerJob: 3,
      pollTimeoutMs: 15_000,
      downloadTimeoutMs: 180_000,
      tourBudgetMs: 60_000,
      runMaxBytes: 67_108_864,
    },
  };
}

/**
 * A cache whose `read` simply RUNS the refresh closure and maps its outcome — the pass-through
 * seam that exposes exactly what the closure returned. `canned` simulates the real cache
 * answering from a stale entry WITHOUT running the closure, which is the state the exit-side
 * ceiling exists for.
 */
class PassThroughCache {
  canned: CachedRead<CompiledRun> | null = null;
  lastKey: string | null = null;
  lastDeadlineMs: number | null = null;

  async read<T>(options: ReadThroughOptions<T>): Promise<CachedRead<T>> {
    this.lastKey = options.key;
    this.lastDeadlineMs = options.deadlineMs;
    if (this.canned !== null) return this.canned as unknown as CachedRead<T>;

    const outcome = await options.refresh(new OperationDeadline(options.deadlineMs, () => NOW));
    if (outcome.kind === 'ok') {
      return {
        value: outcome.value,
        kind: 'ok',
        freshness: 'fresh',
        cacheAgeSeconds: 0,
        staleSinceUtc: null,
        validAtUtc: outcome.validAtMs === null ? null : new Date(outcome.validAtMs).toISOString(),
        fetchedAtUtc: new Date(NOW).toISOString(),
        reason: null,
        origin: 'refreshed',
      };
    }
    return {
      value: null,
      kind: outcome.kind,
      freshness: null,
      cacheAgeSeconds: null,
      staleSinceUtc: null,
      validAtUtc: null,
      fetchedAtUtc: null,
      reason: 'reason' in outcome ? outcome.reason : null,
      origin: 'refreshed',
    };
  }
}

function block(steps: number, value: number | null = 10): AirQualityStoredConcentrations {
  const values = {} as AirQualityStoredConcentrations;
  for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) {
    values[pollutant] = Array.from({ length: steps }, () => value);
  }
  return values;
}

function support(): AirQualityStoredSupport {
  const verdicts = {} as AirQualityStoredSupport;
  for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) verdicts[pollutant] = 'ok';
  return verdicts;
}

function seriesRow(plateCode: string, steps = 4): AirQualityRunSeriesRow {
  return {
    plateCode,
    gridLatitude: 39.95,
    gridLongitude: 32.85,
    distanceKm: 3.1,
    concentrations: block(steps),
    support: support(),
    analysisConcentrations: null,
    analysisSupport: null,
    ingestedAt: new Date(NOW),
  };
}

function runRow(overrides: Partial<AirQualityRun> = {}): AirQualityRun {
  return {
    runUtc: RUN_UTC,
    state: 'serviceable',
    forecastHours: 3,
    analysisHours: 0,
    datasetId: 'cams-europe-air-quality-forecasts',
    adsRequests: [],
    lastError: null,
    lastErrorClass: null,
    bytesDownloaded: 1,
    fileFormat: null,
    decoderVersion: null,
    startedAt: RUN_UTC,
    completedAt: RUN_UTC,
    ...overrides,
  };
}

/**
 * One province exactly as a healthy `CompiledRun` carries it.
 *
 * `steps` defaults to 1 to match `cannedOk`'s single-step `timesUtc`; passing anything else is how
 * the array-length parity case (review #84 NM-4) is built.
 */
function cachedProvince(steps = 1): Record<string, unknown> {
  const concentrations: Record<string, (number | null)[]> = {};
  const verdicts: Record<string, string> = {};
  for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) {
    concentrations[pollutant] = Array.from({ length: steps }, () => 10);
    verdicts[pollutant] = 'ok';
  }
  return {
    plateCode: '06',
    gridLatitude: 39.95,
    gridLongitude: 32.85,
    distanceKm: 3.1,
    ingestedAtUtc: new Date(NOW).toISOString(),
    concentrations,
    support: verdicts,
  };
}

/**
 * A cache entry the service returns WITHOUT running the refresh closure, with `overrides` applied
 * to the payload — i.e. exactly the seam a previous deployment's `CompiledRun` arrives through.
 * Typed loosely on purpose: the point of these fixtures is shapes the type says cannot exist.
 */
function cannedOk(overrides: Record<string, unknown>): CachedRead<CompiledRun> {
  const payload: Record<string, unknown> = {
    runUtc: RUN_UTC.toISOString(),
    datasetId: 'cams-europe-air-quality-forecasts',
    analysisEndUtc: null,
    stepHours: 1,
    timesUtc: [new Date(NOW).toISOString()],
    horizonEndUtc: new Date(NOW).toISOString(),
    provinces: [cachedProvince()],
    ...overrides,
  };
  return {
    value: payload as unknown as CompiledRun,
    kind: 'ok',
    freshness: 'fresh',
    cacheAgeSeconds: 10,
    staleSinceUtc: null,
    validAtUtc: new Date(NOW).toISOString(),
    fetchedAtUtc: new Date(NOW).toISOString(),
    reason: null,
    origin: 'fresh_hit',
  };
}

/** A well-shaped cached run that is simply too OLD — the exit-side ceiling's input. */
function cannedStale(overrides: { cacheAgeSeconds: number }): CachedRead<CompiledRun> {
  const read = cannedOk({
    runUtc: new Date(NOW - (RUN_MAX_AGE_SECONDS + 60) * 1000).toISOString(),
  });
  return { ...read, ...overrides, freshness: 'stale', origin: 'stale_revalidating' };
}

class FakeStore implements AirQualityReadStorePort {
  run: AirQualityRun | null = runRow();
  rows: AirQualityRunSeriesRow[] = [seriesRow('06'), seriesRow('34')];
  runThrows = false;
  rowsThrow = false;

  newestServiceableRun(): Promise<AirQualityRun | null> {
    if (this.runThrows) return Promise.reject(new Error('connection terminated'));
    return Promise.resolve(this.run);
  }

  seriesForRun(): Promise<AirQualityRunSeriesRow[]> {
    if (this.rowsThrow) return Promise.reject(new Error('connection terminated'));
    return Promise.resolve(this.rows);
  }
}

describe('AirQualitySeriesReader', () => {
  let cache: PassThroughCache;
  let store: FakeStore;
  let metrics: UpstreamMetrics;
  let reader: AirQualitySeriesReader;

  beforeEach(() => {
    cache = new PassThroughCache();
    store = new FakeStore();
    metrics = new UpstreamMetrics();
    metrics.resetForTest();
    reader = new AirQualitySeriesReader(
      cache as unknown as UpstreamCacheService,
      store,
      makeConfig(),
      metrics,
      () => NOW,
    );
  });

  it('reads ONE run key for the whole leg (hub and detail cannot diverge)', async () => {
    await reader.readRun();
    expect(cache.lastKey).toBe(AIR_QUALITY_RUN_CACHE_KEY);
  });

  it('compiles the stored run and publishes every readable province', async () => {
    const read = await reader.readRun();
    expect(read.kind).toBe('ok');
    expect(read.value?.provinces.map((province) => province.plateCode)).toEqual(['06', '34']);
    expect(read.value?.runUtc).toBe(RUN_UTC.toISOString());
  });

  it('degrades to transient — never a throw — when no servable run is stored', async () => {
    store.run = null;
    const read = await reader.readRun();
    expect(read.kind).toBe('transient');
    expect(read.value).toBeNull();
  });

  it('degrades to transient and logs when the store itself fails (never a 500)', async () => {
    store.runThrows = true;
    const read = await reader.readRun();
    expect(read.kind).toBe('transient');
    store.runThrows = false;
    store.rowsThrow = true;
    expect((await reader.readRun()).kind).toBe('transient');
  });

  it('SKIPS an unreadable province row loudly and still serves the others', async () => {
    store.rows = [seriesRow('06', 3), seriesRow('34')];
    const read = await reader.readRun();
    expect(read.kind).toBe('ok');
    expect(read.value?.provinces.map((province) => province.plateCode)).toEqual(['34']);
    expect(metrics.get('ingest.corrupt_row_skipped', CAMS_ADS_PROVIDER)).toBe(1);
  });

  it('degrades to schema_error when EVERY row is unreadable, without throwing', async () => {
    store.rows = [seriesRow('06', 3), seriesRow('34', 9)];
    const read = await reader.readRun();
    expect(read.kind).toBe('schema_error');
    expect(read.value).toBeNull();
    expect(metrics.get('ingest.corrupt_row_skipped', CAMS_ADS_PROVIDER)).toBe(2);
  });

  it('never raises the ingest contract signal from a read (D-A2b-3)', async () => {
    store.rows = [seriesRow('06', 3)];
    await reader.readRun();
    // `airq.contract_refusal` answers "is the PROVIDER drifting?" — a corrupt row in our own
    // store must not contaminate it.
    expect(metrics.get('airq.contract_refusal', CAMS_ADS_PROVIDER)).toBe(0);
    expect(metrics.get('airq.decoder_bug', CAMS_ADS_PROVIDER)).toBe(0);
  });

  describe('the run-age ceiling is applied on BOTH sides', () => {
    it('REFRESH side: suppresses an over-age run and owns the counter', async () => {
      store.run = runRow({ runUtc: new Date(NOW - (RUN_MAX_AGE_SECONDS + 60) * 1000) });
      const read = await reader.readRun();
      expect(read.kind).toBe('transient');
      expect(read.value).toBeNull();
      expect(metrics.get('airq.run_age_ceiling', CAMS_ADS_PROVIDER)).toBe(1);
    });

    it('EXIT side: suppresses a CACHED run that aged past the ceiling, WITHOUT the counter', async () => {
      // The measured marine lesson (#76 SFH-3): with the check only inside `refresh`,
      // stale-while-revalidate keeps serving a pre-breach value for the whole stale window.
      const staleRun: CompiledRun = {
        runUtc: new Date(NOW - (RUN_MAX_AGE_SECONDS + 60) * 1000).toISOString(),
        datasetId: 'cams-europe-air-quality-forecasts',
        analysisEndUtc: null,
        stepHours: 1,
        timesUtc: [new Date(NOW).toISOString()],
        horizonEndUtc: new Date(NOW).toISOString(),
        provinces: [],
      };
      cache.canned = {
        value: staleRun,
        kind: 'ok',
        freshness: 'stale',
        cacheAgeSeconds: 10,
        staleSinceUtc: null,
        validAtUtc: new Date(NOW).toISOString(),
        fetchedAtUtc: new Date(NOW).toISOString(),
        reason: null,
        origin: 'stale_revalidating',
      };
      const read = await reader.readRun();
      expect(read.value).toBeNull();
      expect(read.kind).toBe('transient');
      expect(read.freshness).toBeNull();
      // The exit side runs once per REQUEST, so it must not inflate the counter the refresh side
      // owns — the counter has to stay "the ceiling fired", not a traffic count.
      expect(metrics.get('airq.run_age_ceiling', CAMS_ADS_PROVIDER)).toBe(0);
    });

    it('publishes NO cache age for a run it refused (review #84 I1 / CR-11)', async () => {
      // The suppressed entry's own age describes data this response does not carry. Marine ruled
      // the class out at #82 I5; the header must not say "4 minutes old" beside an empty payload.
      cache.canned = cannedStale({ cacheAgeSeconds: 240 });
      const read = await reader.readRun();
      expect(read.value).toBeNull();
      expect(read.cacheAgeSeconds).toBeNull();
      expect(read.validAtUtc).toBeNull();
    });

    it('lets a run exactly AT the ceiling through', async () => {
      store.run = runRow({ runUtc: new Date(NOW - RUN_MAX_AGE_SECONDS * 1000) });
      expect((await reader.readRun()).kind).toBe('ok');
    });
  });

  /**
   * Review #84 CR-6. `UpstreamCacheService` validates the ENVELOPE and explicitly delegates the
   * PAYLOAD to whoever wrote it; the key is unversioned and entries survive a deploy for up to
   * 12 h. Every shape below is one a previous version could plausibly have written, and each one
   * used to reach `new Date(...).toISOString()` on the REQUEST path — a `RangeError` outside the
   * never-throw closure, with no global exception filter to catch it.
   */
  describe('a CACHED payload of the wrong shape degrades instead of throwing', () => {
    const unusable: [string, Record<string, unknown>][] = [
      ['an unparseable runUtc', { runUtc: 'not-an-instant' }],
      ['a missing runUtc', { runUtc: undefined }],
      ['a missing datasetId', { datasetId: undefined }],
      ['a non-numeric stepHours', { stepHours: '1' }],
      ['a missing horizonEndUtc', { horizonEndUtc: undefined }],
      ['an analysisEndUtc that is neither string nor null', { analysisEndUtc: 0 }],
      ['a non-array timesUtc', { timesUtc: 'not-an-array' }],
      ['an empty timesUtc', { timesUtc: [] }],
      ['a non-string step in timesUtc', { timesUtc: [123] }],
      ['a non-array provinces', { provinces: { '06': {} } }],
      ['a province that is not an object', { provinces: ['06'] }],
      ['a province with no plate code', { provinces: [{ ...cachedProvince(), plateCode: '' }] }],
      [
        'a province with no ingestedAtUtc',
        { provinces: [{ ...cachedProvince(), ingestedAtUtc: undefined }] },
      ],
      [
        'a province whose concentrations block is not an object',
        { provinces: [{ ...cachedProvince(), concentrations: null }] },
      ],
      [
        'a province missing one pollutant array',
        { provinces: [{ ...cachedProvince(), concentrations: { pm2_5: [1] } }] },
      ],
      [
        'a province whose support verdict is not a verdict',
        { provinces: [{ ...cachedProvince(), support: { pm2_5: 'maybe' } }] },
      ],
      [
        'a province with a non-finite coordinate',
        { provinces: [{ ...cachedProvince(), gridLatitude: Number.NaN }] },
      ],
      // Review #84 NM-3: these four members used to be typeof-only, so an unparseable-yet-string
      // instant passed a guard whose refusal message already claimed "instants" and was published
      // into contract fields the web formats as dates.
      ['an unparseable step in timesUtc', { timesUtc: ['not-an-instant'] }],
      ['an unparseable horizonEndUtc', { horizonEndUtc: 'not-an-instant' }],
      ['an unparseable analysisEndUtc', { analysisEndUtc: 'not-an-instant' }],
      [
        'a province with an unparseable ingestedAtUtc',
        { provinces: [{ ...cachedProvince(), ingestedAtUtc: 'not-an-instant' }] },
      ],
      // Review #84 NM-4: the one `CompiledRun` invariant the widened guard did not cover. Two
      // concentration entries against a one-step `timesUtc` publishes misaligned parallel arrays.
      [
        'a province whose concentrations disagree with timesUtc',
        { provinces: [cachedProvince(2)] },
      ],
    ];

    for (const [label, overrides] of unusable) {
      it(`degrades to schema_error on ${label}`, async () => {
        cache.canned = cannedOk(overrides);
        const read = await reader.readRun();
        expect(read.kind).toBe('schema_error');
        expect(read.value).toBeNull();
        // …and it says WHY, so the operator is not left guessing which member drifted.
        expect(read.reason).toContain('the cached run is unusable');
        // No stale age rides an empty payload out (review #84 I1).
        expect(read.cacheAgeSeconds).toBeNull();
      });
    }

    it('still serves a payload that DOES hold the written shape', async () => {
      cache.canned = cannedOk({});
      const read = await reader.readRun();
      expect(read.kind).toBe('ok');
      expect(read.value?.provinces.map((province) => province.plateCode)).toEqual(['06']);
      expect(read.cacheAgeSeconds).toBe(10);
      expect(metrics.get('airq.cached_run_unusable', CAMS_ADS_PROVIDER)).toBe(0);
    });

    /**
     * Review #84 round-2 ruling. This condition is detectable ONLY on the exit side: the refresh
     * half recompiles with today's code, so `airq.run_unreadable` can never fire for it. Left
     * uncounted it produced zero events, ever, while both public endpoints answered 100 %
     * `unavailable` — fail-soft hiding a genuine fault.
     */
    it('COUNTS the condition once per throttle window, not once per request', async () => {
      cache.canned = cannedOk({ runUtc: 'not-an-instant' });
      await reader.readRun();
      expect(metrics.get('airq.cached_run_unusable', CAMS_ADS_PROVIDER)).toBe(1);

      // Nine more requests inside the same 60 s window. A per-request counter would read 10 here,
      // which is what makes "how often did this fire?" a traffic reading; the emission gate keeps
      // it at 1. The SUPPRESSION still applies to every one of them.
      for (let attempt = 0; attempt < 9; attempt += 1) {
        expect((await reader.readRun()).kind).toBe('schema_error');
      }
      expect(metrics.get('airq.cached_run_unusable', CAMS_ADS_PROVIDER)).toBe(1);
      // …and it never borrows the refresh half's counters, which answer different questions.
      expect(metrics.get('airq.run_unreadable', CAMS_ADS_PROVIDER)).toBe(0);
      expect(metrics.get('airq.run_age_ceiling', CAMS_ADS_PROVIDER)).toBe(0);
    });
  });

  /**
   * Review #84 NI-1: the post-cache R2 pass runs once per public REQUEST while the compile pass
   * runs once per refresh, so they cannot share one counter — a corrupt cached payload would make
   * "how many stored values are bad" a function of traffic and drown the compile signal in the
   * same series.
   */
  describe('the two R2 passes report at their own cadences', () => {
    it('counts the POST-CACHE pass once per window, under its own name', () => {
      reader.reportPostCacheNormalisation(39_000, RUN_UTC.toISOString());
      expect(metrics.get('airq.cached_concentration_normalised', CAMS_ADS_PROVIDER)).toBe(1);
      // The compile pass's magnitude counter must be untouched by request traffic.
      expect(metrics.get('airq.concentration_normalised', CAMS_ADS_PROVIDER)).toBe(0);

      for (let request = 0; request < 9; request += 1) {
        reader.reportPostCacheNormalisation(39_000, RUN_UTC.toISOString());
      }
      // Ten requests, one window: the number says "the condition fired", not "we served traffic".
      expect(metrics.get('airq.cached_concentration_normalised', CAMS_ADS_PROVIDER)).toBe(1);
    });

    it('stays silent when nothing was substituted', () => {
      reader.reportPostCacheNormalisation(0, RUN_UTC.toISOString());
      expect(metrics.get('airq.cached_concentration_normalised', CAMS_ADS_PROVIDER)).toBe(0);
    });

    it('counts the COMPILE pass BY the substitution count, under the other name', async () => {
      // A stored −999 is the R2 condition at compile time: 5 pollutants × 4 steps = 20 values.
      store.rows = [
        {
          ...seriesRow('06'),
          concentrations: block(4, -999),
        },
      ];
      expect((await reader.readRun()).kind).toBe('ok');
      expect(metrics.get('airq.concentration_normalised', CAMS_ADS_PROVIDER)).toBe(20);
      expect(metrics.get('airq.cached_concentration_normalised', CAMS_ADS_PROVIDER)).toBe(0);
    });
  });

  /** The store-failure counter added at review #84 SFH-4 — "the database was unreachable". */
  it('counts a store read failure apart from the data-shape classes', async () => {
    store.runThrows = true;
    expect((await reader.readRun()).kind).toBe('transient');
    expect(metrics.get('airq.store_read_failed', CAMS_ADS_PROVIDER)).toBe(1);
    expect(metrics.get('airq.run_unreadable', CAMS_ADS_PROVIDER)).toBe(0);
  });

  /** …and its sibling: a run whose every row is unreadable (SFH-4). */
  it('counts a run that holds no readable row at all', async () => {
    store.rows = [seriesRow('06', 3), seriesRow('34', 9)];
    expect((await reader.readRun()).kind).toBe('schema_error');
    expect(metrics.get('airq.run_unreadable', CAMS_ADS_PROVIDER)).toBe(1);
    expect(metrics.get('airq.store_read_failed', CAMS_ADS_PROVIDER)).toBe(0);
  });
});
