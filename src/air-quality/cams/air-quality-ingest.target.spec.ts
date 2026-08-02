import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import { CircuitBreaker } from '../../upstream/circuit-breaker';
import { OperationDeadline } from '../../upstream/operation-deadline';
import { ProviderBudget } from '../../upstream/provider-budget';
import { UpstreamHttpClient } from '../../upstream/upstream-http.client';
import { UpstreamMetrics } from '../../upstream/upstream-metrics';
import { AirQualityPollutant } from '../air-quality.types';
import { CAMS_ADS_PROVIDER, type AirQualityUpstreamConfig } from '../air-quality-upstream.config';
import type { Province } from '../../province/entities/province.entity';
import type { AdsJobRecord, AirQualityRun } from '../entities/air-quality-run.entity';
import { buildNetcdf3, buildZipArchive } from './netcdf3-fixture.builder';
import type { FixtureFileSpec } from './netcdf3-fixture.builder';
import type {
  AirQualityIngestStorePort,
  CreateRunInput,
  RecordProductInput,
  UpdateRunInput,
} from './air-quality-ingest.store';
import { AirQualityIngestTarget, rollupRunState, selectNextJob } from './air-quality-ingest.target';

/**
 * The two-job ADS state machine, against a FAKE store and a FAKE provider (no Postgres, no
 * network). What is pinned here is the behaviour that cannot be observed from a green endpoint:
 * that a submit is never repeated, that the forecast always outranks the analysis, that a
 * refusal is terminal, and that the analysis can fail without taking the publication with it.
 */

const NOW_MS = Date.parse('2026-08-02T12:30:00.000Z');

const CONFIG: AirQualityUpstreamConfig = {
  enabled: true,
  ingestEnabled: true,
  analysisEnabled: true,
  ingestIntervalSeconds: 600,
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
  runMaxAgeSeconds: 172_800,
  ads: {
    baseUrl: 'https://ads.test/api',
    datasetId: 'cams-europe-air-quality-forecasts',
    objectStoreHosts: ['object-store.test'],
    apiKey: 'a-secret-key',
    area: [42.5, 25.5, 35.5, 45.0],
    // A 2-step horizon keeps the fixtures small; nothing in the machine reads 97 as a literal.
    forecastHours: 1,
    submitAfterUtcHour: 12,
    maxAttemptsPerJob: 3,
    pollTimeoutMs: 10_000,
    downloadTimeoutMs: 180_000,
    tourBudgetMs: 200_000,
    runMaxBytes: 67_108_864,
  },
};

/**
 * The province reference set is 81 rows BY CONTRACT (the ingest refuses anything else), so the
 * fake set is 81 too — spread inside the mini grid below rather than at real coordinates,
 * because nothing here tests geography.
 */
const PROVINCES = Array.from({ length: 81 }, (_unused, index) => ({
  id: `p-${String(index).padStart(2, '0')}`,
  plateCode: String(index + 1).padStart(2, '0'),
  latitude: 36.5 + (index % 9) * 0.5,
  longitude: 26.5 + Math.floor(index / 9) * 0.5,
})) as unknown as Province[];

/**
 * A mini grid around the fake provinces, with the given product word.
 *
 * `lonOffset` shifts the whole longitude axis: that is how the analysis-grid-identity guard
 * (risk R11) is exercised — the file still decodes perfectly, it simply resolves every province
 * onto a different cell, which is the failure that would otherwise be invisible.
 */
function archiveFor(
  product: 'FORECAST' | 'ANALYSIS',
  day: string,
  records: number,
  lonOffset = 0,
): Uint8Array {
  const lon = Array.from({ length: 60 }, (_u, index) =>
    Math.fround(25.55 + lonOffset + index * 0.1),
  );
  const lat = Array.from({ length: 70 }, (_u, index) => Math.fround(42.45 - index * 0.1));
  const cells = lon.length * lat.length;
  const spec: FixtureFileSpec = {
    recordCount: records,
    dimensions: [
      { name: 'longitude', length: lon.length },
      { name: 'latitude', length: lat.length },
      { name: 'level', length: 1 },
      { name: 'time', length: 'record' },
    ],
    variables: [
      { name: 'longitude', dimensions: ['longitude'], data: lon },
      { name: 'latitude', dimensions: ['latitude'], data: lat },
      { name: 'level', dimensions: ['level'], data: [0] },
      {
        name: 'time',
        dimensions: ['time'],
        attributes: [
          { name: 'units', value: 'hours' },
          { name: 'long_name', value: `${product} time from ${day}` },
        ],
        data: Array.from({ length: records }, (_u, index) => index),
      },
      ...['pm2p5_conc', 'pm10_conc', 'no2_conc', 'o3_conc', 'so2_conc'].map((name) => ({
        name,
        dimensions: ['time', 'level', 'latitude', 'longitude'],
        attributes: [
          { name: 'units', value: 'µg/m3' },
          { name: '_FillValue', value: [-999] },
        ],
        data: Array.from({ length: records * cells }, (_u, index) => 5 + (index % 300) * 0.1),
      })),
    ],
  };
  return buildZipArchive([{ name: `ENS_${product}.nc`, bytes: buildNetcdf3(spec) }]);
}

/** An in-memory store that behaves like the Postgres one for the state the machine reads. */
class FakeStore implements AirQualityIngestStorePort {
  run: AirQualityRun | null = null;
  products: RecordProductInput[] = [];
  pruned = 0;
  cells = new Map<string, { latitude: number; longitude: number }>();

  newestRun(): Promise<AirQualityRun | null> {
    return Promise.resolve(this.run);
  }
  getRun(): Promise<AirQualityRun | null> {
    return Promise.resolve(this.run);
  }
  createRun(input: CreateRunInput): Promise<void> {
    this.run = {
      runUtc: input.runUtc,
      state: 'pending',
      forecastHours: input.forecastHours,
      analysisHours: 0,
      adsRequests: [...input.adsRequests],
      datasetId: input.datasetId,
      lastError: null,
      lastErrorClass: null,
      bytesDownloaded: 0,
      fileFormat: null,
      decoderVersion: null,
      startedAt: input.now,
      completedAt: null,
    };
    return Promise.resolve();
  }
  updateRun(input: UpdateRunInput): Promise<void> {
    if (this.run !== null) {
      this.run.adsRequests = [...input.adsRequests];
      this.run.state = input.state;
      if (input.lastError !== undefined) this.run.lastError = input.lastError;
      if (input.lastErrorClass !== undefined) this.run.lastErrorClass = input.lastErrorClass;
    }
    return Promise.resolve();
  }
  recordProduct(input: RecordProductInput): Promise<void> {
    this.products.push(input);
    if (this.run !== null) {
      this.run.adsRequests = [...input.adsRequests];
      this.run.state = input.state;
      this.run.bytesDownloaded = input.bytesDownloaded;
      if (input.kind === 'forecast') {
        this.run.completedAt = input.now;
        for (const province of input.provinces) {
          this.cells.set(province.provinceId, {
            latitude: province.gridLatitude,
            longitude: province.gridLongitude,
          });
        }
      } else {
        this.run.analysisHours = input.hours;
      }
    }
    return Promise.resolve();
  }
  gridCellsFor(): Promise<Map<string, { latitude: number; longitude: number }>> {
    return Promise.resolve(this.cells);
  }
  pruneRuns(): Promise<number> {
    this.pruned += 1;
    return Promise.resolve(0);
  }
}

interface FakeAdsOptions {
  /** Fail the submit POST with a transport error (the double-submit scenario). */
  failSubmit?: boolean;
  /** What `GET /jobs` returns when the machine reconciles. */
  jobsList?: { processID: string; jobID: string; status: string; created: string }[];
  costing?: { cost: number; limit: number };
  /** Serve the analysis archive from a SHIFTED grid (the R11 scenario). */
  shiftAnalysisGrid?: boolean;
  /** Declared `file:size` override — the pre-download ceiling scenario. */
  declaredSize?: number;
  /** Echo the API key inside a 400 error body (the redaction scenario). */
  echoKeyOnCosting?: boolean;
}

function fakeAds(options: FakeAdsOptions = {}): {
  fetchImpl: typeof fetch;
  calls: { method: string; url: string; headers: Record<string, string> }[];
} {
  const forecast = archiveFor('FORECAST', '20260802', 2);
  const analysis = archiveFor(
    'ANALYSIS',
    '20260801',
    24,
    options.shiftAnalysisGrid === true ? 0.05 : 0,
  );
  const archives: Record<string, Uint8Array> = { 'job-f': forecast, 'job-a': analysis };
  const calls: { method: string; url: string; headers: Record<string, string> }[] = [];
  let submits = 0;

  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  const fetchImpl = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    calls.push({ method, url, headers: (init?.headers ?? {}) as Record<string, string> });

    if (url.endsWith('/costing')) {
      if (options.echoKeyOnCosting === true) {
        return Promise.resolve(
          json(400, { detail: `token ${CONFIG.ads.apiKey ?? ''} was rejected` }),
        );
      }
      return Promise.resolve(json(200, options.costing ?? { cost: 485, limit: 5000 }));
    }
    if (url.endsWith('/execution')) {
      if (options.failSubmit === true) return Promise.reject(new Error('socket hang up'));
      submits += 1;
      return Promise.resolve(
        json(201, {
          jobID: submits === 1 ? 'job-f' : 'job-a',
          status: 'accepted',
          created: '2026-08-02T12:30:00Z',
        }),
      );
    }
    if (/\/jobs$/.test(url)) {
      return Promise.resolve(json(200, { jobs: options.jobsList ?? [], metadata: {} }));
    }
    const results = /\/jobs\/(job-[fa])\/results$/.exec(url);
    if (results !== null) {
      const archive = archives[results[1] ?? ''] ?? forecast;
      return Promise.resolve(
        json(200, {
          asset: {
            value: {
              href: `https://object-store.test/cache/${results[1] ?? ''}.zip`,
              'file:size': options.declaredSize ?? archive.byteLength,
              'file:checksum': createHash('md5').update(archive).digest('hex'),
              'file:local_path': `s3://cache/${results[1] ?? ''}.zip`,
            },
          },
        }),
      );
    }
    const download = /object-store\.test\/cache\/(job-[fa])\.zip$/.exec(url);
    if (download !== null) {
      const archive = archives[download[1] ?? ''] ?? forecast;
      return Promise.resolve(
        new Response(Buffer.from(archive), {
          status: 200,
          headers: { 'content-type': 'application/zip' },
        }),
      );
    }
    const job = /\/jobs\/(job-[fa])$/.exec(url);
    if (job !== null) {
      if (method === 'DELETE') {
        return Promise.resolve(json(200, { jobID: job[1], status: 'dismissed' }));
      }
      return Promise.resolve(
        json(200, {
          jobID: job[1],
          status: 'successful',
          created: '2026-08-02T12:30:00Z',
          started: '2026-08-02T12:30:20Z',
          finished: '2026-08-02T12:31:00Z',
        }),
      );
    }
    return Promise.resolve(json(404, { detail: 'unrouted' }));
  }) as typeof fetch;

  return { fetchImpl, calls };
}

describe('selectNextJob — the binding priority', () => {
  const job = (over: Partial<AdsJobRecord>): AdsJobRecord => ({
    kind: 'forecast',
    requestDate: '2026-08-02',
    requestBody: {},
    state: 'pending',
    jobId: null,
    attempts: 0,
    submittedAt: null,
    adsCreated: null,
    adsStarted: null,
    adsFinished: null,
    cleanupAt: null,
    result: null,
    lastError: null,
    ...over,
  });

  it('the FORECAST always outranks the analysis — the page’s "now" is never delayed', () => {
    const run = { adsRequests: [job({ kind: 'forecast' }), job({ kind: 'analysis' })] };
    expect(selectNextJob(run, 3)).toEqual({ index: 0, action: 'progress' });
  });

  it('the analysis advances only once the forecast has nothing left to do', () => {
    const run = {
      adsRequests: [
        job({ kind: 'forecast', state: 'stored', jobId: 'f', cleanupAt: 'x' }),
        job({ kind: 'analysis', state: 'pending' }),
      ],
    };
    expect(selectNextJob(run, 3)).toEqual({ index: 1, action: 'progress' });
  });

  it('cleanup debt comes LAST — politeness must never delay data', () => {
    const run = {
      adsRequests: [
        job({ kind: 'forecast', state: 'stored', jobId: 'f', cleanupAt: null }),
        job({ kind: 'analysis', state: 'pending' }),
      ],
    };
    expect(selectNextJob(run, 3)).toEqual({ index: 1, action: 'progress' });

    const done = {
      adsRequests: [
        job({ kind: 'forecast', state: 'stored', jobId: 'f', cleanupAt: null }),
        job({ kind: 'analysis', state: 'stored', jobId: 'a', cleanupAt: 'x' }),
      ],
    };
    expect(selectNextJob(done, 3)).toEqual({ index: 0, action: 'cleanup' });
  });

  it('a job that spent its attempt budget is NOT advanced again', () => {
    const run = { adsRequests: [job({ kind: 'forecast', state: 'costed', attempts: 3 })] };
    expect(selectNextJob(run, 3)).toBeNull();
  });

  it("a failing ANALYSIS never consumes the forecast's budget (SAPMA 6)", () => {
    const run = {
      adsRequests: [
        job({ kind: 'forecast', state: 'pending', attempts: 0 }),
        job({ kind: 'analysis', state: 'costed', attempts: 3 }),
      ],
    };
    expect(selectNextJob(run, 3)).toEqual({ index: 0, action: 'progress' });
  });
});

describe('rollupRunState — servable, degraded and abandoned are different answers', () => {
  const job = (kind: 'forecast' | 'analysis', state: string, attempts = 0): AdsJobRecord =>
    ({ kind, state, attempts }) as unknown as AdsJobRecord;

  it('the forecast alone makes a run SERVABLE; both products make it complete', () => {
    expect(rollupRunState([job('forecast', 'stored'), job('analysis', 'running')], 3)).toBe(
      'serviceable',
    );
    expect(rollupRunState([job('forecast', 'stored'), job('analysis', 'stored')], 3)).toBe(
      'complete',
    );
    // Analysis disabled: one job is the whole promise, so the run is complete, not degraded.
    expect(rollupRunState([job('forecast', 'stored')], 3)).toBe('complete');
  });

  it('a terminally failed ANALYSIS degrades the run but keeps it publishing', () => {
    for (const state of ['refused', 'rejected', 'failed']) {
      expect(rollupRunState([job('forecast', 'stored'), job('analysis', state)], 3)).toBe(
        'degraded',
      );
    }
    // Exhausted attempts count as terminal even if the state still reads as in-flight.
    expect(rollupRunState([job('forecast', 'stored'), job('analysis', 'costed', 3)], 3)).toBe(
      'degraded',
    );
  });

  it('a terminally failed FORECAST abandons the run — the previous run keeps serving', () => {
    expect(rollupRunState([job('forecast', 'rejected'), job('analysis', 'stored')], 3)).toBe(
      'abandoned',
    );
    expect(rollupRunState([], 3)).toBe('abandoned');
  });
});

describe('AirQualityIngestTarget — one step per tour', () => {
  let metrics: UpstreamMetrics;
  let events: { level: string; message: string; context: Record<string, unknown> }[];
  let store: FakeStore;

  function build(options: FakeAdsOptions = {}, config: AirQualityUpstreamConfig = CONFIG) {
    const { fetchImpl, calls } = fakeAds(options);
    const budget = new ProviderBudget(metrics, null, () => NOW_MS);
    const breaker = new CircuitBreaker(metrics, {
      failureThreshold: 5,
      openMs: 1_000,
      now: () => NOW_MS,
    });
    const client = new UpstreamHttpClient(metrics, budget, breaker, {
      singleCallTimeoutMs: 30_000,
      userAgent: 'TestBot/1.0',
      fetchImpl,
      sleepImpl: () => Promise.resolve(),
      now: () => NOW_MS,
    });
    const target = new AirQualityIngestTarget({
      client,
      store,
      config,
      loadProvinces: () => Promise.resolve(PROVINCES),
      metrics,
      md5: (bytes: Uint8Array) => createHash('md5').update(bytes).digest('hex'),
      now: () => NOW_MS,
    });
    return { target, calls };
  }

  const tour = async (target: AirQualityIngestTarget): Promise<void> => {
    await target.refresh(new OperationDeadline(300_000, () => NOW_MS));
  };

  /** Run tours until the predicate holds or the budget of tours runs out. */
  const tourUntil = async (
    target: AirQualityIngestTarget,
    done: () => boolean,
    max = 30,
  ): Promise<number> => {
    let count = 0;
    while (!done() && count < max) {
      await tour(target);
      count += 1;
    }
    return count;
  };

  beforeEach(() => {
    metrics = new UpstreamMetrics();
    events = [];
    jest.spyOn(metrics, 'event').mockImplementation((level, message, context) => {
      events.push({ level, message, context: { ...context } });
    });
    store = new FakeStore();
  });

  it('creates the day’s TWO jobs and advances exactly one step per tour', async () => {
    const { target, calls } = build();

    await tour(target);
    expect(store.run?.adsRequests.map((job) => job.kind)).toEqual(['forecast', 'analysis']);
    expect(store.run?.adsRequests[1]?.requestDate).toBe('2026-08-01'); // D−1, always
    // The first tour created the run AND took one step (costing) — never two ADS calls.
    expect(calls.filter((call) => call.url.includes('ads.test'))).toHaveLength(1);
    expect(store.run?.adsRequests[0]?.state).toBe('costed');

    await tour(target);
    expect(calls.filter((call) => call.url.includes('ads.test'))).toHaveLength(2);
  });

  it('reaches a SERVABLE run from the forecast alone, then completes with the analysis', async () => {
    const { target } = build();

    await tourUntil(
      target,
      () => store.run?.state === 'serviceable' || store.run?.state === 'complete',
    );
    const forecastProduct = store.products.find((product) => product.kind === 'forecast');
    expect(forecastProduct?.provinces).toHaveLength(81);
    expect(forecastProduct?.provinces[0]?.concentrations[AirQualityPollutant.Pm2_5]).toHaveLength(
      2,
    );
    expect(store.pruned).toBe(1); // retention runs in the tour that wrote the forecast

    await tourUntil(target, () => store.run?.state === 'complete');
    expect(store.run?.state).toBe('complete');
    expect(store.run?.analysisHours).toBe(24);
    // The analysis write NEVER rewrites the forecast arrays — separate columns, separate write.
    expect(store.products.filter((product) => product.kind === 'analysis')).toHaveLength(1);
  });

  it('NEVER re-submits after a failed submit — it reconciles against GET /jobs', async () => {
    const { target, calls } = build({
      failSubmit: true,
      jobsList: [
        {
          processID: CONFIG.ads.datasetId,
          jobID: 'job-f',
          status: 'running',
          created: '2026-08-02T12:30:05Z',
        },
      ],
    });

    await tour(target); // costing
    await tour(target); // submit → transport failure, state stays `submitting`
    expect(store.run?.adsRequests[0]?.state).toBe('submitting');
    const submitsAfterFailure = calls.filter((call) => call.url.endsWith('/execution')).length;

    await tour(target); // reconcile
    // The one assertion that matters: no second POST, ever.
    expect(calls.filter((call) => call.url.endsWith('/execution'))).toHaveLength(
      submitsAfterFailure,
    );
    expect(store.run?.adsRequests[0]?.jobId).toBe('job-f');
    expect(store.run?.adsRequests[0]?.state).toBe('submitted');
  });

  it('reconciliation with NO candidate returns to costed for ONE clean submit', async () => {
    const { target } = build({ failSubmit: true, jobsList: [] });
    await tour(target);
    await tour(target);
    await tour(target);
    expect(store.run?.adsRequests[0]?.state).toBe('costed');
    expect(store.run?.adsRequests[0]?.attempts).toBe(2);
  });

  it('reconciliation with MORE THAN ONE candidate stops LOUDLY instead of guessing', async () => {
    const { target, calls } = build({
      failSubmit: true,
      jobsList: [
        {
          processID: CONFIG.ads.datasetId,
          jobID: 'x',
          status: 'running',
          created: '2026-08-02T12:30:05Z',
        },
        {
          processID: CONFIG.ads.datasetId,
          jobID: 'y',
          status: 'running',
          created: '2026-08-02T12:30:06Z',
        },
      ],
    });
    await tour(target);
    await tour(target);
    await tour(target);

    expect(store.run?.adsRequests[0]?.state).toBe('submitting');
    expect(store.run?.adsRequests[0]?.jobId).toBeNull();
    expect(calls.filter((call) => call.url.endsWith('/execution'))).toHaveLength(1);
    expect(metrics.get('airq.reconcile_ambiguous', CAMS_ADS_PROVIDER)).toBe(1);
    expect(events).toContainEqual(
      expect.objectContaining({ level: 'error', message: expect.stringContaining('AMBIGUOUS') }),
    );
  });

  it('a cost ABOVE the limit is terminal and submits NOTHING (the endpoint answers 200)', async () => {
    const { target, calls } = build({ costing: { cost: 23280, limit: 5000 } });
    await tour(target);

    expect(store.run?.adsRequests[0]?.state).toBe('refused');
    expect(calls.filter((call) => call.url.endsWith('/execution'))).toHaveLength(0);
    expect(metrics.get('airq.cost_refused', CAMS_ADS_PROVIDER)).toBe(1);
    // The forecast is terminal, so the whole run is abandoned — the previous run keeps serving.
    expect(store.run?.state).toBe('abandoned');
  });

  it('a declared file:size over the ceiling stops BEFORE the download leaves', async () => {
    const { target, calls } = build({ declaredSize: 1_000_000_000 });
    await tourUntil(target, () => store.run?.adsRequests[0]?.state === 'refused');

    expect(calls.filter((call) => call.url.includes('object-store'))).toHaveLength(0);
    expect(metrics.get('airq.size_refused', CAMS_ADS_PROVIDER)).toBe(1);
    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'error',
        message: expect.stringContaining('not downloading'),
      }),
    );
  });

  it('the download carries NO PRIVATE-TOKEN, and every ADS API call does', async () => {
    const { target, calls } = build();
    await tourUntil(target, () => store.run?.state === 'complete');

    const downloads = calls.filter((call) => call.url.includes('object-store'));
    expect(downloads.length).toBeGreaterThan(0);
    for (const download of downloads) {
      expect(Object.keys(download.headers)).not.toContain('PRIVATE-TOKEN');
      expect(JSON.stringify(download.headers)).not.toContain(CONFIG.ads.apiKey ?? '');
    }
    const api = calls.filter((call) => call.url.includes('ads.test'));
    for (const call of api) {
      expect(call.headers['PRIVATE-TOKEN']).toBe(CONFIG.ads.apiKey);
    }
  });

  it('NEGATIVE: a provider error body echoing the key is redacted before it is logged', async () => {
    const { target } = build({ echoKeyOnCosting: true });
    await tour(target);

    const serialised = JSON.stringify(events);
    expect(serialised).not.toContain(CONFIG.ads.apiKey ?? '');
    expect(serialised).toContain('[REDACTED]');
    expect(store.run?.lastError ?? '').not.toContain(CONFIG.ads.apiKey ?? '');
  });

  it('a run with the analysis DISABLED creates exactly one job and completes on it', async () => {
    const { target } = build({}, { ...CONFIG, analysisEnabled: false });
    await tour(target);
    expect(store.run?.adsRequests).toHaveLength(1);

    await tourUntil(target, () => store.run?.state === 'complete');
    expect(store.run?.state).toBe('complete');
    expect(store.run?.analysisHours).toBe(0);
  });

  it('an ingest with the kill switch OFF does nothing at all', async () => {
    const { target, calls } = build({}, { ...CONFIG, ingestEnabled: false });
    await tour(target);
    expect(calls).toHaveLength(0);
    expect(store.run).toBeNull();
  });

  it('R11: an analysis on a DIFFERENT grid is refused, and the forecast keeps publishing', async () => {
    // The file decodes perfectly; it simply resolves every province onto another cell. Merged
    // into one series that errors nowhere and quietly says the past came from somewhere else.
    const { target } = build({ shiftAnalysisGrid: true });

    await tourUntil(
      target,
      () => store.run?.state === 'degraded' || store.run?.state === 'complete',
    );
    expect(store.run?.state).toBe('degraded');
    expect(metrics.get('airq.analysis_grid_mismatch', CAMS_ADS_PROVIDER)).toBe(1);
    // The forecast product is stored and untouched; only the analysis half was refused.
    expect(store.products.filter((product) => product.kind === 'forecast')).toHaveLength(1);
    expect(store.products.filter((product) => product.kind === 'analysis')).toHaveLength(0);
    expect(store.run?.analysisHours).toBe(0);
    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'error',
        message: expect.stringContaining('REFUSING the analysis'),
      }),
    );
  });

  it('a province set that is not the expected 81 rows refuses to ingest a partial set', async () => {
    const { fetchImpl } = fakeAds();
    const budget = new ProviderBudget(metrics, null, () => NOW_MS);
    const breaker = new CircuitBreaker(metrics, {
      failureThreshold: 5,
      openMs: 1_000,
      now: () => NOW_MS,
    });
    const target = new AirQualityIngestTarget({
      client: new UpstreamHttpClient(metrics, budget, breaker, {
        singleCallTimeoutMs: 30_000,
        userAgent: 'TestBot/1.0',
        fetchImpl,
        sleepImpl: () => Promise.resolve(),
        now: () => NOW_MS,
      }),
      store,
      // The REAL count, so the guard is exercised against a set that is one province short.
      config: CONFIG,
      loadProvinces: () => Promise.resolve(PROVINCES.slice(0, 80)),
      metrics,
      md5: (bytes: Uint8Array) => createHash('md5').update(bytes).digest('hex'),
      now: () => NOW_MS,
    });

    await tourUntil(target, () => metrics.get('airq.province_set_invalid', CAMS_ADS_PROVIDER) > 0);
    expect(metrics.get('airq.province_set_invalid', CAMS_ADS_PROVIDER)).toBeGreaterThan(0);
    expect(store.products).toEqual([]);
  });
});
