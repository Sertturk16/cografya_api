import { describe, expect, it } from '@jest/globals';
import { canonicalJson } from './canonical-json';

/**
 * Unit coverage for the ORDER-INDEPENDENCE property. These tests deliberately do NOT claim to
 * prove the fix works — an in-memory object literal cannot reproduce Postgres `jsonb` key
 * reordering, which IS the defect. That proof lives in `test/era5-load.e2e-spec.ts`, where the
 * document goes through a real Postgres and comes back.
 *
 * What these DO pin is the contract that test depends on: order of keys ignored, order of
 * array elements respected, nesting handled all the way down.
 */
describe('canonicalJson', () => {
  it('is blind to object key order, at every depth', () => {
    const a = {
      source: 's',
      period: { start: 1991, end: 2020 },
      months: [{ month: 1, mean: 10.4 }],
    };
    const b = {
      months: [{ mean: 10.4, month: 1 }],
      period: { end: 2020, start: 1991 },
      source: 's',
    };

    expect(canonicalJson(a)).toBe(canonicalJson(b));
    // Sanity: the naive comparison the load phase used to make DOES differ on this pair, so
    // the test above is not vacuous.
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('respects array order — months[0] is January, so a reordered array is a real change', () => {
    expect(canonicalJson([{ month: 1 }, { month: 2 }])).not.toBe(
      canonicalJson([{ month: 2 }, { month: 1 }]),
    );
  });

  it('still distinguishes different values, missing keys and null-vs-absent', () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
    expect(canonicalJson({ a: 1, b: 2 })).not.toBe(canonicalJson({ a: 1 }));
    expect(canonicalJson({ a: null })).not.toBe(canonicalJson({}));
  });

  it('handles the primitive and null leaves the series actually contains', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(10.4)).toBe('10.4');
    expect(canonicalJson('1968-12-26')).toBe('"1968-12-26"');
    expect(canonicalJson({ date: null, value: -4.2 })).toBe('{"date":null,"value":-4.2}');
  });
});
