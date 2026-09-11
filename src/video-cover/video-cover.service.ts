import { Inject, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookVideo } from '../book/entities/book-video.entity';
import { YoutubeVideoSnapshot } from '../book/entities/youtube-video-snapshot.entity';
import { isSnapshotServable } from '../book/youtube/youtube-serving';
import {
  BOOK_YOUTUBE_SERVE_CONFIG,
  type BookYoutubeServeConfig,
} from '../book/youtube/youtube-sync.config';
import { OperationDeadline } from '../upstream/operation-deadline';
import type { ProviderBudgetLimits } from '../upstream/provider-budget';
import { UpstreamHttpClient } from '../upstream/upstream-http.client';
import { isAllowedThumbnailHost } from './video-cover-upstream-host';
import { VIDEO_COVER_ERROR_KEYS } from './video-cover-error-keys';

/**
 * OUR label for this leg, distinct from `YOUTUBE_DATA_PROVIDER` (`'youtube-data'`) — plan §5.7.
 *
 * `ProviderBudget`/`CircuitBreaker` state is keyed by provider id and shared globally across every
 * `UpstreamHttpClient` instance. `YOUTUBE_DATA_BUDGET` is sized for a ONE-CALL-A-DAY background sync
 * tour against a quota-metered JSON API; reusing it here would mean the first handful of anonymous
 * page views each day exhaust the whole daily sync budget, breaking both legs. `i.ytimg.com` is an
 * unmetered static CDN, not a quota-metered API.
 */
export const VIDEO_COVER_PROVIDER = 'youtube-thumbnail-cdn';

/**
 * A self-protective ceiling against a runaway/abusive traffic spike — NOT quota conservation
 * (`ProviderBudgetLimits`'s own docblock: where no provider quota is published, these are "the
 * ceiling we impose on OURSELVES"). A first-cut default, reasoned but not load-tested against real
 * traffic (plan §5.7/§13) — flagged for owner confirmation before this route carries real
 * production traffic, not asserted as tuned.
 */
export const VIDEO_COVER_UPSTREAM_BUDGET: ProviderBudgetLimits = {
  perMinute: 1_000,
  perHour: 30_000,
  perDay: 300_000,
};

/** Injection token for the tuned `UpstreamHttpClient` instance this leg fetches through. */
export const VIDEO_COVER_UPSTREAM_CLIENT = Symbol('VIDEO_COVER_UPSTREAM_CLIENT');

/** Injection token for {@link VideoCoverConfig}. */
export const VIDEO_COVER_CONFIG = Symbol('VIDEO_COVER_CONFIG');

/** What this leg needs from env, resolved once by `VideoCoverModule`. */
export interface VideoCoverConfig {
  /** `VIDEO_COVER_UPSTREAM_HOSTS`, parsed — the SSRF allowlist `isAllowedThumbnailHost` checks. */
  readonly upstreamHosts: readonly string[];
  /** `VIDEO_COVER_SINGLE_CALL_TIMEOUT_MS` — cap on the ONE live fetch a request may make. */
  readonly singleCallTimeoutMs: number;
  /** `VIDEO_COVER_REQUEST_DEADLINE_MS` — total upstream budget for ONE incoming request. */
  readonly requestDeadlineMs: number;
}

/**
 * The api's own cover proxy for one book video — plan §5, closing VAL137-NEW-C1/VAL137-C1's api
 * half.
 *
 * ## Every failure state converges on the same uniform 404 (plan §5.6), by construction
 * `getCover` has exactly one throw statement. An unknown id, a row whose snapshot is not
 * `isSnapshotServable` (no snapshot yet, aged past the soft threshold, the provider stopped
 * returning the id, or `missing_since_utc` is set — the same four states the JSON path already
 * degrades to `youtube: null` for), a `thumbnail_url` refused by the SSRF allowlist, and every
 * upstream failure class `UpstreamHttpClient` distinguishes (`transient`, `client_error`,
 * `rate_limited`, `schema_error`, `budget_exhausted`, an open circuit breaker) all reach the same
 * `refuse()` call — no field, no status-code variation and no upstream-derived text ever
 * distinguishes one from another to the caller.
 *
 * ## No byte persistence, ever (plan §5.5)
 * The fetched bytes are held in memory only for the single request/response cycle this method
 * returns from, and are never written to Redis, disk, or any other durable store this process
 * controls — `provenance/integrations.md`'s "no byte of YouTube audiovisual content is stored"
 * posture, applied to a server that now transiently relays rather than only ever being hotlinked
 * client-side.
 *
 * ## Never forwards an upstream header
 * `Content-Type` on the returned `StreamableFile` is always the literal `'image/jpeg'` this class
 * sets — the upstream response's own `Content-Type` is validated (`expectedContentType` below) and
 * then discarded as a header source, never copied onto the outgoing response.
 */
@Injectable()
export class VideoCoverService {
  constructor(
    @InjectRepository(BookVideo)
    private readonly videos: Repository<BookVideo>,
    @InjectRepository(YoutubeVideoSnapshot)
    private readonly snapshots: Repository<YoutubeVideoSnapshot>,
    @Inject(BOOK_YOUTUBE_SERVE_CONFIG)
    private readonly serveConfig: BookYoutubeServeConfig,
    @Inject(VIDEO_COVER_UPSTREAM_CLIENT)
    private readonly client: UpstreamHttpClient,
    @Inject(VIDEO_COVER_CONFIG)
    private readonly config: VideoCoverConfig,
  ) {}

  async getCover(bookVideoId: string): Promise<StreamableFile> {
    const video = await this.videos.findOne({ where: { id: bookVideoId } });
    if (video === null) throw this.refuse();

    const snapshot = await this.snapshots.findOne({
      where: { youtubeVideoId: video.youtubeVideoId },
    });
    if (snapshot === null) throw this.refuse();
    if (!isSnapshotServable(snapshot, Date.now(), this.serveConfig.softMaxAgeHours)) {
      throw this.refuse();
    }

    const allowedUrl = isAllowedThumbnailHost(snapshot.thumbnailUrl, this.config.upstreamHosts);
    if (allowedUrl === null) throw this.refuse();

    const deadline = new OperationDeadline(this.config.requestDeadlineMs);
    const outcome = await this.client.request<Uint8Array>({
      providerId: VIDEO_COVER_PROVIDER,
      label: 'video-cover.fetch',
      url: allowedUrl.toString(),
      deadline,
      limits: VIDEO_COVER_UPSTREAM_BUDGET,
      responseKind: 'bytes',
      expectedContentType: 'image/jpeg',
      // A stored thumbnail address that stops resolving (the video/thumbnail was removed at the
      // provider) is an expected, legitimate absence on a link this old — the same vocabulary the
      // ECMWF cycle-walk uses for "not published yet". Quiet log, breaker success; still collapses
      // into the same uniform 404 below either way.
      missingMeansNoData: true,
      singleCallTimeoutMs: this.config.singleCallTimeoutMs,
      parse: (body) => ({ kind: 'ok' as const, value: body }),
    });

    if (outcome.kind !== 'ok') throw this.refuse();

    return new StreamableFile(outcome.value, {
      type: 'image/jpeg',
      length: outcome.value.byteLength,
    });
  }

  /** The one throw site — see the class docblock for why every failure state reaches only this. */
  private refuse(): NotFoundException {
    return new NotFoundException(VIDEO_COVER_ERROR_KEYS.notFound);
  }
}
