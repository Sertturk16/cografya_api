import { describe, expect, it } from '@jest/globals';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './auth.constants';
import { isPasswordPolicyCompliant } from './password-policy';

/** U-P1: boundary cases. The ceiling/floor are IMPORTED, never retyped as a literal number. */
describe('isPasswordPolicyCompliant', () => {
  it('accepts a password with lower + upper + digit at exactly the minimum length', () => {
    const value = `Aa1${'a'.repeat(Math.max(0, PASSWORD_MIN_LENGTH - 3))}`;
    expect(value).toHaveLength(PASSWORD_MIN_LENGTH);
    expect(isPasswordPolicyCompliant(value)).toBe(true);
  });

  it('accepts a password at exactly the maximum length', () => {
    const value = `Aa1${'a'.repeat(PASSWORD_MAX_LENGTH - 3)}`;
    expect(value).toHaveLength(PASSWORD_MAX_LENGTH);
    expect(isPasswordPolicyCompliant(value)).toBe(true);
  });

  it('rejects one character below the minimum length', () => {
    const value = `Aa1${'a'.repeat(Math.max(0, PASSWORD_MIN_LENGTH - 4))}`;
    expect(value).toHaveLength(PASSWORD_MIN_LENGTH - 1);
    expect(isPasswordPolicyCompliant(value)).toBe(false);
  });

  it('rejects one character above the maximum length', () => {
    const value = `Aa1${'a'.repeat(PASSWORD_MAX_LENGTH - 2)}`;
    expect(value).toHaveLength(PASSWORD_MAX_LENGTH + 1);
    expect(isPasswordPolicyCompliant(value)).toBe(false);
  });

  it('rejects a password with no lowercase letter', () => {
    expect(isPasswordPolicyCompliant('ABCDEF1234')).toBe(false);
  });

  it('rejects a password with no uppercase letter', () => {
    expect(isPasswordPolicyCompliant('abcdef1234')).toBe(false);
  });

  it('rejects a password with no digit', () => {
    expect(isPasswordPolicyCompliant('AbcdefGhij')).toBe(false);
  });

  it('accepts a password carrying all three classes at once', () => {
    expect(isPasswordPolicyCompliant('Synthetic-Pass1')).toBe(true);
  });

  it('rejects a non-string value without throwing', () => {
    expect(isPasswordPolicyCompliant(undefined)).toBe(false);
    expect(isPasswordPolicyCompliant(12345678)).toBe(false);
    expect(isPasswordPolicyCompliant(null)).toBe(false);
  });
});
