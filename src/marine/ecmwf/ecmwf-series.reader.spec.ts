import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type {
  CachedRead,
  ReadThroughOptions,
  UpstreamCacheService,
} from '../../upstream/cache/upstream-cache.service';
import { OperationDeadline } from '../../upstream/operation-deadline';
import { UpstreamMetrics } from '../../upstream/upstream-metrics';
import type { MarinePoint } from '../entities/marine-point.entity';
import type { MarineEcmwfCycle } from '../entities/marine-ecmwf-cycle.entity';
import type {
  EcmwfStoredSeries,
  MarineEcmwfPointSeries,
} from '../entities/marine-ecmwf-point-series.entity';
import type { MarineUpstreamConfig } from '../marine-upstream.config';
import { MarineSource } from '../marine.types';
import type { EcmwfIngestStorePort, NewestPointSeries } from './ecmwf-ingest.store';
import { EcmwfSeriesReader, type EcmwfPointSeriesRead } from './ecmwf-series.reader';

/**
 * The reader's OWN policies, unit-tested against a pass-through cache fake: the cycle
 * precedence (CR-1), the never-throw refresh contract (SFH-7) and the EXIT half of the third
 * staleness ceiling (SFH-3). The real `UpstreamCacheService` semantics (TTLs, single-flight,
 * stale-while-revalidate) have their own spec; what must be proven HERE is what the reader
 * hands that cache and what it refuses to let OUT of it. Structural throughout — no weather
 * numbers.
 */

const NOW = Date.parse('2026-07-30T22:00:00.000Z');
const POINT = { id: 'p1', slugTr: 'nokta-bir' } as Pick<MarinePoint, 'id' | 'slugTr'>;

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
      tourBudgetMs: 60_000,
      maxStepsPerTour: 2,
      tourMaxBytes: 10_000_000,
      cycleMaxBytes: 20_000_000,
      maxRangeBytes: 8_388_608,
      cycleMaxAgeSeconds: 86_400,
      staleMaxSeconds: 43_200,
    },
  };
}

/**
 * A cache whose `read` simply RUNS the refresh closure and maps its outcome — the pass-through
 * seam that exposes exactly what the closure returned. `stale-while-revalidate` behaviour is
 * simulated by `canned`: when set, the closure is NOT run and the canned value is served, which
 * is what the real cache does when it answers from a stale entry.
 */
class PassThroughCache {
  canned: CachedRead<EcmwfPointSeriesRead> | null = null;
  lastKey: string | null = null;

  async read<T>(options: ReadThroughOptions<T>): Promise<CachedRead<T>> {
    this.lastKey = options.key;
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

function seriesRow(cycleUtc: Date, values: EcmwfStoredSeries): NewestPointSeries {
  const cycle = {
    cycleUtc,
    stepsDone: values.steps,
    stepHours: 3,
    forecastHours: 6,
    bytesDownloaded: 1,
    startedAt: cycleUtc,
    completedAt: null,
    packingType: 'grib2 template 5.42',
    decoderVersion: 'spec-1',
  } as MarineEcmwfCycle;
  return {
    cycle,
    series: {
      cycleUtc,
      marinePointId: POINT.id,
      gridLatitude: 41.25,
      gridLongitude: 29.5,
      distanceKm: 10.7,
      values,
      support: { u10: 'ok', v10: 'ok', swh: 'ok', mwd: 'ok' },
      ingestedAt: cycleUtc,
      cycle,
    } as MarineEcmwfPointSeries,
  };
}

function storedValues(steps: number[]): EcmwfStoredSeries {
  return {
    steps,
    u10: steps.map(() => 5),
    v10: steps.map(() => 0),
    swh: steps.map(() => 0.5),
    mwd: steps.map(() => 90),
  };
}

class FakeStore implements Partial<EcmwfIngestStorePort> {
  rows: NewestPointSeries[] = [];
  /** When set, the read REJECTS — the Postgres-blip fixture (round-2 CR2R-1). */
  failWith: Error | null = null;

  recentSeriesForPoint(): Promise<NewestPointSeries[]> {
    return this.failWith === null ? Promise.resolve(this.rows) : Promise.reject(this.failWith);
  }
}

interface RecordedEvent {
  level: string;
  message: string;
}

describe('EcmwfSeriesReader', () => {
  let cache: PassThroughCache;
  let store: FakeStore;
  let metrics: UpstreamMetrics;
  let events: RecordedEvent[];
  let reader: EcmwfSeriesReader;

  beforeEach(() => {
    cache = new PassThroughCache();
    store = new FakeStore();
    metrics = new UpstreamMetrics();
    events = [];
    jest.spyOn(metrics, 'event').mockImplementation((level, message) => {
      events.push({ level, message });
    });
    reader = new EcmwfSeriesReader(
      cache as unknown as UpstreamCacheService,
      store as unknown as EcmwfIngestStorePort,
      makeConfig(),
      metrics,
      () => NOW,
    );
  });

  it('serves the retained cycle with the LONGEST published run, not blindly the newest (CR-1)', async () => {
    const complete = new Date(NOW - 10 * 3_600_000); // 12z-style incumbent, 3 contiguous steps
    const fresh = new Date(NOW - 4 * 3_600_000); // newer cycle, first step just landed
    store.rows = [
      seriesRow(fresh, storedValues([3])),
      seriesRow(complete, storedValues([0, 3, 6])),
    ];

    const read = await reader.readSeries(POINT);
    expect(read.kind).toBe('ok');
    expect(read.value?.series.modelRunAtUtc).toBe(complete.toISOString());
    expect(read.value?.series.timesUtc.length).toBe(3);
  });

  it('hands the win to the newer cycle once its run is at least as long', async () => {
    const older = new Date(NOW - 10 * 3_600_000);
    const newer = new Date(NOW - 4 * 3_600_000);
    store.rows = [
      seriesRow(newer, storedValues([0, 3, 6])),
      seriesRow(older, storedValues([0, 3, 6])),
    ];

    const read = await reader.readSeries(POINT);
    expect(read.value?.series.modelRunAtUtc).toBe(newer.toISOString());
  });

  it('maps a corrupt stored row to schema_error instead of throwing — the refresh contract (SFH-7)', async () => {
    const cycleUtc = new Date(NOW - 4 * 3_600_000);
    // Parallel-array corruption: 2 steps, 1 u10 sample — `assertParallel` refuses this.
    store.rows = [seriesRow(cycleUtc, { ...storedValues([0, 3]), u10: [5] })];

    const read = await reader.readSeries(POINT);
    expect(read.kind).toBe('schema_error');
    expect(read.value).toBeNull();
    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'error',
        message: expect.stringContaining('contract guard'),
      }),
    );
  });

  it('maps a jsonb row whose values are NOT the written shape to schema_error, not a TypeError (CR2R-1)', async () => {
    const cycleUtc = new Date(NOW - 4 * 3_600_000);
    const row = seriesRow(cycleUtc, storedValues([0, 3]));
    // jsonb is schemaless: a `values` of null would die as a TypeError on `.steps` — the
    // readable-candidate guard must turn it into a deterministic contract refusal instead.
    store.rows = [
      {
        cycle: row.cycle,
        series: { ...row.series, values: null } as unknown as typeof row.series,
      },
    ];

    const read = await reader.readSeries(POINT);
    expect(read.kind).toBe('schema_error');
    expect(read.value).toBeNull();
    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'error',
        message: expect.stringContaining('contract guard'),
      }),
    );
  });

  it('maps a store I/O failure to transient — a Postgres blip must degrade, never 500 (CR2R-1)', async () => {
    store.failWith = new Error('connection terminated unexpectedly');

    const read = await reader.readSeries(POINT);
    expect(read.kind).toBe('transient');
    expect(read.value).toBeNull();
    expect(read.reason).toContain('store could not be read');
    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'error',
        message: expect.stringContaining('store read failed'),
      }),
    );
  });

  it('suppresses a stale cycle inside refresh, LOUDLY, with the counter (SPEC §9.4)', async () => {
    store.rows = [seriesRow(new Date(NOW - 30 * 3_600_000), storedValues([0, 3]))];

    const read = await reader.readSeries(POINT);
    expect(read.kind).toBe('transient');
    expect(read.value).toBeNull();
    expect(metrics.get('ingest.cycle_age_ceiling', 'ecmwf')).toBe(1);
  });

  it('suppresses a stale cycle on the way OUT of the cache too — SWR cannot outlive the ceiling (SFH-3)', async () => {
    // Simulate the M2 cache serving a stale-while-revalidate entry compiled BEFORE the breach:
    // the refresh closure is never run, the cached value's model cycle is now 30 h old.
    const staleCycle = new Date(NOW - 30 * 3_600_000);
    cache.canned = {
      value: {
        series: {
          stepHours: 3,
          timesUtc: [new Date(NOW).toISOString()],
          seaSurfaceTemperature: [null],
          waveHeight: [0.5],
          waveDirection: [90],
          windSpeed10m: [5],
          windDirection10m: [270],
          source: MarineSource.Ecmwf,
          modelRunAtUtc: staleCycle.toISOString(),
          horizonEndUtc: new Date(NOW).toISOString(),
          support: { u10: 'ok', v10: 'ok', swh: 'ok', mwd: 'ok' },
          validAtMs: NOW,
        },
        gridLatitude: 41.25,
        gridLongitude: 29.5,
        distanceKm: 10.7,
      },
      kind: 'ok',
      freshness: 'stale',
      cacheAgeSeconds: 40_000,
      staleSinceUtc: new Date(NOW - 40_000_000).toISOString(),
      validAtUtc: new Date(NOW).toISOString(),
      fetchedAtUtc: new Date(NOW - 40_000_000).toISOString(),
      reason: null,
      origin: 'stale_after_failure',
    };

    const read = await reader.readSeries(POINT);
    expect(read.kind).toBe('transient');
    expect(read.value).toBeNull();
    expect(read.reason).toContain('cycle-age ceiling');
    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        message: expect.stringContaining('on exit'),
      }),
    );

    // The exit half runs once per REQUEST, so its reporting is bounded (round-2 R2-SFH-A):
    // the counter belongs to the refresh half alone — a fresh cache hit must not turn
    // `ingest.cycle_age_ceiling` into a traffic-proportional number — and the warn repeats
    // through a throttle: a second immediate read suppresses the same value again but logs
    // nothing new.
    expect(metrics.get('ingest.cycle_age_ceiling', 'ecmwf')).toBe(0);
    const warnsAfterFirst = events.filter((event) => event.message.includes('on exit')).length;
    const second = await reader.readSeries(POINT);
    expect(second.kind).toBe('transient');
    expect(second.value).toBeNull();
    expect(events.filter((event) => event.message.includes('on exit')).length).toBe(
      warnsAfterFirst,
    );
  });

  it('serves the usable cycle when the retained set MIXES usable and ceiling-breached rows', async () => {
    const usable = new Date(NOW - 4 * 3_600_000);
    const breached = new Date(NOW - 30 * 3_600_000);
    store.rows = [seriesRow(usable, storedValues([0, 3])), seriesRow(breached, storedValues([0]))];

    const read = await reader.readSeries(POINT);
    expect(read.kind).toBe('ok');
    expect(read.value?.series.modelRunAtUtc).toBe(usable.toISOString());
    // A breached candidate merely dropping out of the race is not a suppression: no ceiling
    // event, no counter — those fire only when EVERY retained cycle has breached.
    expect(metrics.get('ingest.cycle_age_ceiling', 'ecmwf')).toBe(0);
  });

  it('answers a cold store honestly: transient, so the very next tour can fix it', async () => {
    const read = await reader.readSeries(POINT);
    expect(read.kind).toBe('transient');
    expect(read.value).toBeNull();
    expect(cache.lastKey).toBe(`marine:ecmwf:series:${POINT.slugTr}`);
  });
});
