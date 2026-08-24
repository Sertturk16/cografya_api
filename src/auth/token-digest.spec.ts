import { describe, expect, it } from '@jest/globals';
import { constantTimeEquals, hmacSha256, sha256 } from './token-digest';

describe('sha256', () => {
  it('matches the known FIPS 180-4 test vectors', () => {
    expect(sha256('').toString('hex')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256('abc').toString('hex')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('returns exactly 32 raw bytes — the length every `octet_length(...) = 32` CHECK assumes', () => {
    expect(sha256('anything').length).toBe(32);
  });

  it('accepts a Buffer input identically to the equivalent string', () => {
    expect(sha256(Buffer.from('abc')).equals(sha256('abc'))).toBe(true);
  });
});

describe('hmacSha256', () => {
  it('matches RFC 4231 test case 1', () => {
    const key = Buffer.from('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b', 'hex');
    expect(hmacSha256(key, 'Hi There').toString('hex')).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    );
  });

  it('returns exactly 32 raw bytes', () => {
    expect(hmacSha256('pepper', 'verify:user:123456').length).toBe(32);
  });

  it('separates domains that share a pepper — a bare digest collision would defeat the domain tag', () => {
    // Same pepper, same subject, different domain PREFIX — the whole point of S8's shared
    // pepper design is that these must never collide.
    const pepper = 'shared-pepper';
    const verify = hmacSha256(pepper, 'verify:same-subject');
    const rate = hmacSha256(pepper, 'rate:same-subject');
    expect(verify.equals(rate)).toBe(false);
  });

  it('produces a different digest under a different pepper for the same input', () => {
    const a = hmacSha256('pepper-a', 'verify:1:000000');
    const b = hmacSha256('pepper-b', 'verify:1:000000');
    expect(a.equals(b)).toBe(false);
  });
});

describe('constantTimeEquals', () => {
  it('returns true for identical buffers', () => {
    const buf = sha256('same-input');
    expect(constantTimeEquals(buf, Buffer.from(buf))).toBe(true);
  });

  it('returns false for differing buffers of the same length', () => {
    expect(constantTimeEquals(sha256('a'), sha256('b'))).toBe(false);
  });

  it('returns false — and does NOT throw — on a length mismatch', () => {
    // `crypto.timingSafeEqual` throws on a length mismatch; that throw is exactly the side
    // channel this function exists to close (a caller could learn the stored digest's length
    // from whether the call throws).
    expect(() => constantTimeEquals(Buffer.alloc(31), Buffer.alloc(32))).not.toThrow();
    expect(constantTimeEquals(Buffer.alloc(31), Buffer.alloc(32))).toBe(false);
    expect(constantTimeEquals(Buffer.alloc(0), Buffer.alloc(32))).toBe(false);
  });
});
