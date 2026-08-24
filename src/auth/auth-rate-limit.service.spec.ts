import type { DataSource } from 'typeorm';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AuthRateLimitService, AuthRateLimitUnavailableError } from './auth-rate-limit.service';
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

/**
 * The `TA135R2-I1` fixture: a `DataSource` stand-in whose SECOND call (the INSERT … RETURNING)
 * resolves to an arbitrary, caller-supplied shape — including every malformed shape the fail-closed
 * branch exists to catch. `stubDataSource` above can only ever produce a WELL-FORMED row, which is
 * exactly why the round-2 review found the six pre-existing cases never exercised `throw` at all.
 */
function stubDataSourceWithInsertResult(insertResult: unknown): {
  dataSource: DataSource;
  queryMock: jest.Mock;
} {
  const queryMock = jest
    .fn<() => Promise<unknown>>()
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(insertResult);
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

  describe('fail-closed on an unexpected INSERT … RETURNING result shape (`TA135R2-I1`)', () => {
    it('rejects with AuthRateLimitUnavailableError on an empty row array', async () => {
      const { dataSource } = stubDataSourceWithInsertResult([]);
      const service = new AuthRateLimitService(dataSource, stubSecrets());

      await expect(
        service.consume(AuthRateLimitScope.LoginEmail, 'reader@example.test'),
      ).rejects.toBeInstanceOf(AuthRateLimitUnavailableError);
    });

    it('rejects with AuthRateLimitUnavailableError on a row missing attempt_count', async () => {
      const { dataSource } = stubDataSourceWithInsertResult([{}]);
      const service = new AuthRateLimitService(dataSource, stubSecrets());

      await expect(
        service.consume(AuthRateLimitScope.LoginEmail, 'reader@example.test'),
      ).rejects.toBeInstanceOf(AuthRateLimitUnavailableError);
    });

    it('rejects with AuthRateLimitUnavailableError when attempt_count is an int8-as-string', async () => {
      // Postgres `int8`/`bigint` columns come back as STRING through node-postgres by default;
      // `attempt_count` is `integer` today, but a future column-type change reaching this shape
      // must fail loudly rather than silently coerce.
      const { dataSource } = stubDataSourceWithInsertResult([{ attempt_count: '3' }]);
      const service = new AuthRateLimitService(dataSource, stubSecrets());

      await expect(
        service.consume(AuthRateLimitScope.LoginEmail, 'reader@example.test'),
      ).rejects.toBeInstanceOf(AuthRateLimitUnavailableError);
    });

    it('rejects with AuthRateLimitUnavailableError when attempt_count is null', async () => {
      const { dataSource } = stubDataSourceWithInsertResult([{ attempt_count: null }]);
      const service = new AuthRateLimitService(dataSource, stubSecrets());

      await expect(
        service.consume(AuthRateLimitScope.LoginEmail, 'reader@example.test'),
      ).rejects.toBeInstanceOf(AuthRateLimitUnavailableError);
    });

    it('rejects with AuthRateLimitUnavailableError on the TypeORM `[rows, rowCount]` tuple shape', async () => {
      // The shape `PostgresQueryRunner` returns for an UPDATE/DELETE command tag — the docblock's
      // own named hazard (a future refactor turning this INSERT into an `UPDATE … RETURNING`).
      // `rows[0]` here is the tuple's first ELEMENT (an array), not a row object, so
      // `rawAttemptCount` reads as `undefined` and the fail-closed branch fires.
      const { dataSource } = stubDataSourceWithInsertResult([[{ attempt_count: 3 }], 1]);
      const service = new AuthRateLimitService(dataSource, stubSecrets());

      await expect(
        service.consume(AuthRateLimitScope.LoginEmail, 'reader@example.test'),
      ).rejects.toBeInstanceOf(AuthRateLimitUnavailableError);
    });

    it('POSITIVE CONTROL: a well-formed numeric result still resolves and computes `allowed` correctly', async () => {
      const rule = AUTH_RATE_LIMIT_RULES[AuthRateLimitScope.LoginEmail];
      const { dataSource } = stubDataSourceWithInsertResult([{ attempt_count: rule.limit }]);
      const service = new AuthRateLimitService(dataSource, stubSecrets());

      const outcome = await service.consume(AuthRateLimitScope.LoginEmail, 'reader@example.test');
      expect(outcome.allowed).toBe(true);
      expect(outcome.retryAfterSeconds).toBe(0);
    });
  });
});
