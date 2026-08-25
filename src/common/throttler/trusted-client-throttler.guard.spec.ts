import { describe, expect, it } from '@jest/globals';
import { type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import { type Env } from '../../config/env.schema';
import { NoTrustedClientExemption, ThrottlerErrorMessage } from './throttler-metadata';
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

  // Expose the protected shouldSkip/getErrorMessage for the test (a subclass legitimately
  // sees both).
  class TestableGuard extends TrustedClientThrottlerGuard {
    runShouldSkip(context: ExecutionContext): Promise<boolean> {
      return this.shouldSkip(context);
    }

    runGetErrorMessage(context: ExecutionContext): Promise<string> {
      return this.getErrorMessage(context, {} as ThrottlerLimitDetail);
    }
  }

  function makeGuard(token: string | undefined): TestableGuard {
    return new TestableGuard(options, storageStub, new Reflector(), makeConfig(token));
  }

  interface ReflectorTargets {
    handler: () => void;
    classRef: new () => object;
  }

  /**
   * `Reflector` reads metadata off the handler FUNCTION and the class, so a context has to expose
   * real decorated targets rather than plain objects.
   *
   * The handler is read out of the property DESCRIPTOR rather than as `Prototype.method`: an
   * unbound method reference is exactly what `@typescript-eslint/unbound-method` exists to stop,
   * and the descriptor's `value` is the same function object the decorator wrote its metadata on.
   */
  function handlerOf(classRef: new () => object): () => void {
    const descriptor = Object.getOwnPropertyDescriptor(classRef.prototype, 'method');
    if (!descriptor) throw new Error('fixture class carries no `method`');
    return descriptor.value as () => void;
  }

  function undecoratedTargets(): ReflectorTargets {
    class Plain {
      method(): void {}
    }
    return { handler: handlerOf(Plain), classRef: Plain };
  }

  function exemptionOptedOutTargets(): ReflectorTargets {
    class OptedOut {
      method(): void {}
    }
    const descriptor = Object.getOwnPropertyDescriptor(OptedOut.prototype, 'method');
    if (!descriptor) throw new Error('fixture class carries no `method`');
    NoTrustedClientExemption()(OptedOut.prototype, 'method', descriptor);
    return { handler: handlerOf(OptedOut), classRef: OptedOut };
  }

  // shouldSkip reads switchToHttp().getRequest() plus (since SEC136-I3) the route metadata; a
  // partial context carrying both suffices.
  function makeContext(
    method: string,
    headers: Record<string, string | string[] | undefined>,
    targets = undecoratedTargets(),
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ method, headers }),
      }),
      getHandler: () => targets.handler,
      getClass: () => targets.classRef,
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

  describe('SEC136-I3 — the per-route opt-out', () => {
    it('does NOT skip an opted-out GET even with a valid token (the whole point)', async () => {
      const skip = await makeGuard(SECRET).runShouldSkip(
        makeContext('GET', { [INTERNAL_REQUEST_HEADER]: SECRET }, exemptionOptedOutTargets()),
      );
      expect(skip).toBe(false);
    });

    it('POSITIVE CONTROL: the SAME request without the marker IS skipped', async () => {
      // Without this pair the assertion above could pass for any unrelated reason (a broken
      // header read, a wrong method), and the opt-out would look like it works while doing
      // nothing. Only the two together show the marker is what changed the answer.
      const skip = await makeGuard(SECRET).runShouldSkip(
        makeContext('GET', { [INTERNAL_REQUEST_HEADER]: SECRET }, undecoratedTargets()),
      );
      expect(skip).toBe(true);
    });
  });

  describe('CODE136-I1/SEC136-I4 — the declared 429 message', () => {
    function errorMessageTargets(message: string): ReflectorTargets {
      class Declared {
        method(): void {}
      }
      ThrottlerErrorMessage(message)(Declared);
      return { handler: handlerOf(Declared), classRef: Declared };
    }

    it('returns the class-declared i18n key instead of the framework default', async () => {
      const message = await makeGuard(SECRET).runGetErrorMessage(
        makeContext('POST', {}, errorMessageTargets('errors.auth.rateLimited')),
      );
      expect(message).toBe('errors.auth.rateLimited');
    });

    it('POSITIVE CONTROL: a route declaring nothing keeps the framework default untouched', async () => {
      // The additive half of the finding's fix: no existing 429 body may change. The expected
      // value is @nestjs/throttler's own `throttlerMessage` constant.
      const message = await makeGuard(SECRET).runGetErrorMessage(
        makeContext('POST', {}, undecoratedTargets()),
      );
      expect(message).toBe('ThrottlerException: Too Many Requests');
    });
  });
});
