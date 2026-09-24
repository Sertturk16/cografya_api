import { describe, expect, it, jest } from '@jest/globals';
import type { DataSource } from 'typeorm';
import { AUTH_RATE_LIMIT_RULES } from '../auth/auth.types';
import { RetentionCleanupTarget } from './retention-cleanup.target';
import { EXPIRED_AUTH_RECORD_GRACE_MS } from './retention.constants';

const NOW_MS = Date.parse('2026-09-24T12:00:00.000Z');

function harness(query: jest.Mock<(sql: string, params: unknown[]) => Promise<unknown>>) {
  const dataSource = { query } as unknown as DataSource;
  return new RetentionCleanupTarget(dataSource, () => NOW_MS);
}

describe('RetentionCleanupTarget', () => {
  it('deletes expired pending registrations and reset tokens after the grace period', async () => {
    const query = jest
      .fn<(sql: string, params: unknown[]) => Promise<unknown>>()
      .mockResolvedValue([[], 0]);

    await harness(query).run();

    const cutoff = new Date(NOW_MS - EXPIRED_AUTH_RECORD_GRACE_MS);
    expect(query).toHaveBeenCalledWith(
      'DELETE FROM "pending_registrations" WHERE "expires_at" < $1',
      [cutoff],
    );
    expect(query).toHaveBeenCalledWith(
      'DELETE FROM "password_reset_tokens" WHERE "expires_at" < $1',
      [cutoff],
    );
  });

  it('deletes each auth rate-limit scope by its own window length', async () => {
    const query = jest
      .fn<(sql: string, params: unknown[]) => Promise<unknown>>()
      .mockResolvedValue([[], 0]);

    await harness(query).run();

    for (const [scope, rule] of Object.entries(AUTH_RATE_LIMIT_RULES)) {
      expect(query).toHaveBeenCalledWith(
        'DELETE FROM "auth_rate_limits" WHERE "scope" = $1 AND "window_start" <= $2',
        [scope, new Date(NOW_MS - rule.windowMs)],
      );
    }
  });

  it('sums the affected counts the driver reports', async () => {
    const query = jest
      .fn<(sql: string, params: unknown[]) => Promise<unknown>>()
      .mockResolvedValue([[], 2]);

    const counts = await harness(query).run();

    expect(counts.pendingRegistrations).toBe(2);
    expect(counts.passwordResetTokens).toBe(2);
    expect(counts.gameRoundSubmitRateLimits).toBe(2);
    expect(counts.authRateLimits).toBe(2 * Object.keys(AUTH_RATE_LIMIT_RULES).length);
  });

  it('keeps going when one statement fails, and never throws', async () => {
    const query = jest
      .fn<(sql: string, params: unknown[]) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue([[], 1]);

    const counts = await harness(query).run();

    expect(counts.pendingRegistrations).toBe(0);
    expect(counts.passwordResetTokens).toBe(1);
    await expect(harness(query).refresh()).resolves.toBeUndefined();
  });
});
