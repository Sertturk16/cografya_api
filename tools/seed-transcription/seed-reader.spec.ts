/**
 * Seed-reader tests. The fixture is a miniature seed file with invented placeholder data —
 * the rules under test are "what gets indexed", not geography (→ CONVENTIONS §2).
 *
 * WHY THIS FILE EXISTS (SPEC §10-M1): the dalga-1 wave adds properties to seed rows that the
 * reader has never seen — an ENUM MEMBER REFERENCE (`entityType`) and plain strings that are
 * NOT narrative fields (`statusLabelTr` / `statusLabelEn`). Both were reasoned about from the
 * code and judged safe; reasoning is not a gate. A reader that quietly stopped recognising a
 * row would make `check` report "0 drifted" over rows it never looked at — a false green on
 * the exact command ENGINEERING §8 mandates as the content-fidelity gate. So this pins it.
 */
import { indexSeedSource, syntaxErrorsIn } from './seed-reader.ts';

const FIXTURE = `import { Continent } from '../../common/continent.enum';
import { CountryEntityType } from '../../common/country-entity-type.enum';

export const X_COUNTRIES = [
  {
    isoCode: 'AA',
    nameTr: 'Alfa',
    nameEn: 'Alpha',
    continent: Continent.Africa,
    entityType: CountryEntityType.Territory,
    statusLabelTr: 'Test Özerk Bölgesi',
    statusLabelEn: 'Test Autonomous Territory',
    areaIsApproximate: true,
    governanceNoteTr: 'Yönetim notu birinci parça ' + 've ikinci parça.',
    introTr: null,
  },
];
`;

describe('indexSeedSource — the dalga-1 row shape', () => {
  it('still recognises a row that carries an enum-member property', () => {
    // `entityType: CountryEntityType.Territory` is a property-access expression, so the string
    // fold returns null for it. That must skip the PROPERTY, never the ROW: row detection keys
    // on the isoCode/nameTr/nameEn triple, all three of which are ordinary literals.
    const { countries } = indexSeedSource('x.ts', FIXTURE);
    expect(countries).toEqual([{ isoCode: 'AA', nameTr: 'Alfa', nameEn: 'Alpha', file: 'x.ts' }]);
  });

  it('indexes a new narrative field, folding its concatenation exactly', () => {
    const { fields } = indexSeedSource('x.ts', FIXTURE);
    expect(fields).toEqual([
      {
        isoCode: 'AA',
        field: 'governanceNoteTr',
        value: 'Yönetim notu birinci parça ve ikinci parça.',
        file: 'x.ts',
      },
    ]);
  });

  it('does NOT index the status labels — approved card copy is not prose', () => {
    // They fold fine (they are plain strings), so only `isNarrativeField` keeps them out. If
    // that filter ever slipped, `check` would start reporting owner-approved labels as drifted
    // prose against drafts that never mention them.
    const { fields } = indexSeedSource('x.ts', FIXTURE);
    expect(fields.map((f) => f.field)).not.toContain('statusLabelTr');
    expect(fields.map((f) => f.field)).not.toContain('statusLabelEn');
  });

  it('ignores a null narrative field rather than indexing an empty value', () => {
    const { fields } = indexSeedSource('x.ts', FIXTURE);
    expect(fields.map((f) => f.field)).not.toContain('introTr');
  });
});

describe('indexSeedSource — general behaviour', () => {
  it('ignores a nested object literal that is not a country row', () => {
    const source = `export const X = [{ meta: { isoCode: 'AA' }, nameTr: 'Alfa', nameEn: 'Alpha' }];\n`;
    // The inner literal has isoCode but no names; the outer has names but no isoCode. Neither
    // is a country, so nothing is indexed.
    expect(indexSeedSource('x.ts', source).countries).toEqual([]);
  });

  it('is deterministic and pure — the same text always yields the same index', () => {
    expect(indexSeedSource('x.ts', FIXTURE)).toEqual(indexSeedSource('x.ts', FIXTURE));
  });

  it('syntaxErrorsIn is the shared definition of "valid" — empty means it parses', () => {
    // The same function guards the applier's output before it is written (`cli.ts`) and every
    // applier test's result (`apply.spec.ts`). One definition, so the tool and its tests
    // cannot disagree about what shipped.
    expect(syntaxErrorsIn(`export const X = [{ a: 1, b: 2 }];\n`)).toEqual([]);
    expect(syntaxErrorsIn(`export const X = [{ a: 1\n  b: 2 }];\n`)).toEqual([
      expect.stringContaining("',' expected"),
    ]);
  });

  it('records the label it was given on every result', () => {
    const { fields, countries } = indexSeedSource('africa.countries.ts', FIXTURE);
    expect(countries.every((c) => c.file === 'africa.countries.ts')).toBe(true);
    expect(fields.every((f) => f.file === 'africa.countries.ts')).toBe(true);
  });

  it('reports a syntax error instead of silently under-indexing a broken file', () => {
    // `ts.createSourceFile` is ERROR-TOLERANT: it returns a tree for a file with a missing
    // comma, just one that has lost properties or whole rows. Without this signal the index is
    // quietly incomplete and `check` prints "0 drifted" over fields it never read — a false
    // green on the mandated content-fidelity gate. The CLI refuses when this is non-empty.
    const broken = FIXTURE.replace("nameEn: 'Alpha',", "nameEn: 'Alpha'");
    const { syntaxErrors } = indexSeedSource('broken.countries.ts', broken);
    expect(syntaxErrors.length).toBeGreaterThan(0);
    expect(syntaxErrors[0]).toContain('broken.countries.ts');
  });

  it('reports no syntax errors for a healthy file', () => {
    expect(indexSeedSource('x.ts', FIXTURE).syntaxErrors).toEqual([]);
  });

  it('indexes independenceNoteTr now that it is a narrative field', () => {
    // Ruling S2 (2026-08-02): the field joined `NARRATIVE_FIELDS`, so the reader must see it —
    // otherwise `check` could never compare it against a draft.
    const source = FIXTURE.replace('introTr: null,', "independenceNoteTr: 'bir tarih notu',");
    const { fields } = indexSeedSource('x.ts', source);
    expect(fields.map((f) => f.field)).toContain('independenceNoteTr');
  });
});
