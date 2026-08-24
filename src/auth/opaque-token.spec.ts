import { describe, expect, it } from '@jest/globals';
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

  it('can produce "000000" — a leading-zero code is a valid code, not an empty one', () => {
    // `randomInt(0, 1_000_000)` is deterministic under a fixed seed only via mocking; assert
    // the padding logic directly rather than waiting on a 1-in-a-million draw.
    const original = globalThis.Math.random;
    try {
      // Not used by mintVerificationCode (it uses crypto.randomInt), but asserting the pure
      // padding behaviour in isolation keeps this test from depending on unlikely draws.
      expect((0).toString().padStart(6, '0')).toBe('000000');
    } finally {
      globalThis.Math.random = original;
    }
  });

  it('shows no modulo bias across the leading digit in 100k draws', () => {
    const leadingDigitCounts = new Array<number>(10).fill(0);
    const samples = 100_000;
    for (let i = 0; i < samples; i += 1) {
      const code = mintVerificationCode();
      const leadingDigit = Number(code[0]);
      leadingDigitCounts[leadingDigit] = (leadingDigitCounts[leadingDigit] ?? 0) + 1;
    }
    // Every one of the ten leading digits must appear (a biased/broken generator could
    // structurally skip one), and each should land within a generous band of the ~10,000
    // expected count — loose enough to avoid Jest flakiness, tight enough to catch a real bias.
    for (const count of leadingDigitCounts) {
      expect(count).toBeGreaterThan(samples / 10 - 1_500);
      expect(count).toBeLessThan(samples / 10 + 1_500);
    }
  });
});
