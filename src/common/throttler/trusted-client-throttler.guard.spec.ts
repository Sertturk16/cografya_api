import { describe, expect, it } from '@jest/globals';
import { type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { type ThrottlerModuleOptions, type ThrottlerStorage } from '@nestjs/throttler';
import { type Env } from '../../config/env.schema';
import { INTERNAL_REQUEST_HEADER } from './trusted-client';
import { TrustedClientThrottlerGuard } from './trusted-client-throttler.guard';

/**
 * DB-free coverage of the guard's GLUE around the pure `isTrustedClientRequest` decision:
 * header extraction (incl. the array-header branch), the safe-method scope, ConfigService
 * binding, and — critically — the DENY paths (missing/wrong token, non-secret env). Every
 * e2e request presents a valid token on a GET, so a guard bug granting the exemption
 * unconditionally would pass the whole suite; these assertions are what actually fail on
 * such a regression. The core match/spoof branches live in `trusted-client.spec.ts`.
 */
describe('TrustedClientThrottlerGuard.shouldSkip (glue + deny paths)', () => {
  const SECRET = 'e2e-trusted-client-token-0123456789-abcdefgh';

  // The base ThrottlerGuard never calls the storage in shouldSkip; a stub that throws proves it
  // (its `never` return type is assignable to the interface's `Promise<ThrottlerStorageRecord>`).
  const storageStub: ThrottlerStorage = {
    increment: () => {
      throw new Error('storage must not be touched in shouldSkip');
    },
  };
  const options: ThrottlerModuleOptions = [{ ttl: 60_000, limit: 120 }];

  // Minimal typed ConfigService whose only relevant key is the token.
  function makeConfig(token: string | undefined): ConfigService<Env, true> {
    return {
      get: (key: string): string | undefined =>
        key === 'INTERNAL_REQUEST_TOKEN' ? token : undefined,
    } as unknown as ConfigService<Env, true>;
  }

  // Expose the protected shouldSkip for the test (a subclass legitimately sees it).
  class TestableGuard extends TrustedClientThrottlerGuard {
    runShouldSkip(context: ExecutionContext): Promise<boolean> {
      return this.shouldSkip(context);
    }
  }

  function makeGuard(token: string | undefined): TestableGuard {
    return new TestableGuard(options, storageStub, new Reflector(), makeConfig(token));
  }

  // shouldSkip only reads switchToHttp().getRequest(); a partial context suffices.
  function makeContext(
    method: string,
    headers: Record<string, string | string[] | undefined>,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ method, headers }),
      }),
    } as unknown as ExecutionContext;
  }

  it('skips a GET carrying the matching token (the ALLOW glue path)', async () => {
    const skip = await makeGuard(SECRET).runShouldSkip(
      makeContext('GET', { [INTERNAL_REQUEST_HEADER]: SECRET }),
    );
    expect(skip).toBe(true);
  });

  it('reads the first value of an array-valued header', async () => {
    const skip = await makeGuard(SECRET).runShouldSkip(
      makeContext('GET', { [INTERNAL_REQUEST_HEADER]: [SECRET, 'ignored'] }),
    );
    expect(skip).toBe(true);
  });

  it('does NOT skip a GET with no token header (anonymous stays throttled)', async () => {
    const skip = await makeGuard(SECRET).runShouldSkip(makeContext('GET', {}));
    expect(skip).toBe(false);
  });

  it('does NOT skip a GET presenting a wrong token (spoof stays throttled)', async () => {
    const skip = await makeGuard(SECRET).runShouldSkip(
      makeContext('GET', { [INTERNAL_REQUEST_HEADER]: 'wrong-token-value-000000000000000000000' }),
    );
    expect(skip).toBe(false);
  });

  it('does NOT skip a non-safe method even with a valid token (safe-method scope)', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const skip = await makeGuard(SECRET).runShouldSkip(
        makeContext(method, { [INTERNAL_REQUEST_HEADER]: SECRET }),
      );
      expect(skip).toBe(false);
    }
  });

  it('still skips a HEAD carrying the matching token (HEAD is a safe read)', async () => {
    const skip = await makeGuard(SECRET).runShouldSkip(
      makeContext('HEAD', { [INTERNAL_REQUEST_HEADER]: SECRET }),
    );
    expect(skip).toBe(true);
  });

  it('is fail-closed when no secret is configured (exemption does not exist)', async () => {
    const skip = await makeGuard(undefined).runShouldSkip(
      makeContext('GET', { [INTERNAL_REQUEST_HEADER]: SECRET }),
    );
    expect(skip).toBe(false);
  });
});
