import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './database/data-source-options';
import { type Env, validateEnv } from './config/env.schema';
import { CountryModule } from './country/country.module';
import { HealthModule } from './health/health.module';
import { ProvinceModule } from './province/province.module';

/**
 * Baseline rate limit for the public API: a single window of 120 requests per
 * minute per client. In-memory storage is fine for a single instance; a
 * Redis-backed store is layered in when the API scales horizontally (surface to
 * Atlas first). `/health` is exempt (see HealthController @SkipThrottle).
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
  ],
  providers: [
    // Rate limit every route by default; opt out per-route with @SkipThrottle.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
