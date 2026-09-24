import { Module } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ScheduledWarmupService } from '../upstream/scheduled-warmup.service';
import { UpstreamMetrics } from '../upstream/upstream-metrics';
import { UpstreamModule } from '../upstream/upstream.module';
import { RetentionCleanupTarget } from './retention-cleanup.target';
import {
  RETENTION_CLEANUP_DEADLINE_MS,
  RETENTION_CLEANUP_INTERVAL_SECONDS,
} from './retention.constants';

/** Injection token for the cleanup tour (`retention-cleanup`). */
export const RETENTION_CLEANUP_WARMUP = Symbol('RETENTION_CLEANUP_WARMUP');

/**
 * Scheduled deletion of expired auth records (T-101). Reuses `ScheduledWarmupService` — the one
 * scheduler this repo has — exactly as the book purge tour does: its own instance, no Redis lock,
 * always enabled. The periods it enforces are listed in `docs/architecture.md` "Data retention".
 */
@Module({
  imports: [UpstreamModule],
  providers: [
    {
      provide: RETENTION_CLEANUP_WARMUP,
      // No `REDIS_CLIENT`: see `RetentionCleanupTarget` — an idempotent DELETE needs no lock, and
      // a Redis outage must not suspend a deletion obligation (the book purge's SEC111-I2 fix).
      inject: [SchedulerRegistry, UpstreamMetrics],
      useFactory: (
        schedulerRegistry: SchedulerRegistry,
        metrics: UpstreamMetrics,
      ): ScheduledWarmupService =>
        new ScheduledWarmupService(schedulerRegistry, metrics, null, {
          name: 'retention-cleanup',
          enabled: true,
          disabledBy: 'nothing — retention cleanup is unconditional',
          locklessReason: 'OFF — deliberately unlocked: idempotent DELETEs only',
          intervalSeconds: RETENTION_CLEANUP_INTERVAL_SECONDS,
          deadlineMs: RETENTION_CLEANUP_DEADLINE_MS,
        }),
    },
    {
      provide: RetentionCleanupTarget,
      inject: [DataSource, RETENTION_CLEANUP_WARMUP],
      useFactory: (
        dataSource: DataSource,
        warmup: ScheduledWarmupService,
      ): RetentionCleanupTarget => {
        const target = new RetentionCleanupTarget(dataSource);
        warmup.register(target);
        return target;
      },
    },
  ],
  exports: [RetentionCleanupTarget],
})
export class RetentionModule {}
