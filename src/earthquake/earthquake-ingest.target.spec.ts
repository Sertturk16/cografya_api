import { beforeEach, describe, expect, it } from '@jest/globals';
import { CircuitBreaker } from '../upstream/circuit-breaker';
import { OperationDeadline } from '../upstream/operation-deadline';
import { ProviderBudget } from '../upstream/provider-budget';
import { UpstreamHttpClient } from '../upstream/upstream-http.client';
import { UpstreamMetrics } from '../upstream/upstream-metrics';
import { EarthquakeBindingKind, EarthquakeIngestJobKind } from './earthquake.types';
import {
  AFAD_TDVMS_BUDGET,
  AFAD_TDVMS_PROVIDER,
  type EarthquakeUpstreamConfig,
} from './earthquake-upstream.config';
import { EarthquakeIngestTarget } from './earthquake-ingest.target';
import type {
  EarthquakeEventUpsert,
  EarthquakeIngestStorePort,
  EarthquakeUpsertResult,
  RecordRunInput,
} from './earthquake-ingest.store';

const NOW_MS = Date.UTC(2026, 7, 11, 12, 0, 0);

/** Every shape `fetch` accepts, reduced to the URL — the book leg's spec helper, same reason. */
function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

const CONFIG: EarthquakeUpstreamConfig = {
  enabled: true,
  ingestEnabled: true,
  baseUrl: 'https://example.invalid/apigateway/deprem/apiv2',
  recentIntervalSeconds: 300,
  reconcileIntervalSeconds: 21_600,
  tourDeadlineMs: 120_000,
  recentWindowHours: 6,
  reconcileWindowDays: 7,
  clockSkewSeconds: 300,
  singleCallTimeoutMs: 15_000,
  tourBudgetMs: 60_000,
  responseMaxBytes: 4_194_304,
  safetyLimit: 20_000,
  scopeBufferKm: 200,
  runRetentionDays: 14,
  budget: AFAD_TDVMS_BUDGET,
};

/** One synthetic provider row; every value is made up, only the SHAPE is real. */
function providerRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    rms: '0.29',
    eventID: '1',
    location: 'Göksun (Kahramanmaraş)',
    latitude: '38.05222',
    longitude: '36.63111',
    depth: '6.95',
    type: 'ML',
    magnitude: '1.8',
    country: 'Türkiye',
    province: 'Kahramanmaraş',
    district: 'Göksun',
    neighborhood: 'Gücüksu',
    date: '2026-08-11T11:03:34',
    isEventUpdate: false,
    lastUpdateDate: null,
    ...overrides,
  };
}

class FakeStore implements EarthquakeIngestStorePort {
  readonly upserted: EarthquakeEventUpsert[] = [];
  readonly runs: RecordRunInput[] = [];
  prunedWith: { retentionDays: number; now: Date } | null = null;
  storedIds = new Set<string>();
  failOnEventId: string | null = null;
  result: EarthquakeUpsertResult = { kind: 'inserted', revisionCount: 0 };

  constructor(private readonly plateCodes = new Map([['kahramanmaraş', '46']])) {}

  loadProvincePlateCodes(): Promise<Map<string, string>> {
    return Promise.resolve(this.plateCodes);
  }

  upsertEvent(row: EarthquakeEventUpsert): Promise<EarthquakeUpsertResult> {
    if (this.failOnEventId === row.providerEventId) {
      return Promise.reject(new Error('insert or update on table violates foreign key constraint'));
    }
    this.upserted.push(row);
    return Promise.resolve(this.result);
  }

  recordRun(input: RecordRunInput): Promise<void> {
    this.runs.push(input);
    return Promise.resolve();
  }

  pruneRuns(retentionDays: number, now: Date): Promise<number> {
    this.prunedWith = { retentionDays, now };
    return Promise.resolve(0);
  }

  providerEventIdsInWindow(): Promise<Set<string>> {
    return Promise.resolve(this.storedIds);
  }
}

describe('EarthquakeIngestTarget', () => {
  let metrics: UpstreamMetrics;
  let urls: string[];

  beforeEach(() => {
    metrics = new UpstreamMetrics();
    urls = [];
  });

  function build(
    store: EarthquakeIngestStorePort,
    respond: () => Response,
    overrides: Partial<EarthquakeUpstreamConfig> = {},
    jobKind: EarthquakeIngestJobKind = EarthquakeIngestJobKind.Recent,
  ): EarthquakeIngestTarget {
    const fetchImpl = ((input: RequestInfo | URL): Promise<Response> => {
      urls.push(requestUrl(input));
      return Promise.resolve(respond());
    }) as typeof fetch;

    const budget = new ProviderBudget(metrics, null, () => NOW_MS);
    const breaker = new CircuitBreaker(metrics);
    const client = new UpstreamHttpClient(metrics, budget, breaker, {
      singleCallTimeoutMs: 10_000,
      userAgent: 'TestBot/1.0',
      fetchImpl,
      sleepImpl: () => Promise.resolve(),
      now: () => NOW_MS,
    });

    return new EarthquakeIngestTarget({
      client,
      store,
      config: { ...CONFIG, ...overrides },
      metrics,
      jobKind,
      now: () => NOW_MS,
    });
  }

  function ok(rows: unknown[]): Response {
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { 'content-type': 'application/json;charset=utf-8' },
    });
  }

  const tour = (target: EarthquakeIngestTarget): Promise<void> =>
    target.refresh(new OperationDeadline(120_000, () => NOW_MS));

  it('stores what the provider returned and records the run', async () => {
    const store = new FakeStore();
    await tour(build(store, () => ok([providerRow(), providerRow({ eventID: '2' })])));

    expect(urls).toHaveLength(1);
    expect(store.upserted).toHaveLength(2);
    expect(store.runs).toHaveLength(1);
    expect(store.runs[0]?.outcome).toBe('ok');
    expect(store.runs[0]?.fetchedCount).toBe(2);
    expect(store.runs[0]?.insertedCount).toBe(2);
    expect(metrics.get('eq.rows_inserted', AFAD_TDVMS_PROVIDER)).toBe(2);
  });

  it('resolves the province plate code, and leaves it null when nothing matches', async () => {
    const store = new FakeStore();
    await tour(
      build(store, () => ok([providerRow(), providerRow({ eventID: '2', province: 'Atlantis' })])),
    );

    expect(store.upserted[0]?.bindingPlateCode).toBe('46');
    expect(store.upserted[0]?.bindingKind).toBe(EarthquakeBindingKind.Inside);
    expect(store.upserted[1]?.bindingPlateCode).toBeNull();
    expect(metrics.get('eq.plate_unresolved', AFAD_TDVMS_PROVIDER)).toBe(1);
  });

  it('keeps an out-of-scope event, flagged rather than dropped', async () => {
    const store = new FakeStore();
    // Somewhere in the Atlantic: far outside any buffer, and NOT in Türkiye.
    await tour(
      build(store, () =>
        ok([
          providerRow({
            country: 'Portekiz',
            latitude: '38.0',
            longitude: '-28.0',
            province: null,
          }),
        ]),
      ),
    );

    expect(store.upserted[0]?.inScope).toBe(false);
    expect(store.upserted[0]?.bindingKind).toBe(EarthquakeBindingKind.AcrossBorder);
    expect(store.runs[0]?.skippedOutOfScopeCount).toBe(1);
    // Stored, not discarded: the threshold and the buffer are display-time decisions, and data
    // filtered away at ingest never comes back.
    expect(store.upserted).toHaveLength(1);
  });

  it('lets one refused row through without losing the rest of the tour', async () => {
    const store = new FakeStore();
    await tour(
      build(store, () =>
        ok([
          providerRow(),
          providerRow({ eventID: '2', magnitude: 'abc' }),
          providerRow({ eventID: '3' }),
        ]),
      ),
    );

    expect(store.upserted.map((row) => row.providerEventId)).toEqual(['1', '3']);
    expect(metrics.get('eq.row_rejected', AFAD_TDVMS_PROVIDER)).toBe(1);
    expect(store.runs[0]?.outcome).toBe('ok');
  });

  it('lets one DATABASE refusal through the same way', async () => {
    const store = new FakeStore();
    store.failOnEventId = '2';
    await tour(
      build(store, () =>
        ok([providerRow(), providerRow({ eventID: '2' }), providerRow({ eventID: '3' })]),
      ),
    );

    expect(store.upserted.map((row) => row.providerEventId)).toEqual(['1', '3']);
    expect(metrics.get('eq.row_write_failed', AFAD_TDVMS_PROVIDER)).toBe(1);
    expect(store.runs).toHaveLength(1);
  });

  it('records a provider failure as a run instead of writing rows', async () => {
    const store = new FakeStore();
    await tour(build(store, () => new Response('nope', { status: 503 })));

    expect(store.upserted).toHaveLength(0);
    expect(store.runs[0]?.outcome).toBe('transient');
    expect(store.runs[0]?.errorReason).toBeTruthy();
  });

  it('files AFAD’s 500-with-a-400-body as OUR error, not the provider’s', async () => {
    const store = new FakeStore();
    await tour(
      build(
        store,
        () =>
          new Response(
            '{"timestamp":1786451618,"status":400,"error":"Parameter Exception",' +
              '"message":"Start-End Time is required"}',
            { status: 500, headers: { 'content-type': 'application/json;charset=utf-8' } },
          ),
      ),
    );

    // The point of the whole classifier: `transient` here would mean retrying our own malformed
    // query on every tour, for as long as it stayed malformed.
    expect(store.runs[0]?.outcome).toBe('client_error');
    expect(metrics.get('upstream.retry', AFAD_TDVMS_PROVIDER)).toBe(0);
  });

  it('fails the whole tour when the response sits on the safety limit', async () => {
    const store = new FakeStore();
    await tour(
      build(store, () => ok([providerRow(), providerRow({ eventID: '2' })]), { safetyLimit: 2 }),
    );

    expect(store.upserted).toHaveLength(0);
    expect(store.runs[0]?.outcome).toBe('schema_error');
  });

  it('does nothing at all when the leg is disabled — no call, no run row', async () => {
    const store = new FakeStore();
    await tour(build(store, () => ok([providerRow()]), { ingestEnabled: false }));

    expect(urls).toHaveLength(0);
    expect(store.upserted).toHaveLength(0);
    expect(store.runs).toHaveLength(0);
  });

  it('prunes the run ledger after a successful tour', async () => {
    const store = new FakeStore();
    await tour(build(store, () => ok([providerRow()])));
    expect(store.prunedWith?.retentionDays).toBe(14);
  });

  it('reports vanished events on the reconcile tour and deletes nothing', async () => {
    const store = new FakeStore();
    store.storedIds = new Set(['1', '2', '99']);
    await tour(build(store, () => ok([providerRow()]), {}, EarthquakeIngestJobKind.Reconcile));

    // '2' and '99' were stored and did not come back. Nothing in the store is removed — the
    // counter is the entire mechanism by which the disappearance becomes visible.
    expect(metrics.get('eq.rows_absent_upstream', AFAD_TDVMS_PROVIDER)).toBe(2);
  });

  it('does not run the disappearance check on the recent tour', async () => {
    const store = new FakeStore();
    store.storedIds = new Set(['1', '2', '99']);
    await tour(build(store, () => ok([providerRow()])));
    expect(metrics.get('eq.rows_absent_upstream', AFAD_TDVMS_PROVIDER)).toBe(0);
  });

  it('asks the two cadences for two different windows', async () => {
    const store = new FakeStore();
    await tour(build(store, () => ok([])));
    await tour(build(store, () => ok([]), {}, EarthquakeIngestJobKind.Reconcile));

    expect(urls[0]).toContain('start=2026-08-11T06:00:00');
    expect(urls[1]).toContain('start=2026-08-04T12:00:00');
    for (const url of urls) expect(url).toContain('end=2026-08-11T12:05:00');
  });

  it('never throws, whatever the store does', async () => {
    const store = new FakeStore();
    store.loadProvincePlateCodes = () => Promise.reject(new Error('database is on fire'));
    await expect(tour(build(store, () => ok([providerRow()])))).resolves.toBeUndefined();
    expect(metrics.get('eq.ingest_bug', AFAD_TDVMS_PROVIDER)).toBe(1);
  });
});
