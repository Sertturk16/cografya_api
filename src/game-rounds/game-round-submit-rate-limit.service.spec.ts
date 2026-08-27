import type { DataSource } from 'typeorm';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  GAME_ROUND_SUBMIT_RATE_LIMIT,
  GameRoundSubmitRateLimitService,
  GameRoundSubmitRateLimitUnavailableError,
} from './game-round-submit-rate-limit.service';

/** A `DataSource` stand-in: DELETE returns nothing meaningful, INSERT returns `attempt_count`. */
function stubDataSource(attemptCount: number): { dataSource: DataSource; queryMock: jest.Mock } {
  const queryMock = jest
    .fn<() => Promise<unknown[]>>()
    // 1st call: the DELETE (cleanup) — no rows returned.
    .mockResolvedValueOnce([])
    // 2nd call: the INSERT … ON CONFLICT … RETURNING.
    .mockResolvedValueOnce([{ attempt_count: attemptCount }]);
  return { dataSource: { query: queryMock } as unknown as DataSource, queryMock };
}

/**
 * A `DataSource` stand-in whose SECOND call (the INSERT … RETURNING) resolves to an arbitrary,
 * caller-supplied shape — the `AuthRateLimitService.spec.ts` `TA135R2-I1` fixture, reused here
 * verbatim for the identical fail-closed branch this service's own docblock says it shares.
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

describe('GameRoundSubmitRateLimitService.consume', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows a request at or below the cap', async () => {
    const { dataSource } = stubDataSource(GAME_ROUND_SUBMIT_RATE_LIMIT.limit);
    const service = new GameRoundSubmitRateLimitService(dataSource);

    const outcome = await service.consume('11111111-1111-1111-1111-111111111111');

    expect(outcome.allowed).toBe(true);
    expect(outcome.retryAfterSeconds).toBe(0);
  });

  it('refuses a request one over the cap', async () => {
    const { dataSource } = stubDataSource(GAME_ROUND_SUBMIT_RATE_LIMIT.limit + 1);
    const service = new GameRoundSubmitRateLimitService(dataSource);

    const outcome = await service.consume('11111111-1111-1111-1111-111111111111');

    expect(outcome.allowed).toBe(false);
    expect(outcome.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('computes windowStart as floor(now / windowMs) * windowMs in both SQL calls', async () => {
    const fixedNowMs = new Date('2026-08-24T10:00:37.000Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(fixedNowMs);
    const expectedWindowStartMs =
      Math.floor(fixedNowMs / GAME_ROUND_SUBMIT_RATE_LIMIT.windowMs) *
      GAME_ROUND_SUBMIT_RATE_LIMIT.windowMs;

    const { dataSource, queryMock } = stubDataSource(1);
    const service = new GameRoundSubmitRateLimitService(dataSource);

    await service.consume('11111111-1111-1111-1111-111111111111');

    expect(queryMock).toHaveBeenCalledTimes(2);
    const deleteParams = queryMock.mock.calls[0]?.[1] as unknown[];
    const insertParams = queryMock.mock.calls[1]?.[1] as unknown[];
    expect((deleteParams[1] as Date).getTime()).toBe(expectedWindowStartMs);
    expect((insertParams[1] as Date).getTime()).toBe(expectedWindowStartMs);
  });

  it('scopes both SQL calls to the given userId, plainly (no hashing)', async () => {
    const { dataSource, queryMock } = stubDataSource(1);
    const service = new GameRoundSubmitRateLimitService(dataSource);
    const userId = '22222222-2222-2222-2222-222222222222';

    await service.consume(userId);

    const deleteParams = queryMock.mock.calls[0]?.[1] as unknown[];
    const insertParams = queryMock.mock.calls[1]?.[1] as unknown[];
    expect(deleteParams[0]).toBe(userId);
    expect(insertParams[0]).toBe(userId);
  });

  describe('fail-closed on an unexpected INSERT … RETURNING result shape', () => {
    it('rejects with GameRoundSubmitRateLimitUnavailableError on an empty row array', async () => {
      const { dataSource } = stubDataSourceWithInsertResult([]);
      const service = new GameRoundSubmitRateLimitService(dataSource);

      await expect(service.consume('11111111-1111-1111-1111-111111111111')).rejects.toBeInstanceOf(
        GameRoundSubmitRateLimitUnavailableError,
      );
    });

    it('rejects with GameRoundSubmitRateLimitUnavailableError on a row missing attempt_count', async () => {
      const { dataSource } = stubDataSourceWithInsertResult([{}]);
      const service = new GameRoundSubmitRateLimitService(dataSource);

      await expect(service.consume('11111111-1111-1111-1111-111111111111')).rejects.toBeInstanceOf(
        GameRoundSubmitRateLimitUnavailableError,
      );
    });

    it('rejects with GameRoundSubmitRateLimitUnavailableError on the TypeORM `[rows, rowCount]` tuple shape', async () => {
      const { dataSource } = stubDataSourceWithInsertResult([[{ attempt_count: 3 }], 1]);
      const service = new GameRoundSubmitRateLimitService(dataSource);

      await expect(service.consume('11111111-1111-1111-1111-111111111111')).rejects.toBeInstanceOf(
        GameRoundSubmitRateLimitUnavailableError,
      );
    });

    it('POSITIVE CONTROL: a well-formed numeric result still resolves and computes `allowed` correctly', async () => {
      const { dataSource } = stubDataSourceWithInsertResult([
        { attempt_count: GAME_ROUND_SUBMIT_RATE_LIMIT.limit },
      ]);
      const service = new GameRoundSubmitRateLimitService(dataSource);

      const outcome = await service.consume('11111111-1111-1111-1111-111111111111');
      expect(outcome.allowed).toBe(true);
      expect(outcome.retryAfterSeconds).toBe(0);
    });
  });
});
