import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { AUTH_RATE_LIMIT_RULES, type AuthRateLimitScope } from '../auth/auth.types';
import { describeErrorWithName } from '../common/describe-error';
import { GAME_ROUND_SUBMIT_RATE_LIMIT } from '../game-rounds/game-round-submit-rate-limit.service';
import type { ScheduledWarmupTarget } from '../upstream/scheduled-warmup.service';
import { EXPIRED_AUTH_RECORD_GRACE_MS } from './retention.constants';

/** Rows deleted per table by one tour — returned for the spec and the log line. */
export interface RetentionCleanupCounts {
  pendingRegistrations: number;
  passwordResetTokens: number;
  authRateLimits: number;
  gameRoundSubmitRateLimits: number;
}

/**
 * Deletes auth records that have outlived their purpose (T-101, KVKK md. 7 imha).
 *
 * | table | deleted when |
 * |---|---|
 * | `pending_registrations` | `expires_at` passed more than {@link EXPIRED_AUTH_RECORD_GRACE_MS} ago |
 * | `password_reset_tokens` | same rule (a consumed token expires 30 min after issue anyway) |
 * | `auth_rate_limits` | its fixed window has ended (per-scope window from `AUTH_RATE_LIMIT_RULES`) |
 * | `game_round_submit_rate_limits` | its one-hour window has ended |
 *
 * The two rate limiters already prune a subject's stale windows when THAT subject comes back;
 * this tour is what removes the windows of subjects who never come back.
 *
 * Like the book purge it is an obligation, not a feature: no flag gates it and it takes no Redis
 * lock (every statement is an idempotent DELETE, so two instances running it at once is harmless,
 * while a Redis fault must not suspend it). Never throws: one failed statement is logged at ERROR
 * and the next statement still runs.
 */
export class RetentionCleanupTarget implements ScheduledWarmupTarget {
  readonly label = 'retention.cleanup';

  private readonly logger = new Logger('RetentionCleanup');

  constructor(
    private readonly dataSource: DataSource,
    private readonly now: () => number = Date.now,
  ) {}

  async refresh(): Promise<void> {
    await this.run();
  }

  /** One pass over every table. Exposed for the e2e, which drives it without a timer. */
  async run(): Promise<RetentionCleanupCounts> {
    const nowMs = this.now();
    const expiredBefore = new Date(nowMs - EXPIRED_AUTH_RECORD_GRACE_MS);

    const counts: RetentionCleanupCounts = {
      pendingRegistrations: await this.deleteRows(
        'pending_registrations',
        `DELETE FROM "pending_registrations" WHERE "expires_at" < $1`,
        [expiredBefore],
      ),
      passwordResetTokens: await this.deleteRows(
        'password_reset_tokens',
        `DELETE FROM "password_reset_tokens" WHERE "expires_at" < $1`,
        [expiredBefore],
      ),
      authRateLimits: 0,
      gameRoundSubmitRateLimits: await this.deleteRows(
        'game_round_submit_rate_limits',
        `DELETE FROM "game_round_submit_rate_limits" WHERE "window_start" <= $1`,
        [new Date(nowMs - GAME_ROUND_SUBMIT_RATE_LIMIT.windowMs)],
      ),
    };

    // One statement per scope, because each scope has its own window length: a window is over
    // once `window_start + windowMs <= now`, i.e. `window_start <= now - windowMs`.
    for (const [scope, rule] of Object.entries(AUTH_RATE_LIMIT_RULES) as [
      AuthRateLimitScope,
      { windowMs: number },
    ][]) {
      counts.authRateLimits += await this.deleteRows(
        'auth_rate_limits',
        `DELETE FROM "auth_rate_limits" WHERE "scope" = $1 AND "window_start" <= $2`,
        [scope, new Date(nowMs - rule.windowMs)],
      );
    }

    const total =
      counts.pendingRegistrations +
      counts.passwordResetTokens +
      counts.authRateLimits +
      counts.gameRoundSubmitRateLimits;
    if (total === 0) {
      this.logger.debug('cleanup tour: nothing to delete');
    } else {
      this.logger.log(
        `cleanup tour: deleted pending_registrations=${String(counts.pendingRegistrations)} ` +
          `password_reset_tokens=${String(counts.passwordResetTokens)} ` +
          `auth_rate_limits=${String(counts.authRateLimits)} ` +
          `game_round_submit_rate_limits=${String(counts.gameRoundSubmitRateLimits)}`,
      );
    }
    return counts;
  }

  private async deleteRows(table: string, sql: string, params: unknown[]): Promise<number> {
    try {
      // `DataSource.query` on a DELETE resolves to `[rows, affectedCount]` with the pg driver.
      const result: unknown = await this.dataSource.query(sql, params);
      const affected = Array.isArray(result) ? (result[1] as unknown) : undefined;
      return typeof affected === 'number' ? affected : 0;
    } catch (error: unknown) {
      this.logger.error(`cleanup of ${table} failed — ${describeErrorWithName(error)}`);
      return 0;
    }
  }
}
