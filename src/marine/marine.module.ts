import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, type Repository } from 'typeorm';
import type { Env } from '../config/env.schema';
import { REDIS_CLIENT, type RedisClientPort } from '../upstream/redis/redis-client.port';
import { UpstreamCacheService } from '../upstream/cache/upstream-cache.service';
import { CircuitBreaker } from '../upstream/circuit-breaker';
import { ProviderBudget } from '../upstream/provider-budget';
import { ScheduledWarmupService } from '../upstream/scheduled-warmup.service';
import { UpstreamHttpClient } from '../upstream/upstream-http.client';
import { UPSTREAM_USER_AGENT } from '../upstream/upstream-http.helpers';
import { UpstreamMetrics } from '../upstream/upstream-metrics';
import { UpstreamModule } from '../upstream/upstream.module';
import { CmemsClient } from './cmems/cmems-client';
import { CmemsStacResolutionCache } from './cmems/cmems-stac.cache';
import { CmemsValueReader } from './cmems/cmems-value.reader';
import { CmemsWarmupTarget } from './cmems/cmems-warmup.target';
import { EcmwfIngestStore, ECMWF_INGEST_STORE } from './ecmwf/ecmwf-ingest.store';
import type { EcmwfIngestStorePort } from './ecmwf/ecmwf-ingest.store';
import { EcmwfIngestTarget } from './ecmwf/ecmwf-ingest.target';
import { EcmwfSeriesReader } from './ecmwf/ecmwf-series.reader';
import { IsolatedGribDecoder } from './ecmwf/grib/isolated-grib-decoder';
import { MarineEcmwfCycle } from './entities/marine-ecmwf-cycle.entity';
import { MarineEcmwfPointSeries } from './entities/marine-ecmwf-point-series.entity';
import { MarinePoint } from './entities/marine-point.entity';
import { MarineCacheAgeInterceptor } from './marine-cache-age.interceptor';
import { MarineEnabledGuard } from './marine-enabled.guard';
import {
  buildMarineUpstreamConfig,
  MARINE_UPSTREAM_CONFIG,
  type MarineUpstreamConfig,
} from './marine-upstream.config';
import { MarineController } from './marine.controller';
import { MarineService } from './marine.service';
import { MarineValuesService } from './marine-values.service';

/**
 * Injection token for the ECMWF-tuned HTTP client instance.
 *
 * A SECOND INSTANCE of the shared class, not a second implementation (SPEC §6's audit): the
 * class already takes options, and a 1.8 MB Range download cannot live under the 3 s
 * single-call cap the CMEMS point queries want. Budget, breaker and metrics objects are the
 * SAME instances as the shared client's, so the ECMWF budget/breaker state is global to the
 * process no matter which client touched it.
 */
export const ECMWF_UPSTREAM_CLIENT = Symbol('ECMWF_UPSTREAM_CLIENT');

/**
 * Injection token for the MARINE warmup tour.
 *
 * A symbol rather than the class itself, because `ScheduledWarmupService` is provider-neutral and
 * a second leg will construct a SECOND instance of it: a class token would then be ambiguous, and
 * the failure mode of injecting the wrong instance is silent (a target registered on a tour that
 * belongs to someone else). The token names the leg; the class names the mechanism.
 */
export const MARINE_WARMUP = Symbol('MARINE_WARMUP');

/**
 * Marine module.
 *
 * M1 shipped the reference-point read and the static layer catalogue. M2 added the upstream
 * infrastructure (cache/budget/breaker/warmup). M3a added the offline ECMWF core. M3b — here —
 * wires the scheduled ingest (an `EcmwfIngestTarget` registered on the M2 warmup seam), the
 * Postgres store behind it, and the read path (`EcmwfSeriesReader`) M4's endpoints will consume.
 *
 * ## `MARINE_ENABLED` gates the UPSTREAM legs, not the two public endpoints
 * `/points` and `/layers` remain ungated: a Postgres read and a constant (plus, since M3b, a
 * second Postgres read for the ECMWF catalogue fields) — no upstream dependency on any branch.
 * The ingest runs only while BOTH `MARINE_ENABLED` and `MARINE_WARMUP_ENABLED` are true (the
 * tour's own gate) AND `ECMWF_ENABLED` is true (the leg's registration gate below).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MarinePoint, MarineEcmwfCycle, MarineEcmwfPointSeries]),
    UpstreamModule,
  ],
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
      provide: ECMWF_INGEST_STORE,
      inject: [DataSource],
      useFactory: (dataSource: DataSource): EcmwfIngestStorePort =>
        new EcmwfIngestStore(dataSource),
    },
    {
      provide: ECMWF_UPSTREAM_CLIENT,
      inject: [UpstreamMetrics, ProviderBudget, CircuitBreaker, MARINE_UPSTREAM_CONFIG],
      useFactory: (
        metrics: UpstreamMetrics,
        budget: ProviderBudget,
        breaker: CircuitBreaker,
        marineConfig: MarineUpstreamConfig,
      ): UpstreamHttpClient =>
        new UpstreamHttpClient(metrics, budget, breaker, {
          singleCallTimeoutMs: marineConfig.ecmwf.singleCallTimeoutMs,
          userAgent: UPSTREAM_USER_AGENT,
        }),
    },
    {
      provide: EcmwfSeriesReader,
      inject: [UpstreamCacheService, ECMWF_INGEST_STORE, MARINE_UPSTREAM_CONFIG, UpstreamMetrics],
      useFactory: (
        cache: UpstreamCacheService,
        store: EcmwfIngestStorePort,
        marineConfig: MarineUpstreamConfig,
        metrics: UpstreamMetrics,
      ): EcmwfSeriesReader => new EcmwfSeriesReader(cache, store, marineConfig, metrics),
    },
    {
      provide: MARINE_WARMUP,
      inject: [SchedulerRegistry, UpstreamMetrics, REDIS_CLIENT, MARINE_UPSTREAM_CONFIG],
      useFactory: (
        schedulerRegistry: SchedulerRegistry,
        metrics: UpstreamMetrics,
        redis: RedisClientPort | null,
        marineConfig: MarineUpstreamConfig,
      ): ScheduledWarmupService =>
        // `name: 'marine'` reproduces the lock key, both timer names and the counter label this
        // leg has used since M2 — the move is mechanical, and a unit test pins those strings.
        new ScheduledWarmupService(schedulerRegistry, metrics, redis, {
          name: 'marine',
          enabled: marineConfig.warmupEnabled,
          // CR-1: the env names in the `disabled` log line used to be hardcoded in the shared
          // service. Marine's pair, verbatim — the line is unchanged, and a test pins it.
          disabledBy: 'MARINE_ENABLED / MARINE_WARMUP_ENABLED',
          intervalSeconds: marineConfig.warmupIntervalSeconds,
          deadlineMs: marineConfig.warmupDeadlineMs,
        }),
    },
    // The ingest target: built and REGISTERED here, gated on the leg's own kill switch. The
    // registration is what makes the tour do ECMWF work; with `ECMWF_ENABLED=false` the target
    // never exists and the tour ignores this leg entirely. `MARINE_ENABLED=false` stops the
    // tour itself (warmupEnabled above), so a registered target alone never reaches a provider.
    {
      provide: EcmwfIngestTarget,
      inject: [
        ECMWF_UPSTREAM_CLIENT,
        ECMWF_INGEST_STORE,
        MARINE_UPSTREAM_CONFIG,
        UpstreamMetrics,
        MARINE_WARMUP,
        getRepositoryToken(MarinePoint),
      ],
      useFactory: (
        client: UpstreamHttpClient,
        store: EcmwfIngestStorePort,
        marineConfig: MarineUpstreamConfig,
        metrics: UpstreamMetrics,
        warmup: ScheduledWarmupService,
        marinePointRepository: Repository<MarinePoint>,
      ): EcmwfIngestTarget | null => {
        if (!marineConfig.ecmwf.enabled) return null;
        const target = new EcmwfIngestTarget({
          client,
          store,
          // The REAL fork-based decoder — the only place it is constructed. Its child entry
          // resolves next to the compiled adapter under dist/ (see its lazy-check docblock).
          decoder: new IsolatedGribDecoder(),
          config: marineConfig,
          loadPoints: () => marinePointRepository.find({ order: { displayOrder: 'ASC' } }),
          metrics,
        });
        warmup.register(target);
        return target;
      },
    },
    // ── The CMEMS leg (M4b) ─────────────────────────────────────────────────────
    // Storage for the STAC dataset-id resolutions — written by the warmup tour, read by the
    // value-refresh path and `/layers`. Marine-local by policy (see its module docblock).
    {
      provide: CmemsStacResolutionCache,
      inject: [REDIS_CLIENT, UpstreamMetrics],
      useFactory: (redis: RedisClientPort | null, metrics: UpstreamMetrics) =>
        new CmemsStacResolutionCache(redis, metrics),
    },
    // The SHARED HTTP client (guard order lives there once); the CMEMS-specific 6 s per-call
    // cap rides the per-request `singleCallTimeoutMs` override (review #80 I8 seam) instead of
    // a second client instance — the ECMWF second instance predates that seam.
    {
      provide: CmemsClient,
      inject: [UpstreamHttpClient, MARINE_UPSTREAM_CONFIG],
      useFactory: (http: UpstreamHttpClient, marineConfig: MarineUpstreamConfig) =>
        new CmemsClient(http, {
          wmtsBaseUrl: marineConfig.cmems.wmtsBaseUrl,
          stacBaseUrl: marineConfig.cmems.stacBaseUrl,
          limits: marineConfig.budgets.cmems,
          singleCallTimeoutMs: marineConfig.cmems.singleCallTimeoutMs,
        }),
    },
    {
      provide: CmemsValueReader,
      inject: [
        UpstreamCacheService,
        CmemsClient,
        CmemsStacResolutionCache,
        MARINE_UPSTREAM_CONFIG,
        UpstreamMetrics,
      ],
      useFactory: (
        cache: UpstreamCacheService,
        client: CmemsClient,
        stacCache: CmemsStacResolutionCache,
        marineConfig: MarineUpstreamConfig,
        metrics: UpstreamMetrics,
      ) => new CmemsValueReader(cache, client, stacCache, marineConfig, metrics),
    },
    // The SECOND target on the marine tour. `EcmwfIngestTarget` is injected for ORDER, not
    // use: Nest instantiates dependencies first, so the ECMWF target registers before this one
    // and the tour visits ECMWF → CMEMS (plan §4.3: the series/fallback feed runs first).
    // There is deliberately no CMEMS kill switch (ADDENDUM §7.6 YAGNI ruling): the breaker +
    // `MARINE_ENABLED`/`MARINE_WARMUP_ENABLED` govern it, so the target always registers and
    // the tour's own gates decide whether it ever runs.
    {
      provide: CmemsWarmupTarget,
      inject: [
        CmemsValueReader,
        CmemsStacResolutionCache,
        UpstreamCacheService,
        MARINE_UPSTREAM_CONFIG,
        UpstreamMetrics,
        MARINE_WARMUP,
        EcmwfIngestTarget,
        getRepositoryToken(MarinePoint),
      ],
      useFactory: (
        reader: CmemsValueReader,
        stacCache: CmemsStacResolutionCache,
        cache: UpstreamCacheService,
        marineConfig: MarineUpstreamConfig,
        metrics: UpstreamMetrics,
        warmup: ScheduledWarmupService,
        _ecmwfTarget: EcmwfIngestTarget | null,
        marinePointRepository: Repository<MarinePoint>,
      ): CmemsWarmupTarget => {
        const target = new CmemsWarmupTarget({
          reader,
          stacCache,
          cache,
          config: marineConfig,
          metrics,
          loadPoints: () => marinePointRepository.find({ order: { displayOrder: 'ASC' } }),
        });
        warmup.register(target);
        return target;
      },
    },
    MarineValuesService,
    MarineEnabledGuard,
    // A plain provider, bound with `@UseInterceptors` on the controller. NOT `APP_INTERCEPTOR`:
    // that token registers globally no matter which module declares it, and every route in the
    // API would then inspect its body for a marine-only symbol.
    MarineCacheAgeInterceptor,
  ],
  exports: [MARINE_WARMUP, MARINE_UPSTREAM_CONFIG, EcmwfSeriesReader, ECMWF_INGEST_STORE],
})
export class MarineModule {}
