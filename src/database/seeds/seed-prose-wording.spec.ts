import { describe, expect, it } from '@jest/globals';
import { SEED_COUNTRIES } from './country.seed-data';
import { SEED_PROVINCES } from './province.seed-data';
import { SEED_REGIONS } from './region.seed-data';

/**
 * Seed prose is shown to students as it is. Pipeline vocabulary once leaked into it
 * ("bu platformda seed edilmiş illeri"), so no Turkish text field may mention it.
 */
const DEV_TERM = /\bseed|\bdataset\b|\bfixture\b/i;

function leaks(corpus: readonly object[]): string[] {
  return corpus.flatMap((row) =>
    Object.entries(row)
      .filter(
        ([key, value]) => key.endsWith('Tr') && typeof value === 'string' && DEV_TERM.test(value),
      )
      .map(([key]) => `${(row as { nameTr?: string }).nameTr ?? '?'}.${key}`),
  );
}

describe('seed prose wording', () => {
  it.each([
    ['regions', SEED_REGIONS],
    ['provinces', SEED_PROVINCES],
    ['countries', SEED_COUNTRIES],
  ] as const)('no text field in the %s corpus uses pipeline vocabulary', (_, corpus) => {
    expect(leaks(corpus)).toEqual([]);
  });
});
