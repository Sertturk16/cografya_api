import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UpstreamCacheService } from '../upstream/cache/upstream-cache.service';
import { CircuitBreaker } from '../upstream/circuit-breaker';
import { ProviderBudget } from '../upstream/provider-budget';
import { UpstreamHttpClient } from '../upstream/upstream-http.client';
import { UPSTREAM_USER_AGENT } from '../upstream/upstream-http.helpers';
import { UpstreamMetrics } from '../upstream/upstream-metrics';
import { UpstreamModule } from '../upstream/upstream.module';
import type { Env } from '../config/env.schema';
import { ElevationController } from './elevation.controller';
import { ElevationEnabledGuard } from './elevation-enabled.guard';
import { ElevationProfileService } from './elevation-profile.service';
import {
  buildElevationUpstreamConfig,
  ELEVATION_UPSTREAM_CONFIG,
  type ElevationUpstreamConfig,
} from './elevation-upstream.config';
import { TerrainTileCache } from './terrain/tile-cache';
import { TerrainTileClient } from './terrain/tile.client';

/**
 * Injection token for the terrain-tuned HTTP client instance.
 *
 * A SECOND INSTANCE of the shared class, never a second implementation (the `ECMWF_UPSTREAM_CLIENT`
 * and `AFAD_UPSTREAM_CLIENT` precedent): a ~120 kB PNG does not fit the 3 s marine single-call cap
 * this API's default client is built with. The metrics, budget and breaker objects are the SAME
 * instances every other leg uses, so this provider's budget and breaker state stay global to the
 * process no matter which client touched them.
 */
export const TERRAIN_UPSTREAM_CLIENT = Symbol('TERRAIN_UPSTREAM_CLIENT');

/**
 * The elevation leg: one public read endpoint over the AWS terrain-tile bucket.
 *
 * ## No entity, no migration, no seed
 * Nothing this leg serves is persisted. The profile lives in the upstream cache, the tiles live in
 * a bounded in-process LRU, and the attribution strings are compiled constants. Withdrawing the
 * whole feature is deleting one directory — which is the mitigation recorded against the
 * provider-continuity risk (`provenance/integrations.md`: the Tilezen docs have not been touched
 * since 2017 and carry no written continuity commitment).
 *
 * ## `ELEVATION_ENABLED` gates the ROUTE, and that is the difference from the earthquake leg
 * There the switch governs an ingest while the routes stay up and degrade from Postgres. Here
 * there is no local store to degrade to: with the feature off there is nothing to serve, so the
 * guard answers 404 and no branch reaches the provider. The providers are still registered
 * unconditionally so the module graph is identical in every environment (Atlas ruling U-2).
 *
 * ## No scheduled work
 * There is no warmup tour and no timer. Warming would need a list of popular lines, and no such
 * measurement exists — inventing targets to warm is exactly the reflex `ENGINEERING.md` §12 asks
 * to surface first. `plan-api.md` §12 R4 records the trigger for proposing one later.
 */
@Module({
  imports: [UpstreamModule],
  controllers: [ElevationController],
  providers: [
    ElevationEnabledGuard,
    {
      provide: ELEVATION_UPSTREAM_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): ElevationUpstreamConfig =>
        buildElevationUpstreamConfig(config),
    },
    {
      provide: TERRAIN_UPSTREAM_CLIENT,
      inject: [UpstreamMetrics, ProviderBudget, CircuitBreaker, ELEVATION_UPSTREAM_CONFIG],
      useFactory: (
        metrics: UpstreamMetrics,
        budget: ProviderBudget,
        breaker: CircuitBreaker,
        config: ElevationUpstreamConfig,
      ): UpstreamHttpClient =>
        new UpstreamHttpClient(metrics, budget, breaker, {
          singleCallTimeoutMs: config.singleCallTimeoutMs,
          userAgent: UPSTREAM_USER_AGENT,
        }),
    },
    {
      // ONE cache for the process, not one per request: that is the entire point of it, and the
      // reason the ceiling is expressed in tiles (≈ 128 KiB each) rather than in requests.
      provide: TerrainTileCache,
      inject: [ELEVATION_UPSTREAM_CONFIG],
      useFactory: (config: ElevationUpstreamConfig): TerrainTileCache =>
        new TerrainTileCache(config.tileCacheMaxTiles),
    },
    {
      provide: TerrainTileClient,
      inject: [TERRAIN_UPSTREAM_CLIENT, UpstreamMetrics, ELEVATION_UPSTREAM_CONFIG],
      useFactory: (
        http: UpstreamHttpClient,
        metrics: UpstreamMetrics,
        config: ElevationUpstreamConfig,
      ): TerrainTileClient =>
        new TerrainTileClient(http, metrics, {
          baseUrl: config.baseUrl,
          limits: config.budget,
          singleCallTimeoutMs: config.singleCallTimeoutMs,
          maxResponseBytes: config.tileMaxResponseBytes,
        }),
    },
    {
      provide: ElevationProfileService,
      inject: [
        UpstreamCacheService,
        TerrainTileClient,
        TerrainTileCache,
        UpstreamMetrics,
        ELEVATION_UPSTREAM_CONFIG,
      ],
      useFactory: (
        cache: UpstreamCacheService,
        tiles: TerrainTileClient,
        tileCache: TerrainTileCache,
        metrics: UpstreamMetrics,
        config: ElevationUpstreamConfig,
      ): ElevationProfileService =>
        new ElevationProfileService(cache, tiles, tileCache, metrics, config),
    },
  ],
  exports: [ELEVATION_UPSTREAM_CONFIG],
})
export class ElevationModule {}
