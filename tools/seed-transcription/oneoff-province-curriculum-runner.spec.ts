/**
 * Unit spec for the M1 müfredat-mapping lane.
 *
 * Nothing here asserts a province FACT (→ CONVENTIONS §2): every fixture below is a synthetic
 * two-or-three-row table. The subject is the CHECKER — the thing that will be trusted to say
 * "the 81 published names still correspond to their source", which is only worth anything if
 * its refusals are pinned.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  BELIRSIZ_OVERRIDES,
  compare,
  parseBriefRows,
  parseCurriculumArgs,
  readSeedConstants,
  runCurriculum,
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
    // Sources spell some province names with a circumflex the seed drops; the fold exists for
    // exactly that. The pair is SYNTHETIC on purpose — the real Hakkâri/Hakkari pair would put a
    // province name into a fixture file that is otherwise entirely invented (→ PR #97, TA97-M2).
    const problems = compare(
      [briefRow({ name: 'Örnekâbat' })],
      [seedRow({ plate: '30', nameTr: 'Örnekabat' })],
      [OVERRIDE],
    );
    expect(problems.some((problem) => problem.includes('no seed row of that name'))).toBe(false);
  });

  it('reports a province the brief lists TWICE, even when both copies agree with the seed', () => {
    // The duplicate is invisible to every other join: both rows are compared against the same
    // seed row, so agreeing copies produce a green while the brief claims the province twice.
    const problems = compare([briefRow(), briefRow({ line: 42 })], [seedRow()], [OVERRIDE]);
    expect(problems).toContain(
      '  Alfa (brief line 42) — appears more than once in the §3 tables; the source must name ' +
        'each province exactly once',
    );
  });
});

describe('BELIRSIZ_OVERRIDES', () => {
  it('covers exactly the eleven rows the brief leaves undecided, each with a ruling', () => {
    // Not a fact assertion: the SIZE and the shape are the wave's bookkeeping. A row silently
    // dropped here would make its BELİRSİZ brief row fail loudly — good — but a row ADDED here
    // for a province the brief resolved would quietly outrank its own source, which is the case
    // `compare` reports as stale and this pins from the other side. Eleven since DEC 2026-08-06b
    // returned the Denizli row to BELİRSİZ.
    expect(BELIRSIZ_OVERRIDES).toHaveLength(11);
    expect(new Set(BELIRSIZ_OVERRIDES.map((o) => o.name)).size).toBe(11);
    for (const override of BELIRSIZ_OVERRIDES) {
      expect(override.ruling).toMatch(/^DEC \d{4}-\d{2}-\d{2}/u);
      expect(override.curriculumName.length).toBeGreaterThan(0);
    }
  });
});

/**
 * The ORCHESTRATOR, not the leaves — this is where the four shared refusals (ENGINEERING §8,
 * Atlas ruling AS-7) and the exit-code contract actually live, and until PR #97's review nothing
 * reached them: the cases above stop at `compare`/`parseBriefRows`, so a refusal reordered or
 * deleted would compile, typecheck and leave `Test (unit)` green while the gate silently stopped
 * gating (TA97-I1 / SFH97-I1). This lane is wired into NO CI job by design, so this suite is the
 * only automated evidence the gate still refuses what it promises to refuse. Mirrors the sibling
 * `runProse — the exit-code contract` suite.
 *
 * Every fixture is synthetic: invented province names, invented plate codes, invented values.
 */
describe('runCurriculum — the shared refusals and the exit-code contract', () => {
  function writeTemp(name: string, contents: string): string {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'curriculum-runner-')), name);
    fs.writeFileSync(file, contents, 'utf8');
    return file;
  }

  /** A seed fixture shaped like the real one: the two compared fields are CONSTANT references. */
  function writeSeed(
    rows: readonly { plate: string; nameTr: string; koppen?: string; curriculum?: string }[],
  ): string {
    const literals = rows.map((row) => {
      const parts = [
        `    plateCode: ${JSON.stringify(row.plate)},`,
        `    nameTr: ${JSON.stringify(row.nameTr)},`,
      ];
      if (row.koppen !== undefined) parts.push(`    climateKoppen: ${row.koppen},`);
      if (row.curriculum !== undefined) {
        parts.push(`    climateCurriculumNameTr: ${row.curriculum},`);
      }
      return `  {\n${parts.join('\n')}\n  },`;
    });
    return writeTemp(
      'seed-fixture.ts',
      [
        "const KOPPEN_CSA = 'Csa';",
        "const CURRICULUM_AKDENIZ = 'Akdeniz iklimi';",
        "const CURRICULUM_MARMARA_GECIS = 'Marmara geçiş iklimi';",
        `export const ROWS = [\n${literals.join('\n')}\n];`,
        '',
      ].join('\n'),
    );
  }

  const SEEDED = [
    { plate: '01', nameTr: 'Alfa', koppen: 'KOPPEN_CSA', curriculum: 'CURRICULUM_AKDENIZ' },
    { plate: '02', nameTr: 'Beta', koppen: 'KOPPEN_CSA', curriculum: 'CURRICULUM_MARMARA_GECIS' },
  ];

  const AGREEING_BRIEF = briefWith(
    '| Alfa | Akdeniz iklimi | Csa | K-1m | NET | = |',
    '| Beta | **BELİRSİZ** — Marmara geçiş / Akdeniz | Csa | K-1m | BELİRSİZ | — |',
  );

  /** Run with stdout/stderr captured, so both the exit code and the report can be asserted. */
  const runWithPaths = (
    mode: 'emit' | 'check',
    briefPaths: readonly string[],
    seedFile: string,
    overrides: readonly BelirsizOverride[] = [OVERRIDE],
  ): { code: number; stdout: string; stderr: string } => {
    let stdout = '';
    let stderr = '';
    const outSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    const errSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    try {
      return { code: runCurriculum({ mode, briefPaths, seedFile, overrides }), stdout, stderr };
    } finally {
      outSpy.mockRestore();
      errSpy.mockRestore();
    }
  };

  const run = (
    mode: 'emit' | 'check',
    markdown: string,
    seedFile: string,
    overrides: readonly BelirsizOverride[] = [OVERRIDE],
  ): { code: number; stdout: string; stderr: string } =>
    runWithPaths(mode, [writeTemp('brief-fixture.md', markdown)], seedFile, overrides);

  it('exits 0 when the brief, the overrides and the seed all agree', () => {
    const { code, stdout } = run('check', AGREEING_BRIEF, writeSeed(SEEDED));
    expect(code).toBe(0);
    // The count line is the human-readable half of the gate; pin its semantics, not just the code.
    expect(stdout).toContain('checked 2 brief row(s) against 2 seed row(s): 0 disagreement(s)');
  });

  it('exits 1 on a disagreement — the gate cannot be read by eye', () => {
    const drifted = writeSeed([
      { ...SEEDED[0]!, curriculum: 'CURRICULUM_MARMARA_GECIS' },
      SEEDED[1]!,
    ]);
    const { code, stdout } = run('check', AGREEING_BRIEF, drifted);
    expect(code).toBe(1);
    expect(stdout).toContain('1 disagreement(s)');
    expect(stdout).toContain('DISAGREEMENTS:');
  });

  it('REFUSAL 1a — exits 1 on an empty override table rather than deciding nothing', () => {
    const { code, stderr } = run('check', AGREEING_BRIEF, writeSeed(SEEDED), []);
    expect(code).toBe(1);
    expect(stderr).toContain('override table is empty');
  });

  it('REFUSAL 1b — exits 1 when the file parses to ZERO §3 rows (the wrong-file false green)', () => {
    // The literal "pointed at the authored draft instead of the brief" case: a markdown file the
    // parser understands nothing in must never print "checked 0" and exit 0.
    const { code, stdout, stderr } = run(
      'check',
      '# Bir özet\n\nHiç tablo yok.\n',
      writeSeed(SEEDED),
    );
    expect(code).toBe(1);
    expect(stderr).toContain('no §3 province rows parsed');
    expect(stdout).toBe('');
  });

  it('REFUSAL 2 — refuses to run at all when the committed seed does not parse', () => {
    // `ts.createSourceFile` is error-tolerant: a missing comma yields a silently incomplete index
    // and a "0 disagreements" green off half the rows.
    const broken = writeTemp(
      'broken-seed.ts',
      `export const ROWS = [\n  { plateCode: '01', nameTr: 'Alfa' \n];\n`,
    );
    const { code, stdout, stderr } = run('check', AGREEING_BRIEF, broken);
    expect(code).toBe(1);
    expect(stderr).toContain('seed source does not parse');
    expect(stdout).toBe('');
  });

  it("REFUSAL 3 — answers a typo'd brief path with a readable message, not an fs stack trace", () => {
    // The FULL rendered line: the substring "no such file" also appears in the raw node message
    // this replaces, so asserting only that would pass under the regressed form too.
    const missing = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'curriculum-runner-gone-')),
      'no-such-brief.md',
    );
    const { code, stderr } = runWithPaths('check', [missing], writeSeed(SEEDED));
    expect(code).toBe(1);
    expect(stderr).toContain('cannot read draft file(s)');
    expect(stderr).toContain(`${missing} — no such file`);
    expect(stderr).not.toContain('ENOENT');
  });

  it('exits 1 when the §3 table header changed shape (the positional read is refused)', () => {
    const reordered = AGREEING_BRIEF.replace(
      HEADER,
      '| İl | Köppen | Müfredat iklim adı | Kaynak | Durum | ⚑ |',
    );
    const { code, stderr } = run('check', reordered, writeSeed(SEEDED));
    expect(code).toBe(1);
    expect(stderr).toContain('the §3 table header changed shape');
  });

  it('exits 1 when the seed file carries no province rows at all', () => {
    const empty = writeTemp('empty-seed.ts', 'export const ROWS = [];\n');
    const { code, stderr } = run('check', AGREEING_BRIEF, empty);
    expect(code).toBe(1);
    expect(stderr).toContain('no province rows found in the seed');
  });

  it('emit prints one property line per row, and reports how many it produced', () => {
    // CR97-M5: rows the emitter cannot resolve are skipped, so a SHORT run must not look like a
    // complete one. The count goes to stderr; stdout stays a clean diffable block.
    const { code, stdout, stderr } = run('emit', AGREEING_BRIEF, writeSeed(SEEDED));
    expect(code).toBe(0);
    expect(stdout.match(/^ {4}climateCurriculumNameTr:/gmu)).toHaveLength(2);
    expect(stdout).toContain('climateCurriculumNameTr: CURRICULUM_AKDENIZ,');
    expect(stderr).toContain('emitted 2 line(s) for 2 brief row(s)');
  });

  it('emit refuses when no CURRICULUM_* constant holds the value it would write', () => {
    // The seed row is fine; the CONSTANT is missing, so the emitter would have to invent an
    // identifier. It reports instead — the whole point of looking the name up in the seed.
    const seedFile = writeTemp(
      'no-constant-seed.ts',
      [
        "const KOPPEN_CSA = 'Csa';",
        "const CURRICULUM_AKDENIZ = 'Akdeniz iklimi';",
        'export const ROWS = [',
        "  { plateCode: '02', nameTr: 'Beta', climateKoppen: KOPPEN_CSA,",
        '    climateCurriculumNameTr: CURRICULUM_AKDENIZ },',
        '];',
        '',
      ].join('\n'),
    );
    const brief = briefWith(
      '| Beta | **BELİRSİZ** — Marmara geçiş / Akdeniz | Csa | K-1m | BELİRSİZ | — |',
    );
    const { code, stderr } = run('emit', brief, seedFile);
    expect(code).toBe(1);
    expect(stderr).toContain('cannot emit');
    expect(stderr).toContain('CURRICULUM_* constants hold');
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
