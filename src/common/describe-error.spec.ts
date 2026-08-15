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

  it('reports the RUNTIME name, so an aborted call reads as its own kind', () => {
    // The distinction the ingest and warmup targets exist to log: an aborted call and a broken
    // one demand different responses from whoever reads the line.
    class AbortError extends Error {
      override readonly name = 'AbortError';
    }

    expect(describeErrorWithName(new AbortError('The operation was aborted'))).toBe(
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

describe('the contract both forms owe', () => {
  it('never disagrees with `instanceof Error` — which is exactly what the call sites do today', () => {
    // Stated as a relationship rather than as fixed strings, because one of these candidates is
    // environment-dependent. A `DOMException` IS an Error in Node (measured: `new
    // DOMException('x', 'AbortError') instanceof Error === true`, and an aborted
    // AbortController's `reason` likewise), but Jest's sandbox can hand the two sides different
    // `Error` globals and answer `false` for the same value. Pinning either literal would make
    // this suite assert something untrue of the other environment; pinning the RELATIONSHIP is
    // true in both, and it is the property the conversion actually needs — that swapping a
    // hand-written `instanceof` check takes the same BRANCH at every site.
    //
    // What that costs, recorded so the conversion round is not surprised: nothing now pins that a
    // real `AbortSignal.timeout()` abort renders as `AbortError: The operation was aborted`. In
    // this realm the `DOMException` below evaluates `instanceof Error` as `false`, so the property
    // is unpinnable here at all — it is not a gap that a better assertion would close. And the
    // branch is only half the swap: what the ELSE branch RETURNS is not inherited, which is why
    // `describe-error.ts` names the sites whose fallback must not be converted.
    const candidates: readonly unknown[] = [
      new Error('plain'),
      new TypeError('typed'),
      new DOMException('The operation was aborted', 'AbortError'),
      'a thrown string',
      42,
      null,
      undefined,
      { message: 'looks like an error, is not one' },
    ];

    // Guards the guard, the way both sibling specs in this PR guard their tables: an emptied
    // `candidates` would leave this case passing having asserted nothing at all.
    expect(candidates).toHaveLength(8);

    for (const candidate of candidates) {
      expect(describeError(candidate)).toBe(
        candidate instanceof Error ? candidate.message : 'unknown',
      );
      expect(describeErrorWithName(candidate)).toBe(
        candidate instanceof Error ? `${candidate.name}: ${candidate.message}` : 'unknown',
      );
    }
  });
});
