import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookVideo } from '../book/entities/book-video.entity';
import { YoutubeVideoSnapshot } from '../book/entities/youtube-video-snapshot.entity';
import {
  BOOK_YOUTUBE_SERVE_CONFIG,
  buildBookYoutubeServeConfig,
  type BookYoutubeServeConfig,
} from '../book/youtube/youtube-sync.config';
import { type Env, parseHostList } from '../config/env.schema';
import { CircuitBreaker } from '../upstream/circuit-breaker';
import { ProviderBudget } from '../upstream/provider-budget';
import { UpstreamHttpClient } from '../upstream/upstream-http.client';
import { UPSTREAM_USER_AGENT } from '../upstream/upstream-http.helpers';
import { UpstreamMetrics } from '../upstream/upstream-metrics';
import { UpstreamModule } from '../upstream/upstream.module';
import { VideoCoverController } from './video-cover.controller';
import {
  VIDEO_COVER_CONFIG,
  VIDEO_COVER_UPSTREAM_CLIENT,
  VideoCoverService,
  type VideoCoverConfig,
} from './video-cover.service';

/**
 * The video-cover module — a new sibling to `BookModule`, not an extension of it (plan §5.1).
 *
 * `BookModule`'s own exports carry no raw `BookVideo`/`YoutubeVideoSnapshot` repository (only
 * `YOUTUBE_SNAPSHOT_STORE`, a WRITE-scoped port), so this module registers its OWN
 * `TypeOrmModule.forFeature([BookVideo, YoutubeVideoSnapshot])` — TypeORM supports the same entity
 * registered in more than one module's `forFeature`, each getting its own repository bound to the
 * same table, exactly as `VideoIdentityModule` already does with `BookVideo` today.
 * `isSnapshotServable` and `BOOK_YOUTUBE_SERVE_CONFIG`'s own builder are imported directly as plain
 * exported functions — no Nest-level coupling to `BookModule` either way.
 *
 * `UpstreamModule` is imported for the shared `UpstreamMetrics`/`ProviderBudget`/`CircuitBreaker`
 * singletons; a SECOND `UpstreamHttpClient` instance is still built here (`VIDEO_COVER_UPSTREAM_CLIENT`),
 * following the `YOUTUBE_UPSTREAM_CLIENT` precedent in `book.module.ts` — a second instance of the
 * same class, never a second implementation.
 */
@Module({
  imports: [TypeOrmModule.forFeature([BookVideo, YoutubeVideoSnapshot]), UpstreamModule],
  controllers: [VideoCoverController],
  providers: [
    VideoCoverService,
    {
      // A SEPARATE instance of the same token/factory `book.module.ts` provides — Nest DI is
      // module-scoped, so two modules independently providing the same Symbol token is exactly the
      // established pattern here, not a collision.
      provide: BOOK_YOUTUBE_SERVE_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): BookYoutubeServeConfig =>
        buildBookYoutubeServeConfig(config),
    },
    {
      provide: VIDEO_COVER_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): VideoCoverConfig => ({
        upstreamHosts: parseHostList(
          config.getOrThrow('VIDEO_COVER_UPSTREAM_HOSTS', { infer: true }),
        ),
        singleCallTimeoutMs: config.getOrThrow('VIDEO_COVER_SINGLE_CALL_TIMEOUT_MS', {
          infer: true,
        }),
        requestDeadlineMs: config.getOrThrow('VIDEO_COVER_REQUEST_DEADLINE_MS', { infer: true }),
      }),
    },
    {
      provide: VIDEO_COVER_UPSTREAM_CLIENT,
      inject: [UpstreamMetrics, ProviderBudget, CircuitBreaker, VIDEO_COVER_CONFIG],
      useFactory: (
        metrics: UpstreamMetrics,
        budget: ProviderBudget,
        breaker: CircuitBreaker,
        config: VideoCoverConfig,
      ): UpstreamHttpClient =>
        new UpstreamHttpClient(metrics, budget, breaker, {
          singleCallTimeoutMs: config.singleCallTimeoutMs,
          userAgent: UPSTREAM_USER_AGENT,
        }),
    },
  ],
})
export class VideoCoverModule {}
