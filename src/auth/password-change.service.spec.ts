import type { DataSource, EntityManager, Repository } from 'typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AUTH_ERROR_KEYS } from './auth-error-keys';
import { AuthRateLimitScope } from './auth.types';
import type { AuthRateLimitService } from './auth-rate-limit.service';
import type { AuthResultDto } from './dto/auth-result.dto';
import { PasswordChangeService } from './password-change.service';
import { PasswordHasherService, PasswordHashVerificationError } from './password-hasher.service';
import type { SessionService } from './session.service';
import { Session } from './entities/session.entity';
import { User } from './entities/user.entity';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CURRENT = 'Current1';
const NEXT = 'NewPass1';
const STORED_HASH = '$argon2id$v=19$m=19456,p=1,t=2$c3ludGhldGlj$c3ludGhldGljLWhhc2g';

const TOKEN_PAIR: AuthResultDto = {
  accessToken: 'access.token.value',
  accessTokenExpiresInSeconds: 900,
  refreshToken: 'refresh-token-value',
  refreshTokenExpiresInSeconds: 2_592_000,
};

interface Harness {
  service: PasswordChangeService;
  increment: jest.Mock;
  update: jest.Mock;
  hash: jest.Mock;
  issueSession: jest.Mock;
  consume: jest.Mock;
}

interface HarnessOptions {
  /** `undefined` = the user row is missing entirely. */
  tokenVersion?: number;
  /**
   * Overrides the default verifier. The DEFAULT models Argon2 honestly — it answers true for
   * the one password the account actually has and false for everything else. A stub that
   * answered true unconditionally would make the reuse check ("is the new password the one
   * you already have?") fire on every call, which is exactly how an earlier draft of this
   * file passed three tests for the wrong reason.
   */
  verify?: (storedHash: string, candidate: string) => Promise<boolean>;
  rateLimitAllowed?: boolean;
}

function harness(options: HarnessOptions = {}): Harness {
  const { tokenVersion = 3, rateLimitAllowed = true } = options;

  const increment = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
  const update = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
  const manager = { increment, update } as unknown as EntityManager;

  const userRow =
    options.tokenVersion === undefined && 'tokenVersion' in options
      ? undefined
      : { id: USER_ID, passwordHash: STORED_HASH, tokenVersion };

  const getOne = jest.fn<() => Promise<unknown>>().mockResolvedValue(userRow ?? null);
  const queryBuilder = {
    addSelect: () => queryBuilder,
    where: () => queryBuilder,
    getOne,
  };
  const users = {
    createQueryBuilder: () => queryBuilder,
  } as unknown as Repository<User>;

  const dataSource = {
    transaction: (cb: (m: EntityManager) => Promise<unknown>) => cb(manager),
  } as unknown as DataSource;

  const verify =
    options.verify ??
    (async (_storedHash: string, candidate: string): Promise<boolean> =>
      Promise.resolve(candidate === CURRENT));
  const hash = jest.fn<() => Promise<string>>().mockResolvedValue('$argon2id$new-hash');
  const passwordHasher = {
    verify: jest.fn(verify),
    hash,
  } as unknown as PasswordHasherService;

  const issueSession = jest.fn<() => Promise<AuthResultDto>>().mockResolvedValue(TOKEN_PAIR);
  const sessions = { issueSession } as unknown as SessionService;

  const consume = jest
    .fn<() => Promise<{ allowed: boolean }>>()
    .mockResolvedValue({ allowed: rateLimitAllowed });
  const rateLimiter = { consume } as unknown as AuthRateLimitService;

  return {
    service: new PasswordChangeService(users, dataSource, passwordHasher, sessions, rateLimiter),
    increment,
    update,
    hash,
    issueSession,
    consume,
  };
}

describe('PasswordChangeService.change', () => {
  it('rejects a wrong current password with errors.password.currentInvalid', async () => {
    const { service, increment } = harness();

    await expect(service.change(USER_ID, 'wrong', NEXT)).rejects.toMatchObject({
      message: AUTH_ERROR_KEYS.passwordCurrentInvalid,
    });
    expect(increment).not.toHaveBeenCalled();
  });

  it('rejects a new password equal to the current one, without writing', async () => {
    const { service, increment, update } = harness();

    await expect(service.change(USER_ID, CURRENT, CURRENT)).rejects.toMatchObject({
      message: AUTH_ERROR_KEYS.passwordUnchanged,
    });
    expect(increment).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('bumps tokenVersion, stores the new hash and revokes live sessions', async () => {
    const { service, increment, update, hash } = harness();

    await service.change(USER_ID, CURRENT, NEXT);

    expect(hash).toHaveBeenCalledWith(NEXT);
    expect(increment).toHaveBeenCalledWith(User, { id: USER_ID }, 'tokenVersion', 1);

    const updatedEntities = update.mock.calls.map((call) => call[0]);
    expect(updatedEntities).toContain(User);
    expect(updatedEntities).toContain(Session);
  });

  it('returns a fresh pair minted against the BUMPED tokenVersion', async () => {
    const { service, issueSession } = harness({ tokenVersion: 3 });

    const result = await service.change(USER_ID, CURRENT, NEXT);

    // 3 was the persisted version; the transaction incremented it, so the new access token
    // must carry 4 — minting against 3 would hand the caller a token their own change kills.
    expect(issueSession).toHaveBeenCalledWith(USER_ID, 4);
    expect(result).toEqual(TOKEN_PAIR);
  });

  it('spends the identity-axis budget before it verifies anything', async () => {
    const { service, consume } = harness();

    await service.change(USER_ID, CURRENT, NEXT);

    expect(consume).toHaveBeenCalledWith(AuthRateLimitScope.PasswordChange, USER_ID);
  });

  it('answers 429 when the identity-axis budget is spent', async () => {
    const { service, increment } = harness({ rateLimitAllowed: false });

    await expect(service.change(USER_ID, CURRENT, NEXT)).rejects.toMatchObject({
      message: AUTH_ERROR_KEYS.tooManyAttempts,
    });
    expect(increment).not.toHaveBeenCalled();
  });

  it('treats a hash-integrity failure as a wrong password, not a 500', async () => {
    const { service, increment } = harness({
      verify: async () => {
        return Promise.reject(new PasswordHashVerificationError());
      },
    });

    await expect(service.change(USER_ID, CURRENT, NEXT)).rejects.toMatchObject({
      message: AUTH_ERROR_KEYS.passwordCurrentInvalid,
    });
    expect(increment).not.toHaveBeenCalled();
  });

  it('lets an error that is not a hash-integrity failure propagate', async () => {
    const boom = new Error('argon2 could not allocate');
    const { service } = harness({
      verify: async () => Promise.reject(boom),
    });

    await expect(service.change(USER_ID, CURRENT, NEXT)).rejects.toBe(boom);
  });

  describe('when the user row is gone', () => {
    let subject: Harness;

    beforeEach(() => {
      subject = harness({ tokenVersion: undefined });
    });

    it('throws unauthenticated', async () => {
      await expect(subject.service.change(USER_ID, CURRENT, NEXT)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
