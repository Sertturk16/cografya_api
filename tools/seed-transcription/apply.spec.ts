/**
 * Applier tests. The fixture is a miniature seed file with invented placeholder data —
 * the rules under test are "which bytes move", not geography (→ CONVENTIONS §2).
 */
import { applyToSource } from './apply.ts';

const FIXTURE = `import { Continent } from '../../common/continent.enum';

export const X_COUNTRIES = [
  {
    isoCode: 'AA',
    nameTr: 'Alfa',
    nameEn: 'Alpha',
    continent: Continent.Africa,
    independenceNoteTr: 'bir not',
    introTr: null,
  },
  {
    isoCode: 'BB',
    nameTr: 'Beta',
    nameEn: 'Beta',
    continent: Continent.Africa,
    independenceNoteTr: 'başka not',
  },
];
`;

describe('applyToSource', () => {
  it('replaces an existing property in place', () => {
    const result = applyToSource('x.ts', FIXTURE, [
      { isoCode: 'AA', field: 'introTr', value: 'yeni değer' },
    ]);
    expect(result.updated).toBe(1);
    expect(result.inserted).toBe(0);
    expect(result.text).toContain("introTr: 'yeni değer',");
    expect(result.text).not.toContain('introTr: null');
  });

  it('inserts a missing property after the anchor field', () => {
    const result = applyToSource('x.ts', FIXTURE, [
      { isoCode: 'BB', field: 'introTr', value: 'eklendi' },
    ]);
    expect(result.inserted).toBe(1);
    const lines = result.text.split('\n');
    const anchor = lines.findIndex((line) => line.includes("independenceNoteTr: 'başka not'"));
    expect(lines[anchor + 1]).toContain('introTr:');
  });

  it('inserts multiple fields in seed field order', () => {
    const result = applyToSource('x.ts', FIXTURE, [
      { isoCode: 'BB', field: 'climateNoteTr', value: 'iklim' },
      { isoCode: 'BB', field: 'introTr', value: 'giriş' },
    ]);
    const text = result.text;
    expect(text.indexOf('introTr:')).toBeLessThan(text.indexOf('climateNoteTr:'));
  });

  it('touches nothing outside the properties it was asked to write', () => {
    const result = applyToSource('x.ts', FIXTURE, [
      { isoCode: 'AA', field: 'introTr', value: 'yeni değer' },
    ]);
    // Every line except the one that changed must survive byte-identically.
    const before = FIXTURE.split('\n').filter((line) => !line.includes('introTr'));
    const after = result.text.split('\n').filter((line) => !line.includes('introTr'));
    expect(after).toEqual(before);
  });

  it('leaves a country alone when it has no pending write', () => {
    const result = applyToSource('x.ts', FIXTURE, [
      { isoCode: 'AA', field: 'introTr', value: 'yeni değer' },
    ]);
    expect(result.text).toContain("isoCode: 'BB'");
    expect(result.text.match(/introTr/gu)).toHaveLength(1);
  });

  it('is a no-op when there is nothing to write', () => {
    expect(applyToSource('x.ts', FIXTURE, []).text).toBe(FIXTURE);
  });

  it('preserves the original indentation instead of doubling it', () => {
    // Regression: the splice starts at the line start, because `emitConcat` renders its
    // own indent. Splicing from the property name left the old indent in place.
    const result = applyToSource('x.ts', FIXTURE, [
      { isoCode: 'AA', field: 'introTr', value: 'yeni değer' },
    ]);
    const line = result.text.split('\n').find((l) => l.includes('introTr')) ?? '';
    expect(line).toBe("    introTr: 'yeni değer',");
  });

  it('leaves a field untouched when its committed value already matches', () => {
    // The committed seed is hand-wrapped; re-emitting an unchanged value would churn the
    // file without changing content. Bytes move only when the VALUE moves.
    const seeded = FIXTURE.replace('introTr: null,', "introTr: 'aynı değer',");
    const result = applyToSource('x.ts', seeded, [
      { isoCode: 'AA', field: 'introTr', value: 'aynı değer' },
    ]);
    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.text).toBe(seeded);
  });

  it('still rewrites when the value genuinely differs', () => {
    const seeded = FIXTURE.replace('introTr: null,', "introTr: 'eski değer',");
    const result = applyToSource('x.ts', seeded, [
      { isoCode: 'AA', field: 'introTr', value: 'yeni değer' },
    ]);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('treats a multi-chunk committed concatenation as already correct when it folds equal', () => {
    const seeded = FIXTURE.replace('introTr: null,', "introTr:\n      'aynı ' +\n      'değer',");
    const result = applyToSource('x.ts', seeded, [
      { isoCode: 'AA', field: 'introTr', value: 'aynı değer' },
    ]);
    expect(result.skipped).toBe(1);
    expect(result.text).toBe(seeded);
  });

  it('is idempotent — applying the same write twice changes nothing further', () => {
    const once = applyToSource('x.ts', FIXTURE, [
      { isoCode: 'AA', field: 'introTr', value: 'yeni değer' },
    ]).text;
    const twice = applyToSource('x.ts', once, [
      { isoCode: 'AA', field: 'introTr', value: 'yeni değer' },
    ]).text;
    expect(twice).toBe(once);
  });

  it('round-trips a multi-paragraph value through the emitted concatenation', () => {
    const value = `${'uzun bir cümle parçası '.repeat(12).trim()}\n\n${'ikinci paragraf '.repeat(12).trim()}`;
    const result = applyToSource('x.ts', FIXTURE, [{ isoCode: 'AA', field: 'introTr', value }]);
    // Re-read the produced source and confirm the folded value is unchanged.
    const emitted = result.text
      .split('\n')
      .filter((line) => line.trimStart().startsWith("'") || line.trimStart().startsWith('"'))
      .join('\n');
    expect(emitted.length).toBeGreaterThan(0);
    expect(result.text).toContain("'\\n\\n' +");
  });

  it('throws rather than guessing when no anchor field exists', () => {
    const orphan = `export const X = [{ isoCode: 'AA', nameTr: 'A', nameEn: 'A' }];\n`;
    expect(() =>
      applyToSource('x.ts', orphan, [{ isoCode: 'AA', field: 'introTr', value: 'v' }]),
    ).toThrow(/cannot place/u);
  });
});
