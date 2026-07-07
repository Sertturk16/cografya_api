import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.schema';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Zod validation at boot — missing/mistyped env aborts startup.
      validate: validateEnv,
    }),
    HealthModule,
  ],
})
export class AppModule {}
