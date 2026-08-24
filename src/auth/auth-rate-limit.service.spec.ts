import type { DataSource } from 'typeorm';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthRateLimitScope, AUTH_RATE_LIMIT_RULES } from './auth.types';
import type { AuthSecretsProvider } from './auth-secrets.provider';

function stubSecrets(): AuthSecretsProvider {
  return { getHmacPepper: () => 'test-pepper' } as unknown as AuthSecretsProvider;
}

/** A `DataSource` stand-in: DELETE returns nothing meaningful, INSERT returns `attempt_count`. */
function stubDataSource(attemptCount: number): {
  dataSource: DataSource;
  queryMock: jest.Mock;
} {
  const queryMock = jest
    .fn<() => Promise<unknown[]>>()
    // 1st call: the DELETE (cleanup) — no rows returned.
    .mockResolvedValueOnce([])
    // 2nd call: the INSERT … ON CONFLICT … RETURNING.
    .mockResolvedValueOnce([{ attempt_count: attemptCount }]);
  return { dataSource: { query: queryMock } as unknown as DataSource, queryMock };
}

describe('AuthRateLimitService.consume', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows a request at or below the scope cap', async () => {
    const rule = AUTH_RATE_LIMIT_RULES[AuthRateLimitScope.LoginEmail];
    const { dataSource } = stubDataSource(rule.limit);
    const service = new AuthRateLimitService(dataSource, stubSecrets());

    const outcome = await service.consume(AuthRateLimitScope.LoginEmail, 'reader@example.test');

    expect(outcome.allowed).toBe(true);
    expect(outcome.retryAfterSeconds).toBe(0);
  });

  it('refuses a request one over the scope cap', async () => {
    const rule = AUTH_RATE_LIMIT_RULES[AuthRateLimitScope.LoginEmail];
    const { dataSource } = stubDataSource(rule.limit + 1);
    const service = new AuthRateLimitService(dataSource, stubSecrets());

    const outcome = await service.consume(AuthRateLimitScope.LoginEmail, 'reader@example.test');

    expect(outcome.allowed).toBe(false);
    expect(outcome.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('computes windowStart as floor(now / windowMs) * windowMs, in both SQL calls', async () => {
    const rule = AUTH_RATE_LIMIT_RULES[AuthRateLimitScope.VerifyResendCooldown]; // 60s window
    const fixedNowMs = new Date('2026-08-24T10:00:37.000Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(fixedNowMs);
    const expectedWindowStartMs = Math.floor(fixedNowMs / rule.windowMs) * rule.windowMs;

    const { dataSource, queryMock } = stubDataSource(1);
    const service = new AuthRateLimitService(dataSource, stubSecrets());

    await service.consume(AuthRateLimitScope.VerifyResendCooldown, 'reader@example.test');

    expect(queryMock).toHaveBeenCalledTimes(2);
    const deleteParams = queryMock.mock.calls[0]?.[1] as unknown[];
    const insertParams = queryMock.mock.calls[1]?.[1] as unknown[];
    expect((deleteParams[2] as Date).getTime()).toBe(expectedWindowStartMs);
    expect((insertParams[2] as Date).getTime()).toBe(expectedWindowStartMs);
  });

  it('lands exactly on a window boundary instant without drifting into the next window', async () => {
    const rule = AUTH_RATE_LIMIT_RULES[AuthRateLimitScope.VerifyResendCooldown]; // 60s window
    // Exactly on a 60-second boundary.
    const boundaryMs = Math.floor(Date.now() / rule.windowMs) * rule.windowMs;
    jest.spyOn(Date, 'now').mockReturnValue(boundaryMs);

    const { dataSource, queryMock } = stubDataSource(1);
    const service = new AuthRateLimitService(dataSource, stubSecrets());

    await service.consume(AuthRateLimitScope.VerifyResendCooldown, 'reader@example.test');

    const insertParams = queryMock.mock.calls[1]?.[1] as unknown[];
    expect((insertParams[2] as Date).getTime()).toBe(boundaryMs);
  });

  it('hashes the subject with the "rate:<scope>:" domain prefix — never the raw address', async () => {
    const { dataSource, queryMock } = stubDataSource(1);
    const service = new AuthRateLimitService(dataSource, stubSecrets());

    await service.consume(AuthRateLimitScope.RegisterEmail, 'someone@example.test');

    const insertParams = queryMock.mock.calls[1]?.[1] as unknown[];
    const subjectHash = insertParams[1] as Buffer;
    expect(Buffer.isBuffer(subjectHash)).toBe(true);
    expect(subjectHash.length).toBe(32);
    expect(subjectHash.toString('utf8')).not.toContain('someone@example.test');
  });

  it('produces a different subject hash for a different scope, even for the same address', async () => {
    const capture = async (scope: AuthRateLimitScope): Promise<Buffer> => {
      const { dataSource, queryMock } = stubDataSource(1);
      const service = new AuthRateLimitService(dataSource, stubSecrets());
      await service.consume(scope, 'same-address@example.test');
      const insertParams = queryMock.mock.calls[1]?.[1] as unknown[];
      return insertParams[1] as Buffer;
    };

    const registerHash = await capture(AuthRateLimitScope.RegisterEmail);
    const loginHash = await capture(AuthRateLimitScope.LoginEmail);
    expect(registerHash.equals(loginHash)).toBe(false);
  });
});
