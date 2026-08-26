import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AirQualityModule } from './air-quality/air-quality.module';
import { AuthModule } from './auth/auth.module';
import { BookModule } from './book/book.module';
import { CacheControlInterceptor } from './common/http-cache/cache-control.interceptor';
import { TrustedClientThrottlerGuard } from './common/throttler/trusted-client-throttler.guard';
import { buildDataSourceOptions } from './database/data-source-options';
import { type Env, validateEnv } from './config/env.schema';
import { CountryModule } from './country/country.module';
import { EarthquakeModule } from './earthquake/earthquake.module';
import { ElevationModule } from './elevation/elevation.module';
import { HealthModule } from './health/health.module';
import { MarineModule } from './marine/marine.module';
import { ProvinceModule } from './province/province.module';
import { ReferenceModule } from './reference/reference.module';
import { VideoProgressModule } from './video-progress/video-progress.module';

/**
 * Baseline rate limit for the public API: a window of 120 requests per minute PER CLIENT AND
 * HANDLER — not one app-wide window. `@nestjs/throttler`'s `generateKey` composes the bucket key
 * from the controller class name, the handler name AND the tracked identity (measured,
 * `TrustedClientThrottlerGuard`'s own docblock), so `GET /api/provinces` and
 * `POST /api/auth/logout` are separate counters that merely share one tracked identity. E-1's
 * per-handler isolation note (`test/throttle.e2e-spec.ts`) is the gate this sentence names.
 * In-memory storage is fine for a single instance; a Redis-backed store is layered in when the
 * API scales horizontally (surface to Atlas first). `/health` is exempt (see HealthController
 * @SkipThrottle).
 *
 * The limit deliberately stays at 120 for anonymous callers. The one legitimate
 * high-volume client — the web SSG build, whose full-site fetch burst (81 provinces
 * × 2 locales of pages, plus per-page data calls) exceeds this window during a build —
 * is instead distinguished as a TRUSTED first-party caller and exempted by
 * TrustedClientThrottlerGuard (a shared secret in the `x-internal-request-token`
 * header). Distinguishing the trusted build beats raising the global number, which
 * would weaken every client's protection and be a treadmill as content grows.
 *
 * SEC84-P1 — the TRACKED IDENTITY this window and every `@Throttle` route ceiling share is now
 * resolved by `TrustedClientThrottlerGuard.getTracker` (`src/common/throttler/visitor-tracker.ts`),
 * not by `req.ip` directly. See that guard's docblock for the two-axis resolution; this
 * exemption's own boundary (GET/HEAD-only, `shouldSkip`) is untouched.
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
    BookModule,
    // E2: the AFAD ingest only — no controller, no route. With EARTHQUAKE_ENABLED=false (the
    // default) it constructs no target and schedules no timer.
    EarthquakeModule,
    // CBS-P2 E2: one public read endpoint over the AWS terrain-tile bucket. No entity, no
    // migration, no seed, no scheduled work. With ELEVATION_ENABLED=false (the default) its guard
    // answers 404 and no branch reaches the provider.
    ElevationModule,
    // Üyelik PR-1: the ilçe reference list behind the registration form's "İlçe" select. One
    // public read route, one seeded table, no scheduled work and no provider — it is here because
    // its rows must exist before the auth core's `users.district_id` can point at them.
    ReferenceModule,
    // UYELIK-01/02: identity/profile persistence, the Argon2id provider, and (PR-2) the nine
    // auth endpoints, the opt-in AccessTokenGuard and the four request-handling services.
    AuthModule,
    // UYELIK-05: protected read-one/upsert-one video-progress endpoints. No scheduled work, no
    // external provider, no new env key — a plain guarded CRUD-shaped surface over its own table.
    VideoProgressModule,
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
