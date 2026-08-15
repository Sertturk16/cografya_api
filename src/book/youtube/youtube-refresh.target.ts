import { Logger } from '@nestjs/common';
import { describeErrorWithName } from '../../common/describe-error';
import { OperationDeadline } from '../../upstream/operation-deadline';
import type { ScheduledWarmupTarget } from '../../upstream/scheduled-warmup.service';
import type { UpstreamHttpClient } from '../../upstream/upstream-http.client';
import type { UpstreamMetrics } from '../../upstream/upstream-metrics';
import type { YoutubeSnapshotStorePort } from './youtube-snapshot.store';
import { youtubeRedactor } from './youtube-redaction';
import { YOUTUBE_DATA_PROVIDER, type BookYoutubeSyncConfig } from './youtube-sync.config';
import {
  parseVideosListResponse,
  VIDEOS_LIST_MAX_IDS,
  VIDEOS_LIST_PARTS,
  type ParsedVideosList,
} from './youtube-videos.parse';

/**
 * How much budget one `videos.list` call is assumed to need before it is started.
 *
 * A call measured in hundreds of milliseconds; 2 s of assumed cost keeps the tour from opening a
 * request it cannot finish inside its remaining slice, which would spend the provider's capacity
 * and ours for a result nobody can use.
 */
const ESTIMATED_CALL_COST_MS = 2_000;

/**
 * The id shape a request may carry.
 *
 * `book_videos` pins it with a CHECK constraint, so a value failing here means the catalogue itself
 * is wrong — but the id is being interpolated into a URL, and a boundary that trusts its own
 * database is still a boundary that trusts an input it did not validate at the point of use.
 */
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export interface YoutubeRefreshTargetDeps {
  readonly client: UpstreamHttpClient;
  readonly store: YoutubeSnapshotStorePort;
  readonly config: BookYoutubeSyncConfig;
  readonly metrics: UpstreamMetrics;
  /** Injected in tests. */
  readonly now?: () => number;
}

/**
 * The refresh tour: one `videos.list` call per 50 ids, then upsert, then mark what did not come
 * back (SPEC §8.2).
 *
 * ## It asks about OUR ids, never about a playlist
 * `playlistItems.list` is a non-goal (SPEC §4.2). The video set is fixed by the seed, so the tour
 * asks the provider about exactly the ids we already publish. Two consequences, both deliberate: a
 * partner adding or removing a playlist entry cannot silently change our page, and the daily cost
 * is one quota unit.
 *
 * ## The absence rule only fires after a SUCCESSFUL call
 * "Asked and not returned" is only meaningful when the provider actually answered. A tour that
 * marked every id of a failed chunk as missing would, on one provider outage, blank every cover on
 * the site and set a `missing_since_utc` that no later tour can undo (the column keeps the FIRST
 * absence on purpose). So a non-`ok` outcome logs, counts and leaves the chunk untouched — the
 * snapshots simply age, which is exactly the graceful path SPEC §8.3 designs for.
 *
 * ## Fail-soft, row by row
 * A row that fails validation is counted and skipped; a row the database refuses (an FK violation
 * against a `book_videos` id corrected between the read and the write) is that row's failure and
 * the tour continues. The B1 migration states both obligations by name.
 */
export class YoutubeRefreshTarget implements ScheduledWarmupTarget {
  readonly label = 'youtube.videos';

  private readonly logger = new Logger('BookYoutubeRefresh');
  private readonly now: () => number;
  private readonly redact: (text: string) => string;

  constructor(private readonly deps: YoutubeRefreshTargetDeps) {
    this.now = deps.now ?? Date.now;
    this.redact = youtubeRedactor(deps.config.apiKey);
  }

  /** Never throws — the warmup contract. */
  async refresh(tourDeadline: OperationDeadline): Promise<void> {
    try {
      await this.runTourSlice(tourDeadline);
    } catch (error: unknown) {
      // Everything expected is handled inside, so reaching here is OUR bug: loud, counted, and
      // never allowed to take down the tour that hosts it.
      this.deps.metrics.increment('books.sync_bug', YOUTUBE_DATA_PROVIDER);
      this.logger.error(`refresh tour aborted by an unexpected error — ${this.describe(error)}`);
    }
  }

  private async runTourSlice(tourDeadline: OperationDeadline): Promise<void> {
    const { config, store } = this.deps;
    if (!config.refreshEnabled) return;
    if (config.apiKey === null) {
      // Unreachable through `validateEnv` (§14 cross-check 1 refuses the enabled-and-keyless
      // combination at boot). Stated rather than assumed, because the alternative is a request that
      // silently leaves without a credential and comes back 403.
      this.logger.error('refresh tour skipped: no API key, though the sync flag is on');
      return;
    }

    const ids = await store.listVideoIds();
    if (ids.length === 0) {
      // An empty catalogue is a SEED state, not an ingest fault (`QUESTIONS.md` H-7).
      this.logger.debug('refresh tour: the catalogue holds no video ids');
      return;
    }

    const usableIds = ids.filter((id) => VIDEO_ID_PATTERN.test(id));
    if (usableIds.length !== ids.length) {
      this.logger.error(
        `refresh tour: ${String(ids.length - usableIds.length)} catalogue id(s) do not match the ` +
          'expected 11-character shape and were not sent',
      );
    }
    if (usableIds.length === 0) return;

    const sliceBudgetMs = Math.min(config.tourBudgetMs, tourDeadline.remainingMs());
    if (sliceBudgetMs < ESTIMATED_CALL_COST_MS) {
      this.logger.log('refresh tour: slice too small for one call — yielding');
      return;
    }
    const deadline = new OperationDeadline(sliceBudgetMs, this.now);

    let written = 0;
    let refused = 0;
    let writeFailed = 0;
    let newlyMissing = 0;
    let chunksFailed = 0;
    let chunksSkipped = 0;

    for (const chunk of chunkIds(usableIds, VIDEOS_LIST_MAX_IDS)) {
      if (deadline.hasExpired()) {
        chunksSkipped += 1;
        continue;
      }

      const outcome = await this.deps.client.request<ParsedVideosList>({
        providerId: YOUTUBE_DATA_PROVIDER,
        label: 'youtube.videos.list',
        url: this.buildVideosListUrl(chunk),
        deadline,
        limits: config.budget,
        singleCallTimeoutMs: config.singleCallTimeoutMs,
        maxResponseBytes: config.responseMaxBytes,
        // The key travels in the header, never in the query string — the form verified live against
        // Data API v3 (SPEC §8.4). Nothing else about the request identifies us; the shared client
        // adds the User-Agent and the Accept header.
        headers: { 'X-goog-api-key': config.apiKey },
        // A provider that echoes a rejected credential into an error body would otherwise put it in
        // a line logged at ERROR: the pattern-based redactor cannot see a bare key.
        redactBody: this.redact,
        parse: (body: string) => ({ kind: 'ok', value: parseVideosListResponse(body) }),
      });

      if (outcome.kind !== 'ok') {
        // Already logged by the shared client with the provider, the label and the redacted reason.
        // NOT marked missing — see the class note.
        chunksFailed += 1;
        continue;
      }

      const fetchedAtUtc = new Date(this.now());
      for (const input of outcome.value.accepted) {
        try {
          await this.deps.store.upsertSnapshot(input, fetchedAtUtc);
          written += 1;
        } catch (error: unknown) {
          writeFailed += 1;
          this.deps.metrics.increment('books.row_write_failed', YOUTUBE_DATA_PROVIDER);
          this.logger.warn(
            `snapshot for ${input.youtubeVideoId} was not written — ${this.describe(error)}`,
          );
        }
      }

      for (const rejection of outcome.value.rejected) {
        refused += 1;
        this.deps.metrics.increment('books.snapshot_refused', YOUTUBE_DATA_PROVIDER);
        this.logger.warn(
          `snapshot for ${rejection.youtubeVideoId} refused — ${this.redact(rejection.reason)}`,
        );
      }

      // Asked and not returned AT ALL. An id the response carried but this leg refused is a data
      // quality failure, already counted above, and must not be recorded as a disappearance.
      const returned = new Set([
        ...outcome.value.accepted.map((row) => row.youtubeVideoId),
        ...outcome.value.rejected.map((row) => row.youtubeVideoId),
      ]);
      const absent = chunk.filter((id) => !returned.has(id));
      if (absent.length > 0) {
        newlyMissing += await this.deps.store.markMissing(absent, fetchedAtUtc);
      }
    }

    this.deps.metrics.increment('books.snapshot_written', YOUTUBE_DATA_PROVIDER, written);
    this.deps.metrics.increment('books.video_missing', YOUTUBE_DATA_PROVIDER, newlyMissing);

    const summary =
      `refresh tour done — ${String(written)} written, ${String(refused)} refused, ` +
      `${String(writeFailed)} write-failed, ${String(newlyMissing)} newly missing, ` +
      `${String(chunksFailed)} chunk(s) failed, ${String(chunksSkipped)} chunk(s) skipped`;
    // Newly missing is the dead-video health check (SPEC §4.1 item 4, risk R1) and the correction is
    // NOT automatic: a re-uploaded video is a new id whose 6 start seconds must be measured again,
    // which is an owner's job. So it is stated at WARN, where it is looked at, not at debug.
    if (newlyMissing > 0 || writeFailed > 0 || chunksFailed > 0) {
      this.logger.warn(summary);
    } else {
      this.logger.log(summary);
    }
  }

  /**
   * `{base}/videos?part=snippet,contentDetails,status&id=…`.
   *
   * Built by hand rather than through `URLSearchParams`, and the reason is measured: the separator
   * between ids is a literal comma, which `URLSearchParams` percent-encodes. The live verification
   * that answered SPEC §8.4 used literal commas and returned 200, so this is the form known to
   * work. Every id is pattern-checked before it reaches here, so there is nothing left to escape.
   *
   * **`hl` is never sent and `snippet.localized.*` is never read** (SPEC §8.2): no text field is
   * stored at all, and a machine-translated title is barred from publication anyway
   * (`SEO-POLICY.md` §B14).
   */
  private buildVideosListUrl(ids: readonly string[]): string {
    const base = this.deps.config.baseUrl.replace(/\/+$/, '');
    return `${base}/videos?part=${VIDEOS_LIST_PARTS}&id=${ids.join(',')}`;
  }

  /** Every error string this class logs passes the key redactor first (playbook §5). */
  private describe(error: unknown): string {
    return this.redact(describeErrorWithName(error));
  }
}

/** Split ids into request-sized chunks, preserving order. */
export function chunkIds(ids: readonly string[], size: number): string[][] {
  if (size < 1) throw new Error(`chunkIds needs a positive size, got ${String(size)}`);
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push([...ids.slice(index, index + size)]);
  }
  return chunks;
}
