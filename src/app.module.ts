import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
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
 */
const THROTTLE_TTL_MS = 60_000;
const THROTTLE_LIMIT = 120;

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
    HealthModule,
    ProvinceModule,
    CountryModule,
    MarineModule,
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
