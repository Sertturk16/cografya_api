import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CircuitBreaker } from '../../upstream/circuit-breaker';
import { OperationDeadline } from '../../upstream/operation-deadline';
import { ProviderBudget } from '../../upstream/provider-budget';
import { UpstreamHttpClient } from '../../upstream/upstream-http.client';
import { UpstreamMetrics } from '../../upstream/upstream-metrics';
import type { MarinePoint } from '../entities/marine-point.entity';
import type { MarineEcmwfCycle } from '../entities/marine-ecmwf-cycle.entity';
import type { MarineUpstreamConfig } from '../marine-upstream.config';
import { cycleSteps } from './ecmwf-cycle';
import type { EcmwfParam } from './ecmwf.constants';
import { addStepDone, isCycleComplete } from './ecmwf-series-merge';
import { EcmwfIngestTarget, type GribDecodePort } from './ecmwf-ingest.target';
import type {
  EcmwfIngestStorePort,
  NewestPointSeries,
  RecordStepInput,
} from './ecmwf-ingest.store';
import type { GribDecodeJob } from './grib/grib-decode-protocol';
import { EcmwfDecodeCrashError } from './grib/isolated-grib-decoder';

/**
 * The ingest orchestration under a REAL UpstreamHttpClient (fake fetch), a REAL budget and
 * breaker, an in-memory store and a scripted decoder. Structural throughout: what is asserted
 * is which requests leave, in which order steps land, when the tour stops and HOW LOUDLY —
 * never a weather number. The Postgres implementation of the store port is exercised in e2e;
 * the real fork-decoder has its own spec.
 */

const NOW = Date.parse('2026-07-30T22:00:00.000Z');
// now − 9 h floored to 6 h ⇒ the newest candidate cycle:
const CYCLE_12Z = '2026-07-30T12:00:00.000Z';
const CYCLE_06Z = '2026-07-30T06:00:00.000Z';

/** Tiny synthetic layout: 10u/10v deliberately NON-adjacent (2 ranges), swh/mwd adjacent (1). */
const LAYOUT = {
  oper: [
    { param: '10u', offset: 100, length: 10 },
    { param: '10v', offset: 200, length: 12 },
  ],
  wave: [
    { param: 'swh', offset: 0, length: 8 },
    { param: 'mwd', offset: 8, length: 9 },
  ],
} as const;

/** Bytes of one full step: 2 index bodies + ranges 10 + 12 + (8+9). */
function indexBody(cycleIso: string, stream: 'oper' | 'wave', step: number): string {
  const day = cycleIso.slice(0, 10).replace(/-/g, '');
  const time = `${cycleIso.slice(11, 13)}00`;
  const line = (param: string, offset: number, length: number, date = day): string =>
    JSON.stringify({
      domain: 'g',
      date,
      time,
      expver: '0001',
      class: 'od',
      type: 'fc',
      stream,
      step: String(step),
      levtype: 'sfc',
      param,
      _offset: offset,
      _length: length,
    });

  const records = LAYOUT[stream].map((entry) => line(entry.param, entry.offset, entry.length));
  if (stream === 'oper') {
    // A FOREIGN parameter with a nonsense date, ON PURPOSE (board item NEW-3): the request
    // check is scoped to the records WE select, so this line must never trip it.
    records.splice(1, 0, line('2t', 500, 40, '19990101'));
  }
  return `${records.join('\n')}\n`;
}

interface FetchLog {
  url: string;
  range: string | null;
}

function makeFetch(options: {
  publishedCycles: readonly string[];
  log: FetchLog[];
  failGribOnce?: { remaining: number };
}): typeof fetch {
  return (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    options.log.push({ url, range: headers.Range ?? null });

    const match =
      /\/(\d{8})\/(\d{2})z\/ifs\/0p25\/(oper|wave)\/\d{14}-(\d+)h-\3-fc\.(index|grib2)/.exec(url);
    if (match === null) throw new Error(`fake fetch got an unexpected URL: ${url}`);
    const [, day, hour, stream, step, extension] = match as unknown as [
      string,
      string,
      string,
      'oper' | 'wave',
      string,
      'index' | 'grib2',
    ];
    const cycleIso = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T${hour}:00:00.000Z`;

    if (!options.publishedCycles.includes(cycleIso)) {
      return Promise.resolve(
        new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } }),
      );
    }

    if (extension === 'index') {
      return Promise.resolve(
        new Response(indexBody(cycleIso, stream, Number(step)), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }

    if (options.failGribOnce !== undefined && options.failGribOnce.remaining > 0) {
      options.failGribOnce.remaining -= 1;
      return Promise.reject(new Error('ECONNRESET'));
    }

    const rangeHeader = headers.Range ?? '';
    const rangeMatch = /bytes=(\d+)-(\d+)/.exec(rangeHeader);
    if (rangeMatch === null) throw new Error(`grib2 request without a Range header: ${url}`);
    const length = Number(rangeMatch[2]) - Number(rangeMatch[1]) + 1;
    const buffer = new ArrayBuffer(length);
    return Promise.resolve(
      new Response(buffer, { status: 206, headers: { 'content-type': 'application/grib' } }),
    );
  };
}

/** In-memory store port: the same bookkeeping helpers, no Postgres. */
class FakeStore implements EcmwfIngestStorePort {
  cycles = new Map<string, MarineEcmwfCycle>();
  recorded: RecordStepInput[] = [];
  pruneCalls = 0;

  getCycle(cycleUtc: Date): Promise<MarineEcmwfCycle | null> {
    return Promise.resolve(this.cycles.get(cycleUtc.toISOString()) ?? null);
  }

  newestCycle(): Promise<MarineEcmwfCycle | null> {
    const newest = [...this.cycles.values()].sort(
      (a, b) => b.cycleUtc.getTime() - a.cycleUtc.getTime(),
    )[0];
    return Promise.resolve(newest ?? null);
  }

  newestSeriesForPoint(): Promise<NewestPointSeries | null> {
    return Promise.resolve(null);
  }

  recordStep(input: RecordStepInput): Promise<void> {
    this.recorded.push(input);
    const key = input.cycleUtc.toISOString();
    const existing = this.cycles.get(key);
    const stepsDone = addStepDone(existing?.stepsDone ?? [], input.stepHour);
    this.cycles.set(key, {
      cycleUtc: input.cycleUtc,
      stepsDone,
      stepHours: input.stepHours,
      forecastHours: input.forecastHours,
      bytesDownloaded: (existing?.bytesDownloaded ?? 0) + input.bytesDownloaded,
      startedAt: existing?.startedAt ?? input.now,
      completedAt: isCycleComplete(stepsDone, cycleSteps(input.forecastHours)) ? input.now : null,
      packingType: input.packingType,
      decoderVersion: input.decoderVersion,
    });
    return Promise.resolve();
  }

  pruneCycles(): Promise<number> {
    this.pruneCalls += 1;
    return Promise.resolve(0);
  }
}

const CELL_VALUES: Record<string, number> = { '10u': 1.5, '10v': -0.5, swh: 0.7, mwd: 200 };

function makeDecoder(): GribDecodePort & { jobs: GribDecodeJob[] } {
  const jobs: GribDecodeJob[] = [];
  return {
    jobs,
    decode(job: GribDecodeJob) {
      jobs.push(job);
      return Promise.resolve({
        fields: job.members.map((member) => ({
          param: member.param as EcmwfParam,
          cells: job.indices.map(() => CELL_VALUES[member.param] ?? 0),
          referenceTimeUtcMs: job.referenceTimeUtcMs,
          validTimeUtcMs: job.referenceTimeUtcMs + job.forecastHours * 3_600_000,
          dataRepresentationTemplate: 42,
        })),
        decoderVersion: 'scripted-1.0',
      });
    },
  };
}

function makeConfig(overrides: Partial<MarineUpstreamConfig['ecmwf']> = {}): MarineUpstreamConfig {
  return {
    budgets: {
      ecmwf: { perMinute: 500, perHour: 5_000, perDay: 50_000 },
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
      // A tiny horizon keeps the fixtures readable: steps 0, 3, 6.
      forecastHours: 6,
      singleCallTimeoutMs: 3_000,
      tourBudgetMs: 60_000,
      maxStepsPerTour: 2,
      tourMaxBytes: 10_000_000,
      cycleMaxBytes: 20_000_000,
      cycleMaxAgeSeconds: 86_400,
      staleMaxSeconds: 43_200,
      ...overrides,
    },
  };
}

/** Two offshore points; the coordinates are real Turkish-coast cells so the mapping passes. */
const POINTS = [
  { id: 'p1', slugTr: 'nokta-bir', latitude: 41.3, longitude: 29.61 },
  { id: 'p2', slugTr: 'nokta-iki', latitude: 36.6, longitude: 30.7 },
] as unknown as MarinePoint[];

interface RecordedEvent {
  level: string;
  message: string;
}

describe('EcmwfIngestTarget', () => {
  let metrics: UpstreamMetrics;
  let events: RecordedEvent[];
  let log: FetchLog[];
  let store: FakeStore;
  let decoder: ReturnType<typeof makeDecoder>;

  beforeEach(() => {
    metrics = new UpstreamMetrics();
    events = [];
    jest.spyOn(metrics, 'event').mockImplementation((level, message) => {
      events.push({ level, message });
    });
    log = [];
    store = new FakeStore();
    decoder = makeDecoder();
  });

  function buildTarget(options: {
    publishedCycles: readonly string[];
    config?: MarineUpstreamConfig;
    failGribOnce?: { remaining: number };
    decoderOverride?: GribDecodePort;
    points?: MarinePoint[];
  }): EcmwfIngestTarget {
    const config = options.config ?? makeConfig();
    const budget = new ProviderBudget(metrics, null, () => NOW);
    const breaker = new CircuitBreaker(metrics, { now: () => NOW });
    const client = new UpstreamHttpClient(metrics, budget, breaker, {
      singleCallTimeoutMs: config.ecmwf.singleCallTimeoutMs,
      userAgent: 'TestBot/1.0',
      fetchImpl: makeFetch({
        publishedCycles: options.publishedCycles,
        log,
        failGribOnce: options.failGribOnce,
      }),
      sleepImpl: () => Promise.resolve(),
      now: () => NOW,
    });
    return new EcmwfIngestTarget({
      client,
      store,
      decoder: options.decoderOverride ?? decoder,
      config,
      loadPoints: () => Promise.resolve(options.points ?? POINTS),
      metrics,
      now: () => NOW,
    });
  }

  it('ingests the newest published cycle: nearest-to-now step FIRST, atomic per-step records', async () => {
    const target = buildTarget({ publishedCycles: [CYCLE_12Z] });
    await target.refresh(new OperationDeadline(300_000, () => NOW));

    // maxStepsPerTour = 2 of the 3-step horizon. now − cycle = 10 h ⇒ nearest step is +6 h,
    // then the ascending fill starts at 0. The partial cycle is useful by construction.
    expect(store.recorded.map((record) => record.stepHour)).toEqual([6, 0]);
    const cycle = store.cycles.get(CYCLE_12Z);
    expect(cycle?.stepsDone).toEqual([0, 6]);
    expect(cycle?.completedAt).toBeNull();
    expect(cycle?.decoderVersion).toBe('scripted-1.0');

    // 5 requests per step (2 index + 3 ranges: the wind pair never merges, the wave pair does).
    expect(log.length).toBe(10);
    expect(log.filter((entry) => entry.range !== null).length).toBe(6);

    // Bytes: 3 ranges (10 + 12 + 17) plus the two index bodies — accounted per step.
    const first = store.recorded[0];
    expect(first).toBeDefined();
    expect(first?.bytesDownloaded).toBeGreaterThan(39);

    // Every point row carries every parameter of the step.
    expect(first?.points.map((point) => point.sample)).toEqual([
      { u10: 1.5, v10: -0.5, swh: 0.7, mwd: 200 },
      { u10: 1.5, v10: -0.5, swh: 0.7, mwd: 200 },
    ]);

    expect(store.pruneCalls).toBe(1);
    // The foreign `2t` line with its 1999 date never tripped the request check (NEW-3), and
    // nothing in the happy path logged at error level.
    expect(events.filter((event) => event.level === 'error')).toEqual([]);
  });

  it('resumes a half-ingested cycle instead of re-downloading it (idempotent progress)', async () => {
    store.cycles.set(CYCLE_12Z, {
      cycleUtc: new Date(CYCLE_12Z),
      stepsDone: [0, 6],
      stepHours: 3,
      forecastHours: 6,
      bytesDownloaded: 100,
      startedAt: new Date(NOW - 3_600_000),
      completedAt: null,
      packingType: 'grib2 template 5.42',
      decoderVersion: 'scripted-1.0',
    });

    const target = buildTarget({ publishedCycles: [CYCLE_12Z] });
    await target.refresh(new OperationDeadline(300_000, () => NOW));

    expect(store.recorded.map((record) => record.stepHour)).toEqual([3]);
    const cycle = store.cycles.get(CYCLE_12Z);
    expect(cycle?.stepsDone).toEqual([0, 3, 6]);
    expect(cycle?.completedAt).not.toBeNull();
  });

  it('does nothing when the newest candidate is already complete', async () => {
    store.cycles.set(CYCLE_12Z, {
      cycleUtc: new Date(CYCLE_12Z),
      stepsDone: [0, 3, 6],
      stepHours: 3,
      forecastHours: 6,
      bytesDownloaded: 100,
      startedAt: new Date(NOW - 3_600_000),
      completedAt: new Date(NOW - 1_800_000),
      packingType: 'grib2 template 5.42',
      decoderVersion: 'scripted-1.0',
    });

    const target = buildTarget({ publishedCycles: [CYCLE_12Z] });
    await target.refresh(new OperationDeadline(300_000, () => NOW));

    expect(log.length).toBe(0);
    expect(store.recorded).toEqual([]);
  });

  it('falls back QUIETLY when the newest cycle is not published yet — 404 is an expected state (NEW-1)', async () => {
    const target = buildTarget({ publishedCycles: [CYCLE_06Z] });
    await target.refresh(new OperationDeadline(300_000, () => NOW));

    // The 12z probe answered 404 → no_data → quiet; the 06z cycle was ingested instead.
    expect(store.recorded.length).toBeGreaterThan(0);
    expect(store.recorded[0]?.cycleUtc.toISOString()).toBe(CYCLE_06Z);
    expect(events.filter((event) => event.level === 'error')).toEqual([]);
  });

  it('gives up quietly when NO candidate is published — four probes, no error-level noise', async () => {
    const target = buildTarget({ publishedCycles: [] });
    await target.refresh(new OperationDeadline(300_000, () => NOW));

    expect(store.recorded).toEqual([]);
    // One first-step oper-index probe per candidate, nothing more.
    expect(log.length).toBe(4);
    expect(events.filter((event) => event.level === 'error')).toEqual([]);
  });

  it('stops LOUDLY when the tour byte cap is breached (board acceptance: cost protection)', async () => {
    const target = buildTarget({
      publishedCycles: [CYCLE_12Z],
      config: makeConfig({ tourMaxBytes: 1, maxStepsPerTour: 3 }),
    });
    await target.refresh(new OperationDeadline(300_000, () => NOW));

    // The first step ran (the cap is checked before each step), the second was refused loudly.
    expect(store.recorded.length).toBe(1);
    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'error',
        message: expect.stringContaining('tour byte cap'),
      }),
    );
  });

  it('stops LOUDLY when the CYCLE byte cap is breached, counting bytes already in the ledger', async () => {
    store.cycles.set(CYCLE_12Z, {
      cycleUtc: new Date(CYCLE_12Z),
      stepsDone: [6],
      stepHours: 3,
      forecastHours: 6,
      bytesDownloaded: 19_999_999, // just under the 20 MB cap — the next step tips it over
      startedAt: new Date(NOW - 3_600_000),
      completedAt: null,
      packingType: 'grib2 template 5.42',
      decoderVersion: 'scripted-1.0',
    });

    const target = buildTarget({
      publishedCycles: [CYCLE_12Z],
      config: makeConfig({ maxStepsPerTour: 3 }),
    });
    await target.refresh(new OperationDeadline(300_000, () => NOW));

    expect(store.recorded.length).toBe(1); // 19 999 999 + first step crosses 20 MB
    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'error',
        message: expect.stringContaining('cycle byte cap'),
      }),
    );
  });

  it('abandons the step and keeps prior progress when a download fails transiently', async () => {
    // Both the first attempt AND the client's single retry fail → transient outcome.
    const target = buildTarget({
      publishedCycles: [CYCLE_12Z],
      failGribOnce: { remaining: 2 },
    });
    await target.refresh(new OperationDeadline(300_000, () => NOW));

    // The first step died on its first range; nothing half-written was recorded.
    expect(store.recorded).toEqual([]);
    expect(store.cycles.has(CYCLE_12Z)).toBe(false);
  });

  it('contains a decoder crash: loud metric + error event, no record, server-side flow continues', async () => {
    const crashing: GribDecodePort = {
      decode: () =>
        Promise.reject(
          new EcmwfDecodeCrashError('decode child died without a reply', 134, null, false),
        ),
    };
    const target = buildTarget({ publishedCycles: [CYCLE_12Z], decoderOverride: crashing });

    // Must NOT throw — the warmup contract.
    await expect(
      target.refresh(new OperationDeadline(300_000, () => NOW)),
    ).resolves.toBeUndefined();

    expect(store.recorded).toEqual([]);
    expect(metrics.get('ingest.decode_crash', 'ecmwf')).toBe(1);
    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'error',
        message: expect.stringContaining('decode child crashed'),
      }),
    );
  });

  it('refuses to ingest anything when marine_points is empty — zero requests leave the process', async () => {
    const target = buildTarget({ publishedCycles: [CYCLE_12Z], points: [] });
    await target.refresh(new OperationDeadline(300_000, () => NOW));

    expect(log.length).toBe(0);
    expect(store.recorded).toEqual([]);
  });

  it('hands the decoder the request attribution and the exact range members, per range', async () => {
    const target = buildTarget({ publishedCycles: [CYCLE_12Z] });
    await target.refresh(new OperationDeadline(300_000, () => NOW));

    // 3 ranges per step × 2 steps.
    expect(decoder.jobs.length).toBe(6);
    const waveJob = decoder.jobs.find((job) => job.members.length === 2);
    expect(waveJob).toBeDefined();
    expect(waveJob?.members.map((member) => member.param)).toEqual(['swh', 'mwd']);
    expect(waveJob?.referenceTimeUtcMs).toBe(Date.parse(CYCLE_12Z));
    // The wave pair travels as ONE merged range: relative offsets restart at 0.
    expect(waveJob?.members[0]?.relativeOffset).toBe(0);
    expect(waveJob?.members[1]?.relativeOffset).toBe(8);
  });
});
