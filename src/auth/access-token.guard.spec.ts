import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import type { Repository } from 'typeorm';
import { AccountStatus } from './account.types';
import { AccessTokenGuard } from './access-token.guard';
import {
  AccessTokenVerificationError,
  type AccessTokenPayload,
  type AccessTokenService,
} from './access-token.service';
import { AUTHENTICATED_USER_REQUEST_KEY } from './authenticated-user';
import type { User } from './entities/user.entity';

/** A minimal `ExecutionContext` stand-in — the guard only ever calls `switchToHttp().getRequest()`. */
function buildContext(headers: Record<string, string | undefined>): {
  context: ExecutionContext;
  request: Record<string, unknown>;
} {
  const request: Record<string, unknown> = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

const VALID_PAYLOAD: AccessTokenPayload = {
  sub: '11111111-1111-4111-8111-111111111111',
  sv: 0,
  typ: 'access',
  iss: 'cografya-api',
  aud: 'cografya-web',
  iat: 0,
  exp: 0,
  jti: '22222222-2222-4222-8222-222222222222',
};

/**
 * Returns the stub ALONGSIDE its raw `jest.fn()` mock — never `stub.verify` itself for a
 * `toHaveBeenCalled` assertion: `AccessTokenService.verify`'s declared type has no `this: void`,
 * so accessing it as a detached reference trips `@typescript-eslint/unbound-method` even though
 * the runtime value is a plain mock function.
 */
function stubAccessTokens(payload: AccessTokenPayload | Error): {
  accessTokens: AccessTokenService;
  verifyMock: jest.Mock<() => Promise<AccessTokenPayload>>;
} {
  const verifyMock =
    payload instanceof Error
      ? jest.fn<() => Promise<AccessTokenPayload>>().mockRejectedValue(payload)
      : jest.fn<() => Promise<AccessTokenPayload>>().mockResolvedValue(payload);
  return { accessTokens: { verify: verifyMock } as unknown as AccessTokenService, verifyMock };
}

function stubUsers(user: Pick<User, 'id' | 'status' | 'tokenVersion'> | null): {
  users: Repository<User>;
  findOneMock: jest.Mock<() => Promise<User | null>>;
} {
  const findOneMock = jest.fn<() => Promise<User | null>>().mockResolvedValue(user as User | null);
  return { users: { findOne: findOneMock } as unknown as Repository<User>, findOneMock };
}

/** U-G1: D14's six steps, each ret dalı asserted separately; the user read is always stubbed. */
describe('AccessTokenGuard.canActivate (D14, six steps)', () => {
  it('step 1 — rejects a request with no Authorization header at all', async () => {
    const { accessTokens, verifyMock } = stubAccessTokens(new AccessTokenVerificationError());
    const { users } = stubUsers(null);
    const guard = new AccessTokenGuard(accessTokens, users);
    const { context } = buildContext({});

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('step 1 — rejects every header shape that is not exactly "Bearer <token>"', async () => {
    const { accessTokens, verifyMock } = stubAccessTokens(new AccessTokenVerificationError());
    const { users } = stubUsers(null);
    const guard = new AccessTokenGuard(accessTokens, users);

    for (const header of ['Basic abc', 'bearer abc', 'Bearer', 'Bearer ', 'BEARER abc']) {
      const { context } = buildContext({ authorization: header });
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('step 2 — rejects when AccessTokenService.verify throws for any reason', async () => {
    const { accessTokens } = stubAccessTokens(new AccessTokenVerificationError());
    const { users, findOneMock } = stubUsers(null);
    const guard = new AccessTokenGuard(accessTokens, users);
    const { context } = buildContext({ authorization: 'Bearer bad-token' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findOneMock).not.toHaveBeenCalled();
  });

  it('step 3 — rejects when no user row matches the verified sub', async () => {
    const { accessTokens } = stubAccessTokens(VALID_PAYLOAD);
    const { users } = stubUsers(null);
    const guard = new AccessTokenGuard(accessTokens, users);
    const { context } = buildContext({ authorization: 'Bearer good-token' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('step 4 — rejects when the user status is not ACTIVE (401, not 403)', async () => {
    const { accessTokens } = stubAccessTokens(VALID_PAYLOAD);
    const { users } = stubUsers({
      id: VALID_PAYLOAD.sub,
      status: AccountStatus.Unverified,
      tokenVersion: VALID_PAYLOAD.sv,
    });
    const guard = new AccessTokenGuard(accessTokens, users);
    const { context } = buildContext({ authorization: 'Bearer good-token' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('step 5 — rejects when tokenVersion does not match the sv claim', async () => {
    const { accessTokens } = stubAccessTokens(VALID_PAYLOAD);
    const { users } = stubUsers({
      id: VALID_PAYLOAD.sub,
      status: AccountStatus.Active,
      tokenVersion: VALID_PAYLOAD.sv + 1,
    });
    const guard = new AccessTokenGuard(accessTokens, users);
    const { context } = buildContext({ authorization: 'Bearer good-token' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('step 6 — accepts and attaches ONLY { id } to the request when every step succeeds', async () => {
    const { accessTokens } = stubAccessTokens(VALID_PAYLOAD);
    const { users } = stubUsers({
      id: VALID_PAYLOAD.sub,
      status: AccountStatus.Active,
      tokenVersion: VALID_PAYLOAD.sv,
    });
    const guard = new AccessTokenGuard(accessTokens, users);
    const { context, request } = buildContext({ authorization: 'Bearer good-token' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    const attached = request[AUTHENTICATED_USER_REQUEST_KEY] as { id: string };
    expect(attached).toEqual({ id: VALID_PAYLOAD.sub });
    expect(Object.keys(attached)).toEqual(['id']);
  });

  it('every reject branch throws the SAME body, indistinguishable across reasons', async () => {
    const missing = buildContext({});
    const badToken = buildContext({ authorization: 'Bearer x' });
    const guardForMissing = new AccessTokenGuard(
      stubAccessTokens(new AccessTokenVerificationError()).accessTokens,
      stubUsers(null).users,
    );
    const guardForBadToken = new AccessTokenGuard(
      stubAccessTokens(new AccessTokenVerificationError()).accessTokens,
      stubUsers(null).users,
    );

    let missingResponse: unknown;
    let badTokenResponse: unknown;
    try {
      await guardForMissing.canActivate(missing.context);
    } catch (error) {
      missingResponse = (error as UnauthorizedException).getResponse();
    }
    try {
      await guardForBadToken.canActivate(badToken.context);
    } catch (error) {
      badTokenResponse = (error as UnauthorizedException).getResponse();
    }
    expect(missingResponse).toEqual(badTokenResponse);
  });
});
