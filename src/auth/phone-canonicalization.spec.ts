import { describe, expect, it } from '@jest/globals';
import { canonicalizePhone } from './phone-canonicalization';

const MOBILE_SHAPE = /^\+905[0-9]{9}$/;

describe('canonicalizePhone', () => {
  it('folds a leading-zero local form onto +90…', () => {
    expect(canonicalizePhone('05321234567')).toBe('+905321234567');
  });

  it('folds a bare-country-code form (no +) onto +90…', () => {
    expect(canonicalizePhone('905321234567')).toBe('+905321234567');
  });

  it('leaves an already-canonical +90 form untouched', () => {
    expect(canonicalizePhone('+905321234567')).toBe('+905321234567');
  });

  it('strips spaces, hyphens and parentheses before folding the prefix', () => {
    expect(canonicalizePhone('+90 532 123 45 67')).toBe('+905321234567');
    expect(canonicalizePhone('0532-123-45-67')).toBe('+905321234567');
    expect(canonicalizePhone('(0532) 123 4567')).toBe('+905321234567');
    expect(canonicalizePhone('90 (532) 123-45-67')).toBe('+905321234567');
  });

  it('every canonicalized valid mobile form matches the DTO-level mobile shape', () => {
    for (const raw of [
      '05321234567',
      '905321234567',
      '+905321234567',
      '+90 532 123 45 67',
      '0532-123-45-67',
      '(0532) 123 4567',
    ]) {
      expect(canonicalizePhone(raw)).toMatch(MOBILE_SHAPE);
    }
  });

  it('does NOT invent a country code for a value carrying neither known prefix', () => {
    // A bare 10-digit number with no leading 0 or 90 has no local-dialling convention to
    // fold — this function must not guess one. Downstream `@Matches` refuses the result.
    expect(canonicalizePhone('5321234567')).toBe('5321234567');
    expect(canonicalizePhone('5321234567')).not.toMatch(MOBILE_SHAPE);
  });

  it('a landline (0212…) canonicalizes but still fails the mobile shape — the DTO layer catches it', () => {
    expect(canonicalizePhone('0212 555 44 33')).toBe('+902125554433');
    expect(canonicalizePhone('0212 555 44 33')).not.toMatch(MOBILE_SHAPE);
  });
});
