import { describe, expect, it } from '@jest/globals';
import { MarineStatus } from '../marine.types';
import { EcmwfContractError } from './ecmwf.errors';
import { classifyFieldSeries, normaliseSample, statusForSample } from './ecmwf-support';

/**
 * STRUCTURAL tests for null classification — SPEC §14 acceptance criterion 4.
 *
 * Three claims: "every step missing → not_supported", "some steps missing → the field is still
 * carried and the gaps stay gaps", and the negative one that matters most — no code path
 * anywhere in here fills a gap with a neighbour, an average, or the previous step.
 */
describe('classifyFieldSeries', () => {
  it('calls a field not_supported only when EVERY step is missing', () => {
    const classification = classifyFieldSeries([null, null, null, Number.NaN]);

    expect(classification.support).toBe('not_supported');
    expect(classification.presentCount).toBe(0);
    expect(classification.missingCount).toBe(4);
    expect(classification.partial).toBe(false);
  });

  it('keeps a field supported when even one step carries a value', () => {
    // The F2 anomaly's shape: a cell three parameters treat as water and one does not. One real
    // sample is enough to prove the model carries the field here, and the rest are gaps.
    const classification = classifyFieldSeries([null, 0.9, Number.NaN, 1.1]);

    expect(classification.support).toBe('ok');
    expect(classification.presentCount).toBe(2);
    expect(classification.missingCount).toBe(2);
    expect(classification.partial).toBe(true);
  });

  it('treats 0 as a value, not as a gap', () => {
    // A flat sea and a bearing of due north are both legitimate zeroes. Falsy-checking them into
    // gaps would delete real data on exactly the calmest days.
    const classification = classifyFieldSeries([0, 0, 0]);

    expect(classification.support).toBe('ok');
    expect(classification.presentCount).toBe(3);
    expect(classification.partial).toBe(false);
  });

  it('counts NaN and null as the same kind of absence', () => {
    // NaN is how a GRIB bitmap arrives from the decoder; null is how our own normalisation
    // records it. One of them being counted as a value would publish a NaN as a number.
    expect(classifyFieldSeries([Number.NaN, Number.NaN])).toMatchObject({
      support: 'not_supported',
      missingCount: 2,
    });
    expect(classifyFieldSeries([null, null])).toMatchObject({
      support: 'not_supported',
      missingCount: 2,
    });
  });

  it('refuses to classify with no samples at all', () => {
    // Both defaults would be a lie: not_supported claims a permanent product truth never
    // observed, ok claims coverage never seen.
    expect(() => classifyFieldSeries([])).toThrow(EcmwfContractError);
  });

  it('never invents a value — the gaps it counts are the gaps it was given', () => {
    // The negative test. `classifyFieldSeries` returns counts, not data: there is no path by
    // which a missing step acquires a number, from a neighbour or from anywhere else.
    const samples: readonly (number | null)[] = [1, null, 3];
    const before = [...samples];

    const classification = classifyFieldSeries(samples);

    expect(samples).toEqual(before);
    expect(classification.presentCount + classification.missingCount).toBe(samples.length);
    expect(Object.values(classification)).not.toContain(2); // no interpolated midpoint anywhere
  });
});

describe('statusForSample', () => {
  const supported = classifyFieldSeries([1, null, 3]);
  const unsupported = classifyFieldSeries([null, null]);

  it('reports not_supported for every step of an unsupported field, value or not', () => {
    // The permanent statement wins: a reader told `no_data` on a land cell waits for a value that
    // is never coming.
    expect(statusForSample(unsupported, null)).toBe(MarineStatus.NotSupported);
    expect(statusForSample(unsupported, 1.2)).toBe(MarineStatus.NotSupported);
  });

  it('reports no_data for a gap in a supported field', () => {
    expect(statusForSample(supported, null)).toBe(MarineStatus.NoData);
    expect(statusForSample(supported, Number.NaN)).toBe(MarineStatus.NoData);
  });

  it('reports ok for a present value, including 0', () => {
    expect(statusForSample(supported, 1.2)).toBe(MarineStatus.Ok);
    expect(statusForSample(supported, 0)).toBe(MarineStatus.Ok);
  });
});

describe('normaliseSample', () => {
  it('turns absences into null and passes real numbers through untouched', () => {
    expect(normaliseSample(Number.NaN)).toBeNull();
    expect(normaliseSample(null)).toBeNull();
    expect(normaliseSample(undefined)).toBeNull();
    expect(normaliseSample(Number.POSITIVE_INFINITY)).toBeNull();

    // No rounding, no unit conversion, no clamping — what the provider produced is what is
    // recorded, so a derivation bug can never contaminate the stored value.
    expect(normaliseSample(0)).toBe(0);
    expect(normaliseSample(-1.771636962890625)).toBe(-1.771636962890625);
  });
});
