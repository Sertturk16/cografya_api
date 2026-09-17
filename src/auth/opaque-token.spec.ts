import { describe, expect, it, jest } from '@jest/globals';

/**
 * `randomInt` is a Node built-in whose property is non-configurable, so `jest.spyOn` throws
 * `Cannot redefine property: randomInt` at runtime (measured, `api-housekeeping-batch-2-plan.md`
 * §5.4). `jest.mock` replaces the whole module in the registry instead — the mock DELEGATES to
 * the real `randomInt` by default so every other test below still exercises genuine entropy; only
 * the one deterministic case overrides it, and only for its own single call.
 */
const actualCrypto = jest.requireActual<typeof import('node:crypto')>('node:crypto');
const randomIntMock = jest.fn<(min: number, max: number) => number>((min, max) =>
  actualCrypto.randomInt(min, max),
);

jest.mock('node:crypto', () => ({
  ...jest.requireActual<typeof import('node:crypto')>('node:crypto'),
  randomInt: (min: number, max: number) => randomIntMock(min, max),
}));

import { type Env } from '../config/env.schema';
import { mintOpaqueToken, mintVerificationCode } from './opaque-token';

/**
 * EVERY environment `env.schema.ts` allows, production included. Iterated rather than picking
 * one, so a fourth value added later is exercised too — and, since `MAIL_TRANSPORT` is what
 * decides the branch now, each case asserts the environment does NOT.
 */
const ALL_ENVS: Env['NODE_ENV'][] = ['development', 'test', 'production'];

describe('mintOpaqueToken', () => {
  it('decodes to exactly 32 bytes of entropy', () => {
    expect(Buffer.from(mintOpaqueToken(), 'base64url').length).toBe(32);
  });

  it('uses only the base64url alphabet — no "+", "/" or "=" padding', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(mintOpaqueToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('produces no collision across 1000 mints', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1_000; i += 1) seen.add(mintOpaqueToken());
    expect(seen.size).toBe(1_000);
  });
});

describe('mintVerificationCode', () => {
  it('is always exactly 6 digits, zero-padded', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(mintVerificationCode('test', 'ses')).toMatch(/^[0-9]{6}$/);
    }
  });

  it('produces "000000" when the underlying randomInt draws zero — a leading-zero code is a valid code, not an empty one', () => {
    randomIntMock.mockReturnValueOnce(0);
    expect(mintVerificationCode('test', 'ses')).toBe('000000');
  });

  it('shows no modulo bias across the leading digit in 100k draws', () => {
    const leadingDigitCounts = new Array<number>(10).fill(0);
    const samples = 100_000;
    for (let i = 0; i < samples; i += 1) {
      const leadingDigit = Number(mintVerificationCode('test', 'ses')[0]);
      leadingDigitCounts[leadingDigit] = (leadingDigitCounts[leadingDigit] ?? 0) + 1;
    }
    for (const count of leadingDigitCounts) {
      expect(count).toBeGreaterThan(samples / 10 - 1_500);
      expect(count).toBeLessThan(samples / 10 + 1_500);
    }
  });

  /**
   * The decision this function exists to make, and the direction that changed.
   *
   * It used to read `nodeEnv === 'development'`, with `env.schema.ts` refusing to boot
   * production on `MAIL_TRANSPORT=noop` so the fixed code could never reach it. That refusal is
   * gone, so the branch reads the transport instead: a deployment that sends no mail cannot
   * deliver a random code, and every environment on `noop` is in that position — production
   * MOST of all, which is why it is named here rather than left out of the list.
   */
  it.each(ALL_ENVS)('returns the fixed code on a noop transport, including in %s', (nodeEnv) => {
    expect(mintVerificationCode(nodeEnv, 'noop')).toBe('123456');
  });

  /**
   * The other half, and the one that keeps the fixed path from outliving its justification:
   * pointing the deployment at a real transport restores randomness on its own, with no flag to
   * unset. Proven by watching the mocked `randomInt`'s value flow all the way through — a bare
   * `not.toBe('123456')` would still pass on the 1-in-10^6 draw of 123456 and would prove
   * nothing about WHICH branch ran.
   */
  it.each(ALL_ENVS)('takes the randomInt branch on a ses transport, in %s', (nodeEnv) => {
    randomIntMock.mockReturnValueOnce(42);
    expect(mintVerificationCode(nodeEnv, 'ses')).toBe('000042');
    expect(randomIntMock).toHaveBeenCalledWith(0, 1_000_000);
  });

  /**
   * The regression the signature exists to make impossible, now covering both parameters: the
   * parked stash version read `process.env.NODE_ENV` directly, and this repo already mutates
   * that variable as a side effect (`src/openapi/preview-env.ts` does
   * `process.env.NODE_ENV ??= 'development'` during spec generation). Setting BOTH raw variables
   * to the values that would flip the branch, while passing arguments that say otherwise, is
   * what turns red if this function ever goes back to reading the environment instead of
   * trusting only what it was handed.
   */
  it('ignores process.env entirely — only the parameters decide the branch', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousTransport = process.env.MAIL_TRANSPORT;
    try {
      process.env.NODE_ENV = 'development';
      process.env.MAIL_TRANSPORT = 'noop';
      randomIntMock.mockReturnValueOnce(42);
      expect(mintVerificationCode('production', 'ses')).toBe('000042');
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      process.env.MAIL_TRANSPORT = previousTransport;
    }
  });
});
