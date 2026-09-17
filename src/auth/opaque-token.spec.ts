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
 * Every environment `env.schema.ts` allows. Iterated rather than picking one, so a fourth value
 * added later is exercised too.
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
      expect(mintVerificationCode('test', 'noop')).toMatch(/^[0-9]{6}$/);
    }
  });

  it('produces "000000" when the underlying randomInt draws zero — a leading-zero code is a valid code, not an empty one', () => {
    randomIntMock.mockReturnValueOnce(0);
    expect(mintVerificationCode('test', 'noop')).toBe('000000');
  });

  it('shows no modulo bias across the leading digit in 100k draws', () => {
    const leadingDigitCounts = new Array<number>(10).fill(0);
    const samples = 100_000;
    for (let i = 0; i < samples; i += 1) {
      const leadingDigit = Number(mintVerificationCode('test', 'noop')[0]);
      leadingDigitCounts[leadingDigit] = (leadingDigitCounts[leadingDigit] ?? 0) + 1;
    }
    for (const count of leadingDigitCounts) {
      expect(count).toBeGreaterThan(samples / 10 - 1_500);
      expect(count).toBeLessThan(samples / 10 + 1_500);
    }
  });

  /**
   * THE TEMPORARY BRANCH (T-019), pinned so its shape is deliberate rather than incidental, and
   * so deleting it turns these two cases red — which is what a restoration should look like.
   *
   * A deployment on `noop` delivers a random code nowhere, so registration cannot complete at
   * all. The owner accepted a fixed code KNOWING it re-opens the account-takeover vector
   * `test/auth-security.e2e-spec.ts`'s `C1` was written for (two candidates for one address hold
   * the same code, so the victim's own code matches the attacker's candidate).
   */
  it.each(['development', 'production'] as Env['NODE_ENV'][])(
    'returns the fixed code on a noop transport in %s',
    (nodeEnv) => {
      expect(mintVerificationCode(nodeEnv, 'noop')).toBe('123456');
    },
  );

  /**
   * `test` is EXCLUDED from that branch, and this is the assertion that keeps the exclusion
   * honest rather than convenient. The e2e suite runs on `noop`; if the fixed code reached it,
   * `C1` would go red and the only ways out would be loosening it — which this repo forbids — or
   * deleting the property it proves. Keeping `test` on `randomInt` lets C1 go on minting
   * DISTINCT codes and proving what it was written to prove.
   *
   * The honest consequence, stated rather than implied: C1 therefore does not cover the
   * production configuration while the branch above exists.
   */
  it('keeps the test environment on randomInt even under noop, so the e2e property survives', () => {
    randomIntMock.mockReturnValueOnce(42);
    expect(mintVerificationCode('test', 'noop')).toBe('000042');
    expect(randomIntMock).toHaveBeenCalledWith(0, 1_000_000);
  });

  /**
   * The restored behaviour, asserted now so the day the TODO block is deleted is a day nothing
   * else has to change: with a real transport every environment mints randomly. Proven by
   * watching the mocked `randomInt`'s value flow through — a bare `not.toBe('123456')` would
   * pass on the 1-in-10^6 draw of 123456 and prove nothing about which branch ran.
   */
  it.each(ALL_ENVS)('takes the randomInt branch on a ses transport, in %s', (nodeEnv) => {
    randomIntMock.mockReturnValueOnce(42);
    expect(mintVerificationCode(nodeEnv, 'ses')).toBe('000042');
    expect(randomIntMock).toHaveBeenCalledWith(0, 1_000_000);
  });

  /**
   * The regression the signature exists to make impossible, now covering both parameters: the
   * parked stash version read `process.env.NODE_ENV` directly, and this repo already mutates that
   * variable as a side effect (`src/openapi/preview-env.ts` does
   * `process.env.NODE_ENV ??= 'development'` during spec generation). Setting both raw variables
   * to values that would flip the branch, while passing arguments that say otherwise, is what
   * turns red if this function ever reads the environment instead of trusting what it was handed.
   */
  it('ignores process.env entirely — only the parameters decide the branch', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousTransport = process.env.MAIL_TRANSPORT;
    try {
      process.env.NODE_ENV = 'production';
      process.env.MAIL_TRANSPORT = 'noop';
      randomIntMock.mockReturnValueOnce(42);
      expect(mintVerificationCode('test', 'ses')).toBe('000042');
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      process.env.MAIL_TRANSPORT = previousTransport;
    }
  });
});
