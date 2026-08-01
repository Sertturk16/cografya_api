import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AirQualityModule } from './air-quality/air-quality.module';
import { CacheControlInterceptor } from './common/http-cache/cache-control.interceptor';
import { TrustedClientThrottlerGuard } from './common/throttler/trusted-client-throttler.guard';
import { buildDataSourceOptions } from './database/data-source-options';
import { type Env, validateEnv } from './config/env.schema';
import { CountryModule } from './country/country.module';
import { HealthModule } from './health/health.module';
import { MarineModule } from './marine/marine.module';
import { ProvinceModule } from './province/province.module';

/**
 * Baseline rate limit for the public API: a single window of 120 requests per
 * minute per client. In-memory storage is fine for a single instance; a
 * Redis-backed store is layered in when the API scales horizontally (surface to
 * Atlas first). `/health` is exempt (see HealthController @SkipThrottle).
 *
 * The limit deliberately stays at 120 for anonymous callers. The one legitimate
 * high-volume client — the web SSG build, whose full-site fetch burst (81 provinces
 * × 2 locales of pages, plus per-page data calls) exceeds this window during a build —
 * is instead distinguished as a TRUSTED first-party caller and exempted by
 * TrustedClientThrottlerGuard (a shared secret in the `x-internal-request-token`
 * header). Distinguishing the trusted build beats raising the global number, which
 * would weaken every client's protection and be a treadmill as content grows.
 *
 * EXPORTED so `test/throttle.e2e-spec.ts` can pin the BEHAVIOUR without restating the
 * numbers: a test that hardcoded `120` would silently stop testing the real window the
 * day someone tuned it, and re-typing a fact into an assertion is exactly what
 * `CONVENTIONS.md` §2's structural-test rule forbids. Nothing in `src/` reads them from
 * outside this module.
 */
export const THROTTLE_TTL_MS = 60_000;
export const THROTTLE_LIMIT = 120;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Zod validation at boot — missing/mistyped env aborts startup.
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildDataSourceOptions(config.getOrThrow('DATABASE_URL')),
    }),
    ThrottlerModule.forRoot([{ ttl: THROTTLE_TTL_MS, limit: THROTTLE_LIMIT }]),
    // In-process scheduling for the marine warmup tour (SPEC-ADDENDUM §3). This is NOT the
    // "second entry point" `ENGINEERING.md` §1 rules out: no queue, no worker, no separate
    // deployable — one provider inside this process, which is the exception §1 already allows.
    // With `MARINE_ENABLED=false` (the default) nothing is scheduled at all.
    ScheduleModule.forRoot(),
    HealthModule,
    ProvinceModule,
    CountryModule,
    MarineModule,
    AirQualityModule,
  ],
  providers: [
    // Rate limit every route by default; opt out per-route with @SkipThrottle,
    // or per-request with the trusted-client token (TrustedClientThrottlerGuard).
    { provide: APP_GUARD, useClass: TrustedClientThrottlerGuard },
    // Apply @CacheControl(...) headers on success only (never on 5xx). Routes without
    // the metadata pass through untouched.
    { provide: APP_INTERCEPTOR, useClass: CacheControlInterceptor },
  ],
})
export class AppModule {}
