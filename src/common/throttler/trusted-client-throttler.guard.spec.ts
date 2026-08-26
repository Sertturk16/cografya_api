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
import { VISITOR_ADDRESS_HEADER, VISITOR_FORWARD_TOKEN_HEADER } from './visitor-tracker';

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

  /** The minimal shape `getTracker` reads — structurally identical to (but independent of) the
   * guard's own private `VisitorTrackerRequest`; TS matches the two by shape, not by name. */
  interface TrackerTestRequest {
    ip?: string;
    socket?: { remoteAddress?: string };
    headers: Record<string, string | string[] | undefined>;
  }

  // Expose the protected shouldSkip/getErrorMessage/getTracker for the test (a subclass
  // legitimately sees all three).
  class TestableGuard extends TrustedClientThrottlerGuard {
    runShouldSkip(context: ExecutionContext): Promise<boolean> {
      return this.shouldSkip(context);
    }

    runGetErrorMessage(context: ExecutionContext): Promise<string> {
      return this.getErrorMessage(context, {} as ThrottlerLimitDetail);
    }

    runGetTracker(req: TrackerTestRequest): Promise<string> {
      return this.getTracker(req);
    }
  }

  function makeGuard(token: string | undefined): TestableGuard {
    return new TestableGuard(options, storageStub, new Reflector(), makeConfig(token));
  }

  /**
   * SEC84-P1 — a config double covering BOTH secrets `getTracker` reads. `NODE_ENV` defaults to
   * `'test'`, which keeps the private/loopback rejection list (§C step 9) off unless a case
   * explicitly opts in, matching how the e2e harness runs.
   */
  function makeFullConfig(values: {
    internalToken?: string;
    forwardToken?: string;
    nodeEnv?: Env['NODE_ENV'];
  }): ConfigService<Env, true> {
    return {
      get: (key: string): unknown => {
        switch (key) {
          case 'INTERNAL_REQUEST_TOKEN':
            return values.internalToken;
          case 'VISITOR_FORWARD_TOKEN':
            return values.forwardToken;
          case 'NODE_ENV':
            return values.nodeEnv ?? 'test';
          default:
            return undefined;
        }
      },
    } as unknown as ConfigService<Env, true>;
  }

  function makeFullGuard(values: {
    internalToken?: string;
    forwardToken?: string;
    nodeEnv?: Env['NODE_ENV'];
  }): TestableGuard {
    return new TestableGuard(options, storageStub, new Reflector(), makeFullConfig(values));
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

  describe('SEC84-P1 — identity (getTracker) never widens the bypass (shouldSkip)', () => {
    const FORWARD_SECRET = 'visitor-forward-token-0123456789-abcdefghij';
    const forwardingHeaders = {
      [VISITOR_FORWARD_TOKEN_HEADER]: FORWARD_SECRET,
      [VISITOR_ADDRESS_HEADER]: '198.51.100.20',
    };

    it('a POST carrying a valid INTERNAL_REQUEST_TOKEN AND a valid forwarding pair still yields shouldSkip === false', async () => {
      const skip = await makeFullGuard({
        internalToken: SECRET,
        forwardToken: FORWARD_SECRET,
      }).runShouldSkip(
        makeContext('POST', { [INTERNAL_REQUEST_HEADER]: SECRET, ...forwardingHeaders }),
      );
      expect(skip).toBe(false);
    });

    it('a GET carrying a valid forwarding pair but NO internal token yields shouldSkip === false', async () => {
      const skip = await makeFullGuard({ forwardToken: FORWARD_SECRET }).runShouldSkip(
        makeContext('GET', { ...forwardingHeaders }),
      );
      expect(skip).toBe(false);
    });

    it('POSITIVE CONTROL: a GET carrying a valid internal token (no forwarding involved) still skips', async () => {
      // Without this the two cases above could pass because the whole exemption broke, not
      // because identity and bypass are actually separated.
      const skip = await makeFullGuard({ internalToken: SECRET }).runShouldSkip(
        makeContext('GET', { [INTERNAL_REQUEST_HEADER]: SECRET }),
      );
      expect(skip).toBe(true);
    });

    it('@NoTrustedClientExemption still wins on a GET even when a valid forwarding pair rides along with a valid internal token', async () => {
      const skip = await makeFullGuard({
        internalToken: SECRET,
        forwardToken: FORWARD_SECRET,
      }).runShouldSkip(
        makeContext(
          'GET',
          { [INTERNAL_REQUEST_HEADER]: SECRET, ...forwardingHeaders },
          exemptionOptedOutTargets(),
        ),
      );
      expect(skip).toBe(false);
    });

    describe('getTracker glue — measured through the guard, not the pure resolveVisitorIdentity', () => {
      const PEER_REQUEST: TrackerTestRequest = {
        ip: '203.0.113.10',
        socket: { remoteAddress: '203.0.113.10' },
        headers: {},
      };
      const FORWARDED_REQUEST: TrackerTestRequest = {
        ip: '203.0.113.10',
        socket: { remoteAddress: '203.0.113.10' },
        headers: forwardingHeaders,
      };

      it('with NO forwarding token configured, forwarding headers change nothing: same key as a plain peer request', async () => {
        // A single guard instance, so the process-lifetime salt is fixed and the two keys are
        // comparable — the salt is per-instance, not injectable, so cross-instance keys are
        // never comparable by design (SEC84-P1 §F).
        const guard = makeFullGuard({});
        const withoutForwarding = await guard.runGetTracker(PEER_REQUEST);
        const withForwardingHeadersButNoToken = await guard.runGetTracker(FORWARDED_REQUEST);
        expect(withForwardingHeadersButNoToken).toBe(withoutForwarding);
      });

      it('with a valid forwarding pair AND a configured token, the key DIFFERS from the same peer request', async () => {
        const guard = makeFullGuard({ forwardToken: FORWARD_SECRET });
        const peerKey = await guard.runGetTracker(PEER_REQUEST);
        const forwardedKey = await guard.runGetTracker(FORWARDED_REQUEST);
        expect(forwardedKey).not.toBe(peerKey);
      });
    });
  });
});
