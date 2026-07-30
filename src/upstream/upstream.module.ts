import {
  Inject,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { InProcessSingleFlight, RedisSingleFlight, type SingleFlight } from './cache/single-flight';
import { UpstreamCacheService } from './cache/upstream-cache.service';
import {
  InProcessCacheStore,
  RedisCacheStore,
  type UpstreamCacheStore,
} from './cache/upstream-cache.store';
import { CircuitBreaker } from './circuit-breaker';
import { IoredisAdapter } from './redis/ioredis.adapter';
import { REDIS_CLIENT, type RedisClientPort } from './redis/redis-client.port';
import { ProviderBudget } from './provider-budget';
import { UpstreamHttpClient } from './upstream-http.client';
import { UPSTREAM_USER_AGENT } from './upstream-http.helpers';
import { UpstreamMetrics } from './upstream-metrics';

/**
 * Provider-neutral upstream infrastructure: one HTTP client, one cache, one budget, one breaker.
 *
 * Nothing here knows about the sea. The marine module supplies the semantics (which provider,
 * which TTLs, which keys); the AFAD/MGM/air-quality feeds `ENGINEERING.md` §3.5 anticipates will
 * reuse this module unchanged rather than growing a second implementation of timeouts and
 * retries — which is how two different fail-soft behaviours end up shipping in one API.
 *
 * ## Redis is optional here and NOT optional in production
 * `REDIS_URL` unset selects the in-process LRU: correct on one instance, and stated loudly at
 * boot. Production with `MARINE_ENABLED=true` cannot reach that state — the env schema refuses to
 * boot (owner ruling E1 → DEC 2026-07-29b). The fallback is a development convenience, never a
 * silent production degradation.
 */
@Module({
  providers: [
    UpstreamMetrics,
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): RedisClientPort | null => {
        const url = config.get('REDIS_URL', { infer: true });
        return url === undefined ? null : new IoredisAdapter(url);
      },
    },
    {
      provide: CircuitBreaker,
      inject: [UpstreamMetrics],
      useFactory: (metrics: UpstreamMetrics): CircuitBreaker => new CircuitBreaker(metrics),
    },
    {
      provide: ProviderBudget,
      inject: [UpstreamMetrics, REDIS_CLIENT],
      useFactory: (metrics: UpstreamMetrics, redis: RedisClientPort | null): ProviderBudget =>
        new ProviderBudget(metrics, redis),
    },
    {
      provide: UpstreamHttpClient,
      inject: [UpstreamMetrics, ProviderBudget, CircuitBreaker, ConfigService],
      useFactory: (
        metrics: UpstreamMetrics,
        budget: ProviderBudget,
        breaker: CircuitBreaker,
        config: ConfigService<Env, true>,
      ): UpstreamHttpClient =>
        new UpstreamHttpClient(metrics, budget, breaker, {
          singleCallTimeoutMs: config.getOrThrow('MARINE_SINGLE_CALL_TIMEOUT_MS', { infer: true }),
          userAgent: UPSTREAM_USER_AGENT,
        }),
    },
    {
      provide: UpstreamCacheService,
      inject: [UpstreamMetrics, REDIS_CLIENT],
      useFactory: (
        metrics: UpstreamMetrics,
        redis: RedisClientPort | null,
      ): UpstreamCacheService => {
        const store: UpstreamCacheStore =
          redis === null ? new InProcessCacheStore() : new RedisCacheStore(redis, metrics);
        const singleFlight: SingleFlight =
          redis === null
            ? new InProcessSingleFlight(metrics)
            : new RedisSingleFlight(redis, metrics);
        return new UpstreamCacheService(store, singleFlight, metrics);
      },
    },
  ],
  exports: [
    UpstreamMetrics,
    UpstreamHttpClient,
    UpstreamCacheService,
    CircuitBreaker,
    ProviderBudget,
    REDIS_CLIENT,
  ],
})
export class UpstreamModule implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Upstream');

  constructor(
    private readonly cache: UpstreamCacheService,
    @Inject(REDIS_CLIENT) private readonly redisClient: RedisClientPort | null,
  ) {}

  /**
   * Announce the cache mode at boot — loudly when it is the degraded one.
   *
   * SPEC-ADDENDUM §2.6 requires this: a process that silently chose the single-instance cache is
   * a process whose upstream load multiplies by the instance count without anyone noticing until
   * the provider does.
   */
  onApplicationBootstrap(): void {
    if (this.cache.mode === 'redis') {
      this.logger.log('upstream cache: REDIS — shared across instances, survives deploys');
      return;
    }
    this.logger.warn(
      'upstream cache: IN-PROCESS LRU (REDIS_URL is not set). This mode is SINGLE-INSTANCE only: ' +
        'every deploy starts from an empty cache, N instances mean N× the upstream load, and ' +
        'single-flight cannot coordinate across them. Development-only by design — production ' +
        'with MARINE_ENABLED=true refuses to boot without REDIS_URL (DEC 2026-07-29b).',
    );
  }

  async onModuleDestroy(): Promise<void> {
    // Closing the connection on shutdown keeps tests from leaking an open handle and lets a
    // deployment drain cleanly. The client is optional, so this is a no-op in LRU mode.
    await this.redisClient?.quit().catch(() => undefined);
  }
}
