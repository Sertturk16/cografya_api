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

import { mintOpaqueToken, mintVerificationCode } from './opaque-token';

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
      const code = mintVerificationCode();
      expect(code).toMatch(/^[0-9]{6}$/);
    }
  });

  it('produces "000000" when the underlying randomInt draws zero — a leading-zero code is a valid code, not an empty one', () => {
    randomIntMock.mockReturnValueOnce(0);
    expect(mintVerificationCode()).toBe('000000');
  });

  it('shows no modulo bias across the leading digit in 100k draws', () => {
    const leadingDigitCounts = new Array<number>(10).fill(0);
    const samples = 100_000;
    for (let i = 0; i < samples; i += 1) {
      const code = mintVerificationCode();
      const leadingDigit = Number(code[0]);
      leadingDigitCounts[leadingDigit] = (leadingDigitCounts[leadingDigit] ?? 0) + 1;
    }
    for (const count of leadingDigitCounts) {
      expect(count).toBeGreaterThan(samples / 10 - 1_500);
      expect(count).toBeLessThan(samples / 10 + 1_500);
    }
  });
});
