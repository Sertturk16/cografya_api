import { describe, expect, it } from '@jest/globals';
import { describeError, describeErrorWithName } from './describe-error';

/**
 * These tests pin the two properties the 24 call sites depend on: the fallback is a CONSTANT (it
 * can never throw, whatever was thrown), and the two forms differ only by the name prefix.
 */
describe('describeError', () => {
  it('returns the message of a real Error', () => {
    expect(describeError(new Error('connection refused'))).toBe('connection refused');
  });

  it('keeps a subclass message, without its class name', () => {
    class UpstreamishError extends Error {}
    expect(describeError(new UpstreamishError('bad gateway'))).toBe('bad gateway');
  });

  it('falls back to the one constant for every non-Error', () => {
    expect(describeError('a thrown string')).toBe('unknown');
    expect(describeError(undefined)).toBe('unknown');
    expect(describeError(null)).toBe('unknown');
    expect(describeError(42)).toBe('unknown');
    expect(describeError({ message: 'looks like an error, is not one' })).toBe('unknown');
  });

  it('CANNOT throw on a value whose stringification throws', () => {
    // The reason the fallback is a constant rather than `String(error)`. A null-prototype object
    // has no `toString`, so `String(value)` raises — inside a catch block, which is the worst
    // place in a program to raise a second error.
    const hostile = Object.create(null) as unknown;
    expect(() => String(hostile)).toThrow();
    expect(describeError(hostile)).toBe('unknown');
  });
});

describe('describeErrorWithName', () => {
  it('prefixes the error class name, which is the whole point of the second form', () => {
    expect(describeErrorWithName(new TypeError('fetch failed'))).toBe('TypeError: fetch failed');
  });

  it('reports the RUNTIME name, so a DOMException reads as its own kind', () => {
    // The distinction the ingest and warmup targets exist to log: an aborted call and a broken
    // one demand different responses from whoever reads the line.
    expect(describeErrorWithName(new DOMException('The operation was aborted', 'AbortError'))).toBe(
      'AbortError: The operation was aborted',
    );
  });

  it('shares the same constant fallback as the short form', () => {
    expect(describeErrorWithName('a thrown string')).toBe('unknown');
    expect(describeErrorWithName(Object.create(null) as unknown)).toBe('unknown');
  });

  it('differs from the short form ONLY by the name prefix', () => {
    const error = new RangeError('index out of range');
    expect(describeErrorWithName(error)).toBe(`${error.name}: ${describeError(error)}`);
  });
});
