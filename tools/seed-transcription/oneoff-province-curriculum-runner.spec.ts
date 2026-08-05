/**
 * Unit spec for the M1 müfredat-mapping lane.
 *
 * Nothing here asserts a province FACT (→ CONVENTIONS §2): every fixture below is a synthetic
 * two-or-three-row table. The subject is the CHECKER — the thing that will be trusted to say
 * "the 81 published names still correspond to their source", which is only worth anything if
 * its refusals are pinned.
 */
import {
  BELIRSIZ_OVERRIDES,
  compare,
  parseBriefRows,
  parseCurriculumArgs,
  readSeedConstants,
  type BelirsizOverride,
  type BriefRow,
  type CommittedCurriculumRow,
} from './oneoff-province-curriculum-runner.ts';
import ts from 'typescript';

const HEADER = '| İl | Müfredat iklim adı | Köppen | Kaynak | Durum | ⚑ |';
const SEPARATOR = '| --- | --- | --- | --- | --- | --- |';

function briefWith(...rows: string[]): string {
  return [
    '## 3. 81 il tablosu',
    '',
    '### 3.1 Marmara Bölgesi (2)',
    '',
    HEADER,
    SEPARATOR,
    ...rows,
    '',
  ].join('\n');
}

function seedRow(overrides: Partial<CommittedCurriculumRow> = {}): CommittedCurriculumRow {
  return {
    plate: '01',
    nameTr: 'Alfa',
    climateKoppen: 'Csa',
    climateCurriculumNameTr: 'Akdeniz iklimi',
    curriculumConstant: 'CURRICULUM_AKDENIZ',
    ...overrides,
  };
}

function briefRow(overrides: Partial<BriefRow> = {}): BriefRow {
  return {
    name: 'Alfa',
    curriculumCell: 'Akdeniz iklimi',
    koppen: 'Csa',
    status: 'NET',
    line: 7,
    ...overrides,
  };
}

const OVERRIDE: BelirsizOverride = {
  name: 'Beta',
  curriculumName: 'Marmara geçiş iklimi',
  ruling: 'DEC test',
};

describe('parseBriefRows', () => {
  it('reads the province rows of a §3 table and drops header/separator', () => {
    const { rows, problems } = parseBriefRows(
      briefWith('| Alfa | Akdeniz iklimi | Csa | K-1m | NET | = |'),
    );
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Alfa');
    expect(rows[0]?.curriculumCell).toBe('Akdeniz iklimi');
    expect(rows[0]?.koppen).toBe('Csa');
    expect(rows[0]?.status).toBe('NET');
  });

  it('strips the emphasis the brief puts on its notable rows', () => {
    // The brief bolds the cells it wants a reader to notice; the value is the same value.
    const { rows } = parseBriefRows(
      briefWith('| **Alfa** | **Akdeniz iklimi** | Csa | K-1m | NET | = |'),
    );
    expect(rows[0]?.name).toBe('Alfa');
    expect(rows[0]?.curriculumCell).toBe('Akdeniz iklimi');
  });

  it('keeps the BELİRSİZ marker so the decision table can be cross-checked against it', () => {
    const { rows } = parseBriefRows(
      briefWith('| Beta | **BELİRSİZ** — Marmara geçiş / Akdeniz | Csa | K-1m | BELİRSİZ | — |'),
    );
    expect(rows[0]?.status).toBe('BELİRSİZ');
  });

  it('REFUSES to read cells positionally when the table header changed shape', () => {
    // The whole checker is positional. A reordered column would silently compare a Köppen code
    // against a curriculum name and report a disagreement whose message points nowhere.
    const markdown = briefWith('| Alfa | Csa | Akdeniz iklimi | K-1m | NET | = |').replace(
      HEADER,
      '| İl | Köppen | Müfredat iklim adı | Kaynak | Durum | ⚑ |',
    );
    expect(parseBriefRows(markdown).problems).toHaveLength(1);
  });

  it('ignores tables outside §3.1-3.7 (the §3.8 distribution summary is not province data)', () => {
    const markdown = [
      briefWith('| Alfa | Akdeniz iklimi | Csa | K-1m | NET | = |'),
      '### 3.8 Sınıf başına il dağılımı (NET satırlar)',
      '',
      '| Müfredat iklim adı | NET il sayısı |',
      '| --- | --- |',
      '| Akdeniz iklimi | 14 |',
      '',
    ].join('\n');
    expect(parseBriefRows(markdown).rows).toHaveLength(1);
  });

  it('parses a file with no §3 tables to zero rows (the caller turns that into a refusal)', () => {
    expect(parseBriefRows('# Bir özet\n\nHiç tablo yok.\n').rows).toEqual([]);
  });
});

describe('readSeedConstants', () => {
  it('folds top-level string consts, including `+` chains, and ignores non-strings', () => {
    const source = ts.createSourceFile(
      'x.ts',
      [
        "const CURRICULUM_A = 'Akdeniz iklimi';",
        "const SPLIT = 'İç Anadolu ' + 'karasal iklimi';",
        'const NUMBER = 42;',
      ].join('\n'),
      ts.ScriptTarget.Latest,
      true,
    );
    const constants = readSeedConstants(source);
    expect(constants.get('CURRICULUM_A')).toBe('Akdeniz iklimi');
    expect(constants.get('SPLIT')).toBe('İç Anadolu karasal iklimi');
    expect(constants.has('NUMBER')).toBe(false);
  });
});

describe('compare', () => {
  /** One NET row and one BELİRSİZ row, all three sides in agreement. */
  const AGREEING_BRIEF: BriefRow[] = [
    briefRow(),
    briefRow({ name: 'Beta', status: 'BELİRSİZ', curriculumCell: 'BELİRSİZ — a / b', line: 8 }),
  ];
  const AGREEING_SEED: CommittedCurriculumRow[] = [
    seedRow(),
    seedRow({
      plate: '02',
      nameTr: 'Beta',
      climateCurriculumNameTr: 'Marmara geçiş iklimi',
      curriculumConstant: 'CURRICULUM_MARMARA_GECIS',
    }),
  ];

  it('is silent when the brief, the overrides and the seed all agree', () => {
    expect(compare(AGREEING_BRIEF, AGREEING_SEED, [OVERRIDE])).toEqual([]);
  });

  it('reports an override that still claims a row the brief has since resolved (staleness)', () => {
    // The decision table can outlive its own justification. Preferring one side silently is how
    // a stale ruling keeps publishing a name its source no longer supports.
    expect(
      compare([briefRow()], [seedRow()], [{ ...OVERRIDE, name: 'Alfa', ruling: 'DEC 2026-01-01' }]),
    ).toEqual([
      '  01 Alfa — the brief now resolves this row (NET) but a BELİRSİZ override ' +
        '(DEC 2026-01-01) still claims it — the override is stale',
    ]);
  });

  it('reports an override naming a province the seed does not carry', () => {
    expect(compare([briefRow()], [seedRow()], [OVERRIDE])).toContain(
      '  Beta — override names a province the seed does not have',
    );
  });

  it('reports a name that drifted from the brief', () => {
    const problems = compare(
      [briefRow({ curriculumCell: 'Karadeniz iklimi' })],
      [seedRow()],
      [OVERRIDE],
    );
    expect(problems.some((problem) => problem.includes('"Karadeniz iklimi" != seed'))).toBe(true);
  });

  it('reports a Köppen mismatch — the row-shift detector', () => {
    // THE JOIN THAT MATTERS. A table transcribed one row off still produces plausible names;
    // the Köppen column is what stops agreeing, which is why it is checked on every row.
    const problems = compare([briefRow({ koppen: 'Cfb' })], [seedRow()], [OVERRIDE]);
    expect(problems.some((problem) => problem.includes('the tables are misaligned'))).toBe(true);
  });

  /** A brief row the brief itself refuses to decide — the shape the override table answers. */
  const BELIRSIZ_ROW = briefRow({
    name: 'Beta',
    status: 'BELİRSİZ',
    curriculumCell: 'BELİRSİZ — a / b',
  });

  it('resolves a BELİRSİZ row from the override table, not from the brief', () => {
    const rows = [BELIRSIZ_ROW];
    const seed = [
      seedRow({
        plate: '02',
        nameTr: 'Beta',
        climateCurriculumNameTr: 'Marmara geçiş iklimi',
        curriculumConstant: 'CURRICULUM_MARMARA_GECIS',
      }),
    ];
    expect(compare(rows, seed, [OVERRIDE])).toEqual([]);
  });

  it('fails a BELİRSİZ row whose seed value disagrees with the ruling', () => {
    const seed = [
      seedRow({ plate: '02', nameTr: 'Beta', climateCurriculumNameTr: 'Akdeniz iklimi' }),
    ];
    expect(compare([BELIRSIZ_ROW], seed, [OVERRIDE])).toEqual([
      '  02 Beta — seed "Akdeniz iklimi" != DEC test "Marmara geçiş iklimi"',
    ]);
  });

  it('fails a BELİRSİZ row no override covers (an unruled row must not be published)', () => {
    const rows = [{ ...BELIRSIZ_ROW, name: 'Alfa' }];
    expect(compare(rows, [seedRow()], [OVERRIDE])).toEqual([
      '  01 Alfa — the brief marks this row BELİRSİZ but no owner override covers it (brief line 7)',
      '  Beta — override names a province the seed does not have',
    ]);
  });

  it('fails when the brief and the seed cover different provinces (both directions)', () => {
    const missingFromSeed = compare([briefRow({ name: 'Gama' })], [seedRow()], [OVERRIDE]);
    expect(missingFromSeed).toContain('  Gama (brief line 7) — no seed row of that name');
    expect(missingFromSeed).toContain("  01 Alfa — seeded but absent from the brief's §3 tables");
  });

  it('fails when a seed row references a constant this file could not resolve', () => {
    // The real failure this catches: someone renames a CURRICULUM_* constant and the row keeps
    // compiling because the new name exists — but this checker no longer knows the VALUE, so it
    // must refuse rather than skip the row.
    const problems = compare(
      [briefRow()],
      [seedRow({ climateCurriculumNameTr: null, curriculumConstant: 'CURRICULUM_TYPO' })],
      [OVERRIDE],
    );
    expect(problems).toContain(
      '  01 Alfa — no curriculum name: the constant CURRICULUM_TYPO could not be resolved in this file',
    );
  });

  it('matches names across diacritic spellings, both directions', () => {
    // The seed writes `Hakkari` while sources write `Hakkâri`; the fold exists for exactly that.
    const problems = compare(
      [briefRow({ name: 'Hakkâri' })],
      [seedRow({ plate: '30', nameTr: 'Hakkari' })],
      [OVERRIDE],
    );
    expect(problems.some((problem) => problem.includes('no seed row of that name'))).toBe(false);
  });
});

describe('BELIRSIZ_OVERRIDES', () => {
  it('covers exactly the ten rows the brief leaves undecided, each with a ruling', () => {
    // Not a fact assertion: the SIZE and the shape are the wave's bookkeeping. A row silently
    // dropped here would make its BELİRSİZ brief row fail loudly — good — but a row ADDED here
    // for a province the brief resolved would quietly outrank its own source, which is the case
    // `compare` reports as stale and this pins from the other side.
    expect(BELIRSIZ_OVERRIDES).toHaveLength(10);
    expect(new Set(BELIRSIZ_OVERRIDES.map((o) => o.name)).size).toBe(10);
    for (const override of BELIRSIZ_OVERRIDES) {
      expect(override.ruling).toMatch(/^DEC \d{4}-\d{2}-\d{2}/u);
      expect(override.curriculumName.length).toBeGreaterThan(0);
    }
  });
});

describe('parseCurriculumArgs', () => {
  it('accepts both modes with at least one path', () => {
    expect(parseCurriculumArgs(['check', 'a.md'])).toEqual({ mode: 'check', briefPaths: ['a.md'] });
    expect(parseCurriculumArgs(['emit', 'a.md', 'b.md'])).toEqual({
      mode: 'emit',
      briefPaths: ['a.md', 'b.md'],
    });
  });

  it('rejects an unknown mode or a missing path (the entry point exits 2)', () => {
    expect(parseCurriculumArgs([])).toBeNull();
    expect(parseCurriculumArgs(['check'])).toBeNull();
    expect(parseCurriculumArgs(['apply', 'a.md'])).toBeNull();
  });
});
