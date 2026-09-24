import type { Repository } from 'typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { AccountDeletionService } from './account-deletion.service';
import { AUTH_ERROR_KEYS } from './auth-error-keys';
import { AuthRateLimitScope } from './auth.types';
import type { AuthRateLimitService } from './auth-rate-limit.service';
import { PasswordHasherService, PasswordHashVerificationError } from './password-hasher.service';
import type { User } from './entities/user.entity';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CURRENT = 'Current1';
const STORED_HASH = '$argon2id$v=19$m=19456,p=1,t=2$c3ludGhldGlj$c3ludGhldGljLWhhc2g';

interface HarnessOptions {
  userMissing?: boolean;
  rateLimitAllowed?: boolean;
  verify?: (storedHash: string, candidate: string) => Promise<boolean>;
  affected?: number;
}

function harness(options: HarnessOptions = {}) {
  const getOne = jest
    .fn<() => Promise<unknown>>()
    .mockResolvedValue(options.userMissing ? null : { id: USER_ID, passwordHash: STORED_HASH });
  const queryBuilder = { addSelect: () => queryBuilder, where: () => queryBuilder, getOne };
  const deleteMock = jest
    .fn<(criteria: unknown) => Promise<{ affected: number }>>()
    .mockResolvedValue({ affected: options.affected ?? 1 });
  const users = {
    createQueryBuilder: () => queryBuilder,
    delete: deleteMock,
  } as unknown as Repository<User>;

  const verify =
    options.verify ??
    (async (_stored: string, candidate: string): Promise<boolean> =>
      Promise.resolve(candidate === CURRENT));
  const passwordHasher = { verify: jest.fn(verify) } as unknown as PasswordHasherService;

  const consume = jest
    .fn<(scope: unknown, subject: unknown) => Promise<{ allowed: boolean }>>()
    .mockResolvedValue({ allowed: options.rateLimitAllowed ?? true });
  const rateLimiter = { consume } as unknown as AuthRateLimitService;

  return {
    service: new AccountDeletionService(users, passwordHasher, rateLimiter),
    deleteMock,
    consume,
    getOne,
  };
}

describe('AccountDeletionService.deleteAccount', () => {
  it('deletes the user row when the current password is right', async () => {
    const { service, deleteMock } = harness();

    await service.deleteAccount(USER_ID, CURRENT);

    expect(deleteMock).toHaveBeenCalledWith({ id: USER_ID });
  });

  it('spends the shared PASSWORD_CHANGE_USER budget keyed by the user id', async () => {
    const { service, consume } = harness();

    await service.deleteAccount(USER_ID, CURRENT);

    expect(consume).toHaveBeenCalledWith(AuthRateLimitScope.PasswordChange, USER_ID);
  });

  it('refuses a wrong password with errors.password.currentInvalid and deletes nothing', async () => {
    const { service, deleteMock } = harness();

    await expect(service.deleteAccount(USER_ID, 'wrong')).rejects.toMatchObject({
      message: AUTH_ERROR_KEYS.passwordCurrentInvalid,
    });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('answers 429 tooManyAttempts before reading the row once the budget is spent', async () => {
    const { service, deleteMock, getOne } = harness({ rateLimitAllowed: false });

    await expect(service.deleteAccount(USER_ID, CURRENT)).rejects.toMatchObject({
      message: AUTH_ERROR_KEYS.tooManyAttempts,
    });
    expect(getOne).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('answers unauthenticated when the user row is gone', async () => {
    const { service } = harness({ userMissing: true });

    await expect(service.deleteAccount(USER_ID, CURRENT)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('fails closed on a hash-integrity error', async () => {
    const { service, deleteMock } = harness({
      verify: () => Promise.reject(new PasswordHashVerificationError()),
    });

    await expect(service.deleteAccount(USER_ID, CURRENT)).rejects.toMatchObject({
      message: AUTH_ERROR_KEYS.passwordCurrentInvalid,
    });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('answers unauthenticated when a concurrent delete got there first', async () => {
    const { service } = harness({ affected: 0 });

    await expect(service.deleteAccount(USER_ID, CURRENT)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
