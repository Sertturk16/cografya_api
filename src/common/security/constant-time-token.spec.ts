import { describe, expect, it } from '@jest/globals';
import { constantTimeTokenMatch } from './constant-time-token';

/**
 * Pure, DB-free coverage of the shared secret-comparison primitive. `isTrustedClientRequest`
 * (`trusted-client.spec.ts`) and `docs-gate.ts`'s Basic-auth check both rest on this function
 * doing exactly what it did before the move — this file is what proves that, independent of
 * either caller.
 */
describe('constantTimeTokenMatch', () => {
  const SECRET = 'a'.repeat(40);

  it('matches when presented equals configured', () => {
    expect(constantTimeTokenMatch(SECRET, SECRET)).toBe(true);
  });

  it('does not match a wrong value', () => {
    expect(constantTimeTokenMatch('b'.repeat(40), SECRET)).toBe(false);
  });

  it('does not match a value of a different length (no length leak)', () => {
    expect(constantTimeTokenMatch('a'.repeat(39), SECRET)).toBe(false);
    expect(constantTimeTokenMatch('a'.repeat(41), SECRET)).toBe(false);
  });

  it('is false when nothing is presented', () => {
    expect(constantTimeTokenMatch(undefined, SECRET)).toBe(false);
  });

  it('is false for an empty or whitespace presented value against a VALID configured secret', () => {
    expect(constantTimeTokenMatch('', SECRET)).toBe(false);
    expect(constantTimeTokenMatch('   ', SECRET)).toBe(false);
  });

  it('is fail-closed when no secret is configured, whatever is presented', () => {
    expect(constantTimeTokenMatch(SECRET, undefined)).toBe(false);
    expect(constantTimeTokenMatch(SECRET, '')).toBe(false);
    expect(constantTimeTokenMatch(undefined, undefined)).toBe(false);
    expect(constantTimeTokenMatch('', '')).toBe(false);
  });
});
