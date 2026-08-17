import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
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
import { EarthquakeEvent } from './entities/earthquake-event.entity';
import { EarthquakeIngestRun } from './entities/earthquake-ingest-run.entity';
import { EarthquakeIngestJobKind } from './earthquake.types';
import {
  buildEarthquakeUpstreamConfig,
  EARTHQUAKE_UPSTREAM_CONFIG,
  type EarthquakeUpstreamConfig,
} from './earthquake-upstream.config';
import {
  EarthquakeIngestStore,
  EARTHQUAKE_INGEST_STORE,
  type EarthquakeIngestStorePort,
} from './earthquake-ingest.store';
import { EarthquakeIngestTarget } from './earthquake-ingest.target';

/**
 * Injection token for the AFAD-tuned HTTP client instance.
 *
 * A SECOND INSTANCE of the shared class, never a second implementation: this leg's single-call cap
 * is its own, while the budget, breaker and metrics objects are the SAME instances every other leg
 * uses — so AFAD's budget and breaker state stay global to the process.
 */
export const AFAD_UPSTREAM_CLIENT = Symbol('AFAD_UPSTREAM_CLIENT');

/**
 * Injection tokens for the leg's TWO warmup tours.
 *
 * Two instances rather than one with two targets, because `ScheduledWarmupService` carries exactly
 * one interval per instance and the two cadences differ by a factor of 72 (300 s vs 21 600 s).
 * Each therefore gets its own lock key, its own timer names, its own logger context and its own
 * kill switch — the `books-youtube-refresh` / `books-youtube-purge` precedent, for the same reason.
 */
export const EARTHQUAKE_RECENT_WARMUP = Symbol('EARTHQUAKE_RECENT_WARMUP');
export const EARTHQUAKE_RECONCILE_WARMUP = Symbol('EARTHQUAKE_RECONCILE_WARMUP');

/** Injection tokens for the two ingest targets, so a test can reach either one by name. */
export const EARTHQUAKE_RECENT_TARGET = Symbol('EARTHQUAKE_RECENT_TARGET');
export const EARTHQUAKE_RECONCILE_TARGET = Symbol('EARTHQUAKE_RECONCILE_TARGET');

/**
 * The earthquake leg (E2 — ingest only).
 *
 * ## No controller, and that is the whole scope
 * E2 fills the store; E3 opens the endpoints (SPEC §16). The order is deliberate: when the public
 * routes arrive the store is already warm, so the first real request never lands on a cold path.
 *
 * ## `EARTHQUAKE_ENABLED` gates the UPSTREAM half only
 * With the default (`false`) a fresh deployment schedules nothing at all — not "registers no
 * targets while a timer keeps waking the process". The target is not even constructed, so there is
 * no path on which a registered target could still reach AFAD.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([EarthquakeEvent, EarthquakeIngestRun, Province]),
    UpstreamModule,
  ],
  providers: [
    {
      provide: EARTHQUAKE_UPSTREAM_CONFIG,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): EarthquakeUpstreamConfig =>
        buildEarthquakeUpstreamConfig(config),
    },
    {
      provide: EARTHQUAKE_INGEST_STORE,
      inject: [DataSource],
      useFactory: (dataSource: DataSource): EarthquakeIngestStorePort =>
        new EarthquakeIngestStore(dataSource),
    },
    {
      provide: AFAD_UPSTREAM_CLIENT,
      inject: [UpstreamMetrics, ProviderBudget, CircuitBreaker, EARTHQUAKE_UPSTREAM_CONFIG],
      useFactory: (
        metrics: UpstreamMetrics,
        budget: ProviderBudget,
        breaker: CircuitBreaker,
        config: EarthquakeUpstreamConfig,
      ): UpstreamHttpClient =>
        new UpstreamHttpClient(metrics, budget, breaker, {
          singleCallTimeoutMs: config.singleCallTimeoutMs,
          userAgent: UPSTREAM_USER_AGENT,
        }),
    },
    {
      provide: EARTHQUAKE_RECENT_WARMUP,
      inject: [SchedulerRegistry, UpstreamMetrics, REDIS_CLIENT, EARTHQUAKE_UPSTREAM_CONFIG],
      useFactory: (
        schedulerRegistry: SchedulerRegistry,
        metrics: UpstreamMetrics,
        redis: RedisClientPort | null,
        config: EarthquakeUpstreamConfig,
      ): ScheduledWarmupService =>
        new ScheduledWarmupService(schedulerRegistry, metrics, redis, {
          name: 'earthquake-recent',
          enabled: config.ingestEnabled,
          disabledBy: 'EARTHQUAKE_ENABLED / EARTHQUAKE_INGEST_ENABLED',
          intervalSeconds: config.recentIntervalSeconds,
          deadlineMs: config.tourDeadlineMs,
        }),
    },
    {
      provide: EARTHQUAKE_RECONCILE_WARMUP,
      inject: [SchedulerRegistry, UpstreamMetrics, REDIS_CLIENT, EARTHQUAKE_UPSTREAM_CONFIG],
      useFactory: (
        schedulerRegistry: SchedulerRegistry,
        metrics: UpstreamMetrics,
        redis: RedisClientPort | null,
        config: EarthquakeUpstreamConfig,
      ): ScheduledWarmupService =>
        new ScheduledWarmupService(schedulerRegistry, metrics, redis, {
          name: 'earthquake-reconcile',
          enabled: config.ingestEnabled,
          disabledBy: 'EARTHQUAKE_ENABLED / EARTHQUAKE_INGEST_ENABLED',
          intervalSeconds: config.reconcileIntervalSeconds,
          deadlineMs: config.tourDeadlineMs,
        }),
    },
    {
      provide: EARTHQUAKE_RECENT_TARGET,
      inject: [
        AFAD_UPSTREAM_CLIENT,
        EARTHQUAKE_INGEST_STORE,
        EARTHQUAKE_UPSTREAM_CONFIG,
        UpstreamMetrics,
        EARTHQUAKE_RECENT_WARMUP,
      ],
      useFactory: (
        client: UpstreamHttpClient,
        store: EarthquakeIngestStorePort,
        config: EarthquakeUpstreamConfig,
        metrics: UpstreamMetrics,
        warmup: ScheduledWarmupService,
      ): EarthquakeIngestTarget | null =>
        registerTarget(EarthquakeIngestJobKind.Recent, {
          client,
          store,
          config,
          metrics,
          warmup,
        }),
    },
    {
      provide: EARTHQUAKE_RECONCILE_TARGET,
      inject: [
        AFAD_UPSTREAM_CLIENT,
        EARTHQUAKE_INGEST_STORE,
        EARTHQUAKE_UPSTREAM_CONFIG,
        UpstreamMetrics,
        EARTHQUAKE_RECONCILE_WARMUP,
      ],
      useFactory: (
        client: UpstreamHttpClient,
        store: EarthquakeIngestStorePort,
        config: EarthquakeUpstreamConfig,
        metrics: UpstreamMetrics,
        warmup: ScheduledWarmupService,
      ): EarthquakeIngestTarget | null =>
        registerTarget(EarthquakeIngestJobKind.Reconcile, {
          client,
          store,
          config,
          metrics,
          warmup,
        }),
    },
  ],
  exports: [
    EARTHQUAKE_UPSTREAM_CONFIG,
    EARTHQUAKE_INGEST_STORE,
    EARTHQUAKE_RECENT_WARMUP,
    EARTHQUAKE_RECONCILE_WARMUP,
  ],
})
export class EarthquakeModule {}

/**
 * Build a target and register it on its own tour — or build nothing at all when the leg is off.
 *
 * The `null` return is the kill switch's structural half: with the switch off no target exists AND
 * no timer is scheduled, so "disabled" cannot degrade into "runs but writes nothing".
 */
function registerTarget(
  jobKind: EarthquakeIngestJobKind,
  deps: {
    client: UpstreamHttpClient;
    store: EarthquakeIngestStorePort;
    config: EarthquakeUpstreamConfig;
    metrics: UpstreamMetrics;
    warmup: ScheduledWarmupService;
  },
): EarthquakeIngestTarget | null {
  if (!deps.config.ingestEnabled) return null;
  const target = new EarthquakeIngestTarget({
    client: deps.client,
    store: deps.store,
    config: deps.config,
    metrics: deps.metrics,
    jobKind,
  });
  deps.warmup.register(target);
  return target;
}
