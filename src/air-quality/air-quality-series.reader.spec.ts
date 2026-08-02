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

    it('lets a run exactly AT the ceiling through', async () => {
      store.run = runRow({ runUtc: new Date(NOW - RUN_MAX_AGE_SECONDS * 1000) });
      expect((await reader.readRun()).kind).toBe('ok');
    });
  });
});
