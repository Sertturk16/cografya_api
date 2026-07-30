import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Env } from '../config/env.schema';
import { REDIS_CLIENT, type RedisClientPort } from '../upstream/redis/redis-client.port';
import { UpstreamMetrics } from '../upstream/upstream-metrics';
import { UpstreamModule } from '../upstream/upstream.module';
import { MarinePoint } from './entities/marine-point.entity';
import { MarineCacheAgeInterceptor } from './marine-cache-age.interceptor';
import {
  buildMarineUpstreamConfig,
  MARINE_UPSTREAM_CONFIG,
  type MarineUpstreamConfig,
} from './marine-upstream.config';
import { MarineController } from './marine.controller';
import { MarineService } from './marine.service';
import { MarineWarmupService } from './marine-warmup.service';

/**
 * Marine module.
 *
 * M1 shipped the reference-point read and the static layer catalogue — both pure local reads.
 * M2 adds the upstream infrastructure around them: the shared cache/HTTP/budget/breaker layer
 * (imported, provider-neutral) plus the two marine-specific pieces, the warmup tour and the
 * `X-Marine-Cache-Age` header mechanism.
 *
 * ## `MARINE_ENABLED` gates the UPSTREAM legs, not these two endpoints
 * SPEC-ADDENDUM §7.9 says a disabled feature must 404 rather than 503. That applies to the value
 * endpoints, which land in M4 — and it will be implemented there, where "the feature is absent"
 * is a statement about something that exists. `/points` and `/layers` are a Postgres read and a
 * constant with NO upstream dependency; gating them now would take away the contract Vera's W1 is
 * already building against, for no safety gain. Recorded deviation, flagged to Atlas.
 */
@Module({
  imports: [TypeOrmModule.forFeature([MarinePoint]), UpstreamModule],
  controllers: [MarineController],
  providers: [
    MarineService,
    // Env → marine upstream configuration, resolved ONCE. The M3/M4 provider adapters inject
    // this same object rather than re-reading the environment field by field.
    {
      provide: MARINE_UPSTREAM_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): MarineUpstreamConfig =>
        buildMarineUpstreamConfig(config),
    },
    {
      provide: MarineWarmupService,
      inject: [SchedulerRegistry, UpstreamMetrics, REDIS_CLIENT, MARINE_UPSTREAM_CONFIG],
      useFactory: (
        schedulerRegistry: SchedulerRegistry,
        metrics: UpstreamMetrics,
        redis: RedisClientPort | null,
        marineConfig: MarineUpstreamConfig,
      ): MarineWarmupService =>
        new MarineWarmupService(schedulerRegistry, metrics, redis, {
          enabled: marineConfig.warmupEnabled,
          intervalSeconds: marineConfig.warmupIntervalSeconds,
          deadlineMs: marineConfig.warmupDeadlineMs,
        }),
    },
    // A plain provider, bound with `@UseInterceptors` on the controller. NOT `APP_INTERCEPTOR`:
    // that token registers globally no matter which module declares it, and every route in the
    // API would then inspect its body for a marine-only symbol.
    MarineCacheAgeInterceptor,
  ],
  exports: [MarineWarmupService, MARINE_UPSTREAM_CONFIG],
})
export class MarineModule {}
