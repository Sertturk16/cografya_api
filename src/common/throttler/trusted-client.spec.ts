import { describe, expect, it } from '@jest/globals';
import { isTrustedClientRequest } from './trusted-client';

/**
 * Pure, DB-free coverage of the throttle-exemption decision — the security-critical core of
 * the trusted-client rate-limit bypass. Every branch is a spoofing/fail-closed concern, so
 * each is asserted directly rather than through the guard's DI wiring.
 */
describe('isTrustedClientRequest', () => {
  const SECRET = 'a'.repeat(40);

  it('grants the exemption only when the presented token matches the configured secret', () => {
    expect(isTrustedClientRequest(SECRET, SECRET)).toBe(true);
  });

  it('denies a wrong token (a spoof attempt cannot bypass the limit)', () => {
    expect(isTrustedClientRequest('b'.repeat(40), SECRET)).toBe(false);
  });

  it('denies a token of a different length (never matches, no length leak)', () => {
    expect(isTrustedClientRequest('a'.repeat(39), SECRET)).toBe(false);
    expect(isTrustedClientRequest('a'.repeat(41), SECRET)).toBe(false);
  });

  it('denies when no token is presented (anonymous request stays throttled)', () => {
    expect(isTrustedClientRequest(undefined, SECRET)).toBe(false);
  });

  it('denies an empty or whitespace token against a VALID secret (spoof stays throttled)', () => {
    // Distinct from the both-empty fail-closed case below: here a real secret IS configured,
    // so an empty/whitespace presented token must be hash-compared and rejected, not matched.
    expect(isTrustedClientRequest('', SECRET)).toBe(false);
    expect(isTrustedClientRequest('   ', SECRET)).toBe(false);
  });

  it('is FAIL-CLOSED when no secret is configured — the exemption does not exist', () => {
    // The normal state in dev/test/CI unless INTERNAL_REQUEST_TOKEN is deliberately set:
    // with no server-side secret, nothing is trusted regardless of what the caller sends.
    expect(isTrustedClientRequest(SECRET, undefined)).toBe(false);
    expect(isTrustedClientRequest(SECRET, '')).toBe(false);
    expect(isTrustedClientRequest(undefined, undefined)).toBe(false);
    expect(isTrustedClientRequest('', '')).toBe(false);
  });
});
