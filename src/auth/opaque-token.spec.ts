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
 * Every non-development enum member `env.schema.ts` allows. Iterated rather than picking one, so
 * a THIRD environment value added to the schema later is exercised by this negative case too,
 * not silently skipped.
 */
const NON_DEVELOPMENT_ENVS: Env['NODE_ENV'][] = ['test', 'production'];

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
      const code = mintVerificationCode('test');
      expect(code).toMatch(/^[0-9]{6}$/);
    }
  });

  it('produces "000000" when the underlying randomInt draws zero — a leading-zero code is a valid code, not an empty one', () => {
    randomIntMock.mockReturnValueOnce(0);
    expect(mintVerificationCode('test')).toBe('000000');
  });

  it('shows no modulo bias across the leading digit in 100k draws', () => {
    const leadingDigitCounts = new Array<number>(10).fill(0);
    const samples = 100_000;
    for (let i = 0; i < samples; i += 1) {
      const code = mintVerificationCode('test');
      const leadingDigit = Number(code[0]);
      leadingDigitCounts[leadingDigit] = (leadingDigitCounts[leadingDigit] ?? 0) + 1;
    }
    for (const count of leadingDigitCounts) {
      expect(count).toBeGreaterThan(samples / 10 - 1_500);
      expect(count).toBeLessThan(samples / 10 + 1_500);
    }
  });

  it('returns "123456" deterministically when nodeEnv is "development"', () => {
    expect(mintVerificationCode('development')).toBe('123456');
  });

  /**
   * The property the config decision exists for: the fixed code is unreachable for any
   * `nodeEnv` other than `'development'` — proven by observing the mocked `randomInt`'s return
   * value flow all the way through, not merely that the result happens to differ from
   * `'123456'` (a bare inequality check would still pass on a 1-in-10^6 coincidence where
   * `randomInt` itself drew 123456, and would prove nothing about WHICH branch ran).
   */
  it.each(NON_DEVELOPMENT_ENVS)(
    'takes the randomInt branch, never the fixed one, when nodeEnv is %s',
    (nodeEnv) => {
      randomIntMock.mockReturnValueOnce(42);
      expect(mintVerificationCode(nodeEnv)).toBe('000042');
      expect(randomIntMock).toHaveBeenCalledWith(0, 1_000_000);
    },
  );

  /**
   * The regression this whole signature change exists to make impossible: the parked stash
   * version read `process.env.NODE_ENV` directly, so a deployment where SOMETHING ELSE in the
   * process later touched that raw variable (this repo already does exactly that —
   * `src/openapi/preview-env.ts` sets `process.env.NODE_ENV ??= 'development'`) could flip this
   * function's branch with no code change here at all. Setting `process.env.NODE_ENV =
   * 'development'` while passing a DIFFERENT `nodeEnv` argument and asserting the fixed code is
   * NOT produced is what would turn red if `mintVerificationCode` ever went back to reading the
   * raw variable instead of trusting only its parameter — reverting the implementation to the
   * parked stash's `process.env.NODE_ENV === 'development'` check reproduces exactly that
   * failure (measured locally against this test before this commit).
   */
  it('ignores process.env.NODE_ENV entirely — only the nodeEnv parameter decides the branch', () => {
    const previousProcessEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      randomIntMock.mockReturnValueOnce(42);
      expect(mintVerificationCode('production')).toBe('000042');
    } finally {
      process.env.NODE_ENV = previousProcessEnv;
    }
  });
});
