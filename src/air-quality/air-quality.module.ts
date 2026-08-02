import { createHash } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, type Repository } from 'typeorm';
import type { Env } from '../config/env.schema';
import { Province } from '../province/entities/province.entity';
import { CircuitBreaker } from '../upstream/circuit-breaker';
import { ProviderBudget } from '../upstream/provider-budget';
import { REDIS_CLIENT, type RedisClientPort } from '../upstream/redis/redis-client.port';
import { ScheduledWarmupService } from '../upstream/scheduled-warmup.service';
import { UpstreamHttpClient } from '../upstream/upstream-http.client';
import { UPSTREAM_USER_AGENT } from '../upstream/upstream-http.helpers';
import { UpstreamMetrics } from '../upstream/upstream-metrics';
import { UpstreamModule } from '../upstream/upstream.module';
import { AirQualityController } from './air-quality.controller';
import {
  AIR_QUALITY_UPSTREAM_CONFIG,
  buildAirQualityUpstreamConfig,
  type AirQualityUpstreamConfig,
} from './air-quality-upstream.config';
import {
  AirQualityIngestStore,
  AIR_QUALITY_INGEST_STORE,
  type AirQualityIngestStorePort,
} from './cams/air-quality-ingest.store';
import { AirQualityIngestTarget } from './cams/air-quality-ingest.target';
import { AirQualityProvinceSeries } from './entities/air-quality-province-series.entity';
import { AirQualityRun } from './entities/air-quality-run.entity';

/**
 * Injection token for the ADS-tuned HTTP client instance.
 *
 * A SECOND INSTANCE of the shared class, not a second implementation: a 25 MiB result download
 * cannot live under marine's 3 s single-call cap, and the budget/breaker/metrics objects are the
 * SAME instances the other legs use, so ADS budget and breaker state stay global to the process
 * no matter which client touched them.
 */
export const ADS_UPSTREAM_CLIENT = Symbol('ADS_UPSTREAM_CLIENT');

/**
 * Injection token for the AIR-QUALITY warmup tour.
 *
 * A symbol rather than the class, because `ScheduledWarmupService` is provider-neutral and this
 * is its SECOND instance: a class token would be ambiguous, and the failure mode of injecting
 * the wrong instance is silent (a target registered on somebody else's tour).
 */
export const AIR_QUALITY_WARMUP = Symbol('AIR_QUALITY_WARMUP');

/**
 * Air-quality module.
 *
 * A1 shipped the frozen contract and the static index-system endpoint. A2a — here — adds the
 * persistent store, the two-job ADS state machine and the leg's own warmup instance. The read
 * path and the two province endpoints land in A2b; until then this PR's user-visible surface is
 * deliberately EMPTY (`openapi.json` diff: zero lines).
 *
 * ## `AIR_QUALITY_ENABLED` gates the UPSTREAM half only
 * The public endpoints stay registered and degrade honestly from Postgres. The tour runs only
 * while BOTH `AIR_QUALITY_ENABLED` and `AIR_QUALITY_INGEST_ENABLED` are true, and with the
 * default (`false`) a fresh deployment schedules nothing at all — not "registers no targets
 * while a timer keeps waking the process".
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Province, AirQualityRun, AirQualityProvinceSeries]),
    UpstreamModule,
  ],
  controllers: [AirQualityController],
  providers: [
    {
      provide: AIR_QUALITY_UPSTREAM_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): AirQualityUpstreamConfig =>
        buildAirQualityUpstreamConfig(config),
    },
    {
      provide: AIR_QUALITY_INGEST_STORE,
      inject: [DataSource],
      useFactory: (dataSource: DataSource): AirQualityIngestStorePort =>
        new AirQualityIngestStore(dataSource),
    },
    {
      provide: ADS_UPSTREAM_CLIENT,
      inject: [UpstreamMetrics, ProviderBudget, CircuitBreaker, AIR_QUALITY_UPSTREAM_CONFIG],
      useFactory: (
        metrics: UpstreamMetrics,
        budget: ProviderBudget,
        breaker: CircuitBreaker,
        config: AirQualityUpstreamConfig,
      ): UpstreamHttpClient =>
        new UpstreamHttpClient(metrics, budget, breaker, {
          // The DOWNLOAD is the long call (12.6 s measured for 25 MiB); the JSON calls finish in
          // well under a second. One cap covers both because the operation deadline, not this
          // number, is what actually bounds a tour.
          singleCallTimeoutMs: config.ads.downloadTimeoutMs,
          userAgent: UPSTREAM_USER_AGENT,
        }),
    },
    {
      provide: AIR_QUALITY_WARMUP,
      inject: [SchedulerRegistry, UpstreamMetrics, REDIS_CLIENT, AIR_QUALITY_UPSTREAM_CONFIG],
      useFactory: (
        schedulerRegistry: SchedulerRegistry,
        metrics: UpstreamMetrics,
        redis: RedisClientPort | null,
        config: AirQualityUpstreamConfig,
      ): ScheduledWarmupService =>
        // `name: 'air-quality'` derives this leg's own lock key, both timer names, the logger
        // context and the `redis.degraded` label — nothing is shared with marine's tour.
        new ScheduledWarmupService(schedulerRegistry, metrics, redis, {
          name: 'air-quality',
          enabled: config.ingestEnabled,
          disabledBy: 'AIR_QUALITY_ENABLED / AIR_QUALITY_INGEST_ENABLED',
          intervalSeconds: config.ingestIntervalSeconds,
          deadlineMs: config.ingestDeadlineMs,
        }),
    },
    // The ingest target: built and REGISTERED here, gated on the leg's own kill switch. With
    // the switch off the target never exists AND the tour schedules nothing, so there is no
    // path on which a registered target could still reach the provider.
    {
      provide: AirQualityIngestTarget,
      inject: [
        ADS_UPSTREAM_CLIENT,
        AIR_QUALITY_INGEST_STORE,
        AIR_QUALITY_UPSTREAM_CONFIG,
        UpstreamMetrics,
        AIR_QUALITY_WARMUP,
        getRepositoryToken(Province),
      ],
      useFactory: (
        client: UpstreamHttpClient,
        store: AirQualityIngestStorePort,
        config: AirQualityUpstreamConfig,
        metrics: UpstreamMetrics,
        warmup: ScheduledWarmupService,
        provinceRepository: Repository<Province>,
      ): AirQualityIngestTarget | null => {
        if (!config.ingestEnabled) return null;
        const target = new AirQualityIngestTarget({
          client,
          store,
          config,
          loadProvinces: () => provinceRepository.find({ order: { plateCode: 'ASC' } }),
          metrics,
          // Injected so the state machine never imports node:crypto and stays unit-testable
          // without one.
          md5: (bytes: Uint8Array) => createHash('md5').update(bytes).digest('hex'),
        });
        warmup.register(target);
        return target;
      },
    },
  ],
  exports: [AIR_QUALITY_WARMUP, AIR_QUALITY_UPSTREAM_CONFIG, AIR_QUALITY_INGEST_STORE],
})
export class AirQualityModule {}
