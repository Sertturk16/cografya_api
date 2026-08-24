import { describe, expect, it } from '@jest/globals';
import { canonicalizeEmail } from './email-canonicalization';

describe('canonicalizeEmail', () => {
  it('collapses surrounding whitespace and ASCII case variants', () => {
    expect(canonicalizeEmail('  Student.User@Example.Test\n')).toBe('student.user@example.test');
    expect(canonicalizeEmail('STUDENT.USER@EXAMPLE.TEST')).toBe('student.user@example.test');
  });

  it('is idempotent', () => {
    const canonical = canonicalizeEmail('student.user@example.test');
    expect(canonicalizeEmail(canonical)).toBe(canonical);
  });

  it('does not collapse distinct ASCII addresses', () => {
    expect(canonicalizeEmail('student.one@example.test')).not.toBe(
      canonicalizeEmail('student.two@example.test'),
    );
  });

  it('does not pretend to perform request validation', () => {
    expect(canonicalizeEmail('  NOT AN EMAIL  ')).toBe('not an email');
  });
});
