import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Env } from '../config/env.schema';
import { CircuitBreaker } from '../upstream/circuit-breaker';
import { ProviderBudget } from '../upstream/provider-budget';
import { REDIS_CLIENT, type RedisClientPort } from '../upstream/redis/redis-client.port';
import { ScheduledWarmupService } from '../upstream/scheduled-warmup.service';
import { UpstreamHttpClient } from '../upstream/upstream-http.client';
import { UPSTREAM_USER_AGENT } from '../upstream/upstream-http.helpers';
import { UpstreamMetrics } from '../upstream/upstream-metrics';
import { UpstreamModule } from '../upstream/upstream.module';
import { BookController } from './book.controller';
import { BookService } from './book.service';
import { BookVideoQuestion } from './entities/book-video-question.entity';
import { BookVideo } from './entities/book-video.entity';
import { Book } from './entities/book.entity';
import { YoutubeVideoSnapshot } from './entities/youtube-video-snapshot.entity';
import { YoutubePurgeTarget } from './youtube/youtube-purge.target';
import { YoutubeRefreshTarget } from './youtube/youtube-refresh.target';
import {
  YoutubeSnapshotStore,
  YOUTUBE_SNAPSHOT_STORE,
  type YoutubeSnapshotStorePort,
} from './youtube/youtube-snapshot.store';
import {
  BOOK_YOUTUBE_SERVE_CONFIG,
  BOOK_YOUTUBE_SYNC_CONFIG,
  buildBookYoutubeServeConfig,
  buildBookYoutubeSyncConfig,
  type BookYoutubeServeConfig,
  type BookYoutubeSyncConfig,
} from './youtube/youtube-sync.config';

/**
 * Injection token for the YouTube-tuned HTTP client instance.
 *
 * A SECOND INSTANCE of the shared class, not a second implementation — the `ADS_UPSTREAM_CLIENT`
 * precedent. The budget, breaker and metrics objects are the SAME instances every other leg uses,
 * so this provider's budget and breaker state stay global to the process; only the single-call cap
 * differs.
 */
export const YOUTUBE_UPSTREAM_CLIENT = Symbol('YOUTUBE_UPSTREAM_CLIENT');

/** Injection token for the REFRESH tour (`books-youtube-refresh`). */
export const BOOK_YOUTUBE_REFRESH_WARMUP = Symbol('BOOK_YOUTUBE_REFRESH_WARMUP');

/** Injection token for the PURGE tour (`books-youtube-purge`). */
export const BOOK_YOUTUBE_PURGE_WARMUP = Symbol('BOOK_YOUTUBE_PURGE_WARMUP');

/**
 * The purge tour's own deadline, as a documented code constant rather than an env variable.
 *
 * SPEC §14 gives the purge an interval and no deadline, and that is right: the tour is ONE statement
 * over an indexed column, already bounded server-side by `DATABASE_STATEMENT_TIMEOUT_MS` (30 s), so
 * an operator turning this dial would be choosing between two numbers with the same meaning. It
 * exists at all because `ScheduledWarmupService` requires one; since this tour takes no Redis lock
 * (see the provider below), it no longer doubles as a lock TTL and is only the tour's own budget.
 *
 * There is deliberately no boot cross-check pairing it with `BOOKS_PURGE_INTERVAL_SECONDS`. If an
 * operator set an interval shorter than this, the in-process overlap guard skips the overlapping
 * tour — benign for an idempotent DELETE. A refusal to boot would be a bigger hammer than the
 * failure.
 */
const PURGE_TOUR_DEADLINE_MS = 60_000;

/**
 * The book module: two public reads (B3) plus the YouTube sync leg (B4).
 *
 * ## Two tours, ONE switch, and the asymmetry is the whole point
 * | tour | name | network | gate | lock |
 * |---|---|---|---|---|
 * | refresh | `books-youtube-refresh` | yes | `BOOKS_ENABLED` **and** `BOOKS_YOUTUBE_SYNC_ENABLED` | Redis |
 * | purge | `books-youtube-purge` | **no** | **none — unconditional** | **none** |
 *
 * The purge is NOT a step of the refresh tour (SPEC §8.1): as one, it would stop silently on a
 * provider outage and on a kill switch, which are precisely the two states in which data would then
 * age past the 30-calendar-day ceiling. Deleting is an obligation, not a feature — so it hangs off
 * no switch at all (Atlas ruling 2026-08-15, PR #111 SEC111-I1) and takes no cross-instance lock
 * (SEC111-I2). Both are the same sentence applied twice: an obligation may not be suspended by a
 * feature flag, and it may not be suspended by an infrastructure fault either.
 *
 * Each tour is its OWN `ScheduledWarmupService` instance — one instance per leg is the discipline
 * the class documents, and it is what gives each tour its own Redis lock key, its own timer names,
 * its own logger context and its own `redis.degraded` label.
 *
 * ## Neither switch gates the endpoints
 * `BOOKS_ENABLED=false` closes the refresh half only (`DEC 2026-08-15h` item 1). `/api/books` keeps
 * answering from Postgres, an unseeded store answers an empty envelope and a 404, and no request
 * path opens a socket in any configuration (SPEC §8.5, proved by a counting spy in the e2e).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Book, BookVideo, BookVideoQuestion, YoutubeVideoSnapshot]),
    UpstreamModule,
  ],
  controllers: [BookController],
  providers: [
    BookService,
    {
      provide: BOOK_YOUTUBE_SERVE_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): BookYoutubeServeConfig =>
        buildBookYoutubeServeConfig(config),
    },
    {
      provide: BOOK_YOUTUBE_SYNC_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): BookYoutubeSyncConfig =>
        buildBookYoutubeSyncConfig(config),
    },
    {
      provide: YOUTUBE_SNAPSHOT_STORE,
      inject: [DataSource],
      useFactory: (dataSource: DataSource): YoutubeSnapshotStorePort =>
        new YoutubeSnapshotStore(dataSource),
    },
    {
      provide: YOUTUBE_UPSTREAM_CLIENT,
      inject: [UpstreamMetrics, ProviderBudget, CircuitBreaker, BOOK_YOUTUBE_SYNC_CONFIG],
      useFactory: (
        metrics: UpstreamMetrics,
        budget: ProviderBudget,
        breaker: CircuitBreaker,
        config: BookYoutubeSyncConfig,
      ): UpstreamHttpClient =>
        new UpstreamHttpClient(metrics, budget, breaker, {
          singleCallTimeoutMs: config.singleCallTimeoutMs,
          userAgent: UPSTREAM_USER_AGENT,
        }),
    },
    {
      provide: BOOK_YOUTUBE_REFRESH_WARMUP,
      inject: [SchedulerRegistry, UpstreamMetrics, REDIS_CLIENT, BOOK_YOUTUBE_SYNC_CONFIG],
      useFactory: (
        schedulerRegistry: SchedulerRegistry,
        metrics: UpstreamMetrics,
        redis: RedisClientPort | null,
        config: BookYoutubeSyncConfig,
      ): ScheduledWarmupService =>
        new ScheduledWarmupService(schedulerRegistry, metrics, redis, {
          name: 'books-youtube-refresh',
          enabled: config.refreshEnabled,
          disabledBy: 'BOOKS_ENABLED / BOOKS_YOUTUBE_SYNC_ENABLED',
          intervalSeconds: config.intervalSeconds,
          deadlineMs: config.deadlineMs,
        }),
    },
    {
      provide: BOOK_YOUTUBE_PURGE_WARMUP,
      // No `REDIS_CLIENT` in this list, and that is the fix rather than an omission (#111 SEC111-I2).
      // `ScheduledWarmupService` SKIPS a tour whose lock Redis could not answer for — right for a
      // tour that would otherwise multiply provider load across instances, wrong for this one: the
      // purge makes no upstream call and its DELETE is idempotent, so the lock protects nothing
      // while its failure suspends a compliance obligation. A 36-hour Redis outage would have cost
      // 36 skipped purges and a row retained past 720 h.
      inject: [SchedulerRegistry, UpstreamMetrics, BOOK_YOUTUBE_SYNC_CONFIG],
      useFactory: (
        schedulerRegistry: SchedulerRegistry,
        metrics: UpstreamMetrics,
        config: BookYoutubeSyncConfig,
      ): ScheduledWarmupService =>
        new ScheduledWarmupService(schedulerRegistry, metrics, null, {
          name: 'books-youtube-purge',
          // Always true. This one line is the mechanism behind SPEC §8.1's central claim, and the
          // e2e boots with BOTH switches off to prove it.
          enabled: config.purgeEnabled,
          // Never printed, because `enabled` is never false — stated as the truth rather than left
          // naming a variable that no longer gates this tour.
          disabledBy: 'nothing — the purge is unconditional',
          locklessReason: 'OFF — deliberately unlocked: no external call, idempotent DELETE',
          intervalSeconds: config.purgeIntervalSeconds,
          deadlineMs: PURGE_TOUR_DEADLINE_MS,
        }),
    },
    // Both targets are built and REGISTERED here. The refresh target is gated on its own tour's
    // switch — with it off the target never exists AND its tour schedules nothing, so there is no
    // path on which a registered target could still run. The purge target carries no gate at all,
    // which is the same ruling seen from the other side: it is always built and always registered.
    {
      provide: YoutubeRefreshTarget,
      inject: [
        YOUTUBE_UPSTREAM_CLIENT,
        YOUTUBE_SNAPSHOT_STORE,
        BOOK_YOUTUBE_SYNC_CONFIG,
        UpstreamMetrics,
        BOOK_YOUTUBE_REFRESH_WARMUP,
      ],
      useFactory: (
        client: UpstreamHttpClient,
        store: YoutubeSnapshotStorePort,
        config: BookYoutubeSyncConfig,
        metrics: UpstreamMetrics,
        warmup: ScheduledWarmupService,
      ): YoutubeRefreshTarget | null => {
        if (!config.refreshEnabled) return null;
        const target = new YoutubeRefreshTarget({ client, store, config, metrics });
        warmup.register(target);
        return target;
      },
    },
    {
      provide: YoutubePurgeTarget,
      inject: [
        YOUTUBE_SNAPSHOT_STORE,
        BOOK_YOUTUBE_SYNC_CONFIG,
        UpstreamMetrics,
        BOOK_YOUTUBE_PURGE_WARMUP,
      ],
      useFactory: (
        store: YoutubeSnapshotStorePort,
        config: BookYoutubeSyncConfig,
        metrics: UpstreamMetrics,
        warmup: ScheduledWarmupService,
      ): YoutubePurgeTarget => {
        // No `if (!config.purgeEnabled) return null` twin of the refresh factory above: the field is
        // `true` by type, so the branch could not be taken and would read as a gate that exists.
        const target = new YoutubePurgeTarget({ store, config, metrics });
        warmup.register(target);
        return target;
      },
    },
  ],
  exports: [BOOK_YOUTUBE_REFRESH_WARMUP, BOOK_YOUTUBE_PURGE_WARMUP, YOUTUBE_SNAPSHOT_STORE],
})
export class BookModule {}
