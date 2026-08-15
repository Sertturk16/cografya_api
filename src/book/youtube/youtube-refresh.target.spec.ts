import { beforeEach, describe, expect, it } from '@jest/globals';
import { CircuitBreaker } from '../../upstream/circuit-breaker';
import { OperationDeadline } from '../../upstream/operation-deadline';
import { ProviderBudget } from '../../upstream/provider-budget';
import { UpstreamHttpClient } from '../../upstream/upstream-http.client';
import { UpstreamMetrics } from '../../upstream/upstream-metrics';
import { YoutubeThumbnailKey } from '../book.types';
import { chunkIds, YoutubeRefreshTarget } from './youtube-refresh.target';
import type { YoutubeSnapshotStorePort } from './youtube-snapshot.store';
import { YOUTUBE_DATA_BUDGET, YOUTUBE_DATA_PROVIDER } from './youtube-sync.config';
import type { BookYoutubeSyncConfig } from './youtube-sync.config';
import type { YoutubeSnapshotInput } from './youtube-videos.parse';

/**
 * The refresh tour, against a fake `fetch` and a fake store.
 *
 * The HTTP client is the REAL one (the air-quality ingest spec's harness): the whole guard chain —
 * budget, breaker, deadline, byte cap, content type, parse — runs, so an assertion about the request
 * this leg makes is an assertion about the request the process would really send.
 *
 * **The key used here is a fabricated string.** No real credential appears in this file, and the
 * `no-key-material` case below asserts the shape of that guarantee rather than restating it.
 */
const FAKE_KEY = 'test-key-not-a-real-credential';
const NOW_MS = Date.parse('2026-08-15T12:00:00.000Z');

const CONFIG: BookYoutubeSyncConfig = {
  refreshEnabled: true,
  purgeEnabled: true,
  baseUrl: 'https://provider.invalid/youtube/v3',
  apiKey: FAKE_KEY,
  intervalSeconds: 86_400,
  deadlineMs: 60_000,
  tourBudgetMs: 30_000,
  singleCallTimeoutMs: 10_000,
  responseMaxBytes: 2_097_152,
  purgeIntervalSeconds: 3_600,
  hardMaxAgeHours: 720,
  budget: YOUTUBE_DATA_BUDGET,
};

function videoId(index: number): string {
  // 11 characters of the legal alphabet, deterministic and obviously synthetic.
  return `vid${String(index).padStart(8, '0')}`;
}

function apiItem(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    snippet: {
      publishedAt: '2026-05-07T12:50:41Z',
      thumbnails: { maxres: { url: 'https://example.invalid/x.jpg', width: 1280, height: 720 } },
    },
    contentDetails: { duration: 'PT7M56S' },
    status: { privacyStatus: 'public', embeddable: true },
    ...overrides,
  };
}

interface RecordedCall {
  readonly url: string;
  readonly headers: Record<string, string>;
}

/** The three shapes `fetch` accepts, reduced to the one this file asserts against. */
function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

class FakeStore implements YoutubeSnapshotStorePort {
  readonly upserted: { input: YoutubeSnapshotInput; fetchedAtUtc: Date }[] = [];
  readonly markedMissing: string[][] = [];
  readonly purged: Date[] = [];
  failWritesFor = new Set<string>();
  listShouldThrow = false;

  constructor(private readonly ids: string[]) {}

  listVideoIds(): Promise<string[]> {
    if (this.listShouldThrow) return Promise.reject(new Error('postgres is unreachable'));
    return Promise.resolve([...this.ids]);
  }

  upsertSnapshot(input: YoutubeSnapshotInput, fetchedAtUtc: Date): Promise<void> {
    if (this.failWritesFor.has(input.youtubeVideoId)) {
      return Promise.reject(new Error('insert or update violates foreign key constraint'));
    }
    this.upserted.push({ input, fetchedAtUtc });
    return Promise.resolve();
  }

  markMissing(youtubeVideoIds: readonly string[]): Promise<number> {
    this.markedMissing.push([...youtubeVideoIds]);
    return Promise.resolve(youtubeVideoIds.length);
  }

  purgeOlderThan(cutoffUtc: Date): Promise<number> {
    this.purged.push(cutoffUtc);
    return Promise.resolve(0);
  }
}

describe('chunkIds', () => {
  it('splits at the provider ceiling and preserves order', () => {
    const ids = Array.from({ length: 120 }, (_value, index) => videoId(index));
    const chunks = chunkIds(ids, 50);
    expect(chunks.map((chunk) => chunk.length)).toEqual([50, 50, 20]);
    expect(chunks.flat()).toEqual(ids);
  });

  it('returns nothing for an empty set, and refuses a nonsensical size', () => {
    expect(chunkIds([], 50)).toEqual([]);
    expect(() => chunkIds(['a'], 0)).toThrow();
  });
});

describe('YoutubeRefreshTarget', () => {
  let metrics: UpstreamMetrics;
  let calls: RecordedCall[];

  beforeEach(() => {
    metrics = new UpstreamMetrics();
    calls = [];
  });

  function build(
    store: FakeStore,
    respond: (call: RecordedCall) => Response,
    config: BookYoutubeSyncConfig = CONFIG,
  ): YoutubeRefreshTarget {
    const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
        headers[name] = value;
      }
      const call = { url: requestUrl(input), headers };
      calls.push(call);
      return Promise.resolve(respond(call));
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

    return new YoutubeRefreshTarget({ client, store, config, metrics, now: () => NOW_MS });
  }

  function ok(items: unknown[]): Response {
    return new Response(JSON.stringify({ kind: 'youtube#videoListResponse', items }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=UTF-8' },
    });
  }

  const tour = async (target: YoutubeRefreshTarget): Promise<void> => {
    await target.refresh(new OperationDeadline(60_000, () => NOW_MS));
  };

  it('asks ONE call for a catalogue that fits the provider ceiling, and upserts what comes back', async () => {
    const ids = [videoId(1), videoId(2), videoId(3)];
    const store = new FakeStore(ids);
    await tour(build(store, () => ok(ids.map((id) => apiItem(id)))));

    expect(calls).toHaveLength(1);
    expect(store.upserted.map((row) => row.input.youtubeVideoId)).toEqual(ids);
    expect(store.upserted[0]?.input.thumbnailKey).toBe(YoutubeThumbnailKey.Maxres);
    expect(store.markedMissing).toEqual([]);
  });

  it('stamps every row of one tour with the SAME fetched instant', async () => {
    // The retention clock, the soft threshold and the purge all read this column, so two rows of
    // one tour disagreeing about when the provider answered would age apart for no reason.
    const ids = [videoId(1), videoId(2)];
    const store = new FakeStore(ids);
    await tour(build(store, () => ok(ids.map((id) => apiItem(id)))));

    const stamps = new Set(store.upserted.map((row) => row.fetchedAtUtc.getTime()));
    expect(stamps.size).toBe(1);
  });

  it('splits a catalogue past the ceiling into several calls', async () => {
    const ids = Array.from({ length: 51 }, (_value, index) => videoId(index));
    const store = new FakeStore(ids);
    await tour(build(store, () => ok([])));

    expect(calls).toHaveLength(2);
  });

  describe('the key never leaves the process except in the header (SPEC §8.4, §13 item 15)', () => {
    it('sends `X-goog-api-key` and puts NOTHING key-shaped in the URL', async () => {
      const ids = [videoId(1)];
      const store = new FakeStore(ids);
      await tour(build(store, () => ok([apiItem(ids[0] ?? '')])));

      const [call] = calls;
      expect(call?.headers['X-goog-api-key']).toBe(FAKE_KEY);
      // The header form was verified live against Data API v3, which is what made the `?key=`
      // fallback (and its mandatory URL redaction) unnecessary. These two assertions are what keeps
      // it that way: a URL is the one place a credential reaches every log line and every
      // `Error.cause` chain.
      expect(call?.url).not.toContain(FAKE_KEY);
      expect(call?.url).not.toContain('key=');
    });

    it('does not send `hl`, and asks for exactly the three parts §5.4 needs', async () => {
      const store = new FakeStore([videoId(1)]);
      await tour(build(store, () => ok([])));

      const url = new URL(calls[0]?.url ?? '');
      expect([...url.searchParams.keys()].sort()).toEqual(['id', 'part']);
      expect(url.searchParams.get('part')).toBe('snippet,contentDetails,status');
    });

    it('carries no key material into a failure log when the provider rejects the request', async () => {
      // The provider echoing a rejected credential into an error body is the one path a header
      // cannot protect: the shared client puts 200 bytes of that body into a line logged at ERROR.
      const store = new FakeStore([videoId(1)]);
      const events: string[] = [];
      const target = build(
        store,
        () =>
          new Response(JSON.stringify({ error: { message: `API key ${FAKE_KEY} not valid` } }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          }),
      );
      const originalEvent = metrics.event.bind(metrics);
      metrics.event = (level, message, context): void => {
        events.push(`${message} ${JSON.stringify(context)}`);
        originalEvent(level, message, context);
      };

      await tour(target);

      expect(events.length).toBeGreaterThan(0);
      const joined = events.join('\n');
      expect(joined).toContain('[REDACTED]');
      expect(joined).not.toContain(FAKE_KEY);
    });
  });

  describe('the absence rule', () => {
    it('marks an id the provider did not return', async () => {
      const ids = [videoId(1), videoId(2)];
      const store = new FakeStore(ids);
      await tour(build(store, () => ok([apiItem(ids[0] ?? '')])));

      expect(store.markedMissing).toEqual([[videoId(2)]]);
    });

    it('does NOT mark anything when the call FAILED — the outage that would blank the site', async () => {
      // "Asked and not returned" is only meaningful when the provider answered. Marking a failed
      // chunk would stamp `missing_since_utc` on every video at once, and that column keeps the
      // FIRST absence on purpose, so no later tour could undo it.
      const ids = [videoId(1), videoId(2)];
      const store = new FakeStore(ids);
      await tour(build(store, () => new Response('upstream is down', { status: 503 })));

      expect(store.markedMissing).toEqual([]);
      expect(store.upserted).toEqual([]);
    });

    it('does NOT mark an id that came back but was refused — that is a data fault, not an absence', async () => {
      const ids = [videoId(1)];
      const store = new FakeStore(ids);
      await tour(
        build(store, () => ok([apiItem(ids[0] ?? '', { contentDetails: { duration: 'PT60S' } })])),
      );

      expect(store.markedMissing).toEqual([]);
      expect(store.upserted).toEqual([]);
      expect(metrics.get('books.snapshot_refused', YOUTUBE_DATA_PROVIDER)).toBe(1);
    });
  });

  describe('fail-soft', () => {
    it('keeps writing the rest of the chunk when the database refuses ONE row', async () => {
      // The B1 migration states this obligation by name: an FK violation on one id is that row's
      // failure, because a structural guarantee that can halt a fail-soft loop trades one failure
      // mode for a worse one.
      const ids = [videoId(1), videoId(2), videoId(3)];
      const store = new FakeStore(ids);
      store.failWritesFor.add(videoId(2));
      await tour(build(store, () => ok(ids.map((id) => apiItem(id)))));

      expect(store.upserted.map((row) => row.input.youtubeVideoId)).toEqual([
        videoId(1),
        videoId(3),
      ]);
      expect(metrics.get('books.row_write_failed', YOUTUBE_DATA_PROVIDER)).toBe(1);
    });

    it('never throws when the store itself fails, and counts it as OUR bug', async () => {
      const store = new FakeStore([videoId(1)]);
      store.listShouldThrow = true;

      await expect(tour(build(store, () => ok([])))).resolves.toBeUndefined();
      expect(metrics.get('books.sync_bug', YOUTUBE_DATA_PROVIDER)).toBe(1);
    });

    it('makes no call at all while the sync is disabled', async () => {
      const store = new FakeStore([videoId(1)]);
      await tour(build(store, () => ok([]), { ...CONFIG, refreshEnabled: false }));

      expect(calls).toEqual([]);
      expect(store.upserted).toEqual([]);
    });

    it('makes no call when the key is absent, though the schema makes that unreachable', async () => {
      const store = new FakeStore([videoId(1)]);
      await tour(build(store, () => ok([]), { ...CONFIG, apiKey: null }));

      expect(calls).toEqual([]);
    });

    it('never puts a catalogue id of the wrong shape into a URL', async () => {
      // The id is interpolated into a request. `book_videos` pins its shape with a CHECK, but a
      // boundary that trusts its own database is still a boundary trusting an unvalidated input.
      const store = new FakeStore(['../../etc/passwd', videoId(1)]);
      await tour(build(store, () => ok([])));

      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).not.toContain('passwd');
      expect(calls[0]?.url).toContain(videoId(1));
    });
  });
});
