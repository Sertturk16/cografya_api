/**
 * Unit coverage for the province PROSE runner — the field-parametric AST fold, the name→plate
 * guard, the draft-collection guards, and the `emit`/`check` exit-code contract `runProse`
 * enforces.
 *
 * WHY THIS FILE EXISTS: `check` IS the byte-fidelity gate for every field the climate lane cannot
 * see. It is wired into NO CI job (the drafts live outside the repo), so without a spec the only
 * regression evidence for the gate would be a human replaying the command — and a weakened
 * exit-code line (`return 0` where a drift is present) would ship with `Test (unit)` green. These
 * cases pin the contract itself, exactly as the climate runner's spec does for its lane.
 *
 * FIXTURES ARE SYNTHETIC. Every province name, plate code, field value and paragraph below is
 * invented for the test; nothing is quoted from a draft or from `province.seed-data.ts`. Tests
 * here check the TOOL's mechanics — never the content it carries (→ CONVENTIONS §2: no per-entity
 * content-fact assertions, owner-confirmed 2026-07-26).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  type ProseTarget,
  checkTargetsAgainstSeed,
  collectBodies,
  readCommitted,
  runProse,
  sectionName,
} from './oneoff-province-prose-runner.ts';

/** Two invented provinces; the second one's name carries a diacritic the seed spelling drops. */
const TARGETS: readonly ProseTarget[] = [
  { name: 'Testiye', plate: '90', field: 'hydrographyNoteTr' },
  { name: 'Örnekâbat', plate: '91', field: 'hydrographyNoteTr' },
];

const BODY_90 = 'Birinci deneme paragrafı.';
const BODY_91 = 'İkinci deneme paragrafı.';

function writeTemp(name: string, contents: string): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prose-runner-')), name);
  fs.writeFileSync(file, contents, 'utf8');
  return file;
}

/** A draft in the shape the parser expects: `## N. <name>` + ``### `field` `` + `> prose`. */
function draft(sections: readonly { heading: string; field: string; body: string }[]): string {
  return sections
    .map(
      ({ heading, field, body }, index) =>
        `## ${index + 1}. ${heading}\n\n### \`${field}\`\n\n> ${body}\n`,
    )
    .join('\n');
}

/** A throwaway seed file shaped like the real one: `plateCode` + `nameTr` + optional field. */
function writeSeed(
  rows: readonly { plate: string; nameTr: string; hydrography?: string; other?: string }[],
): string {
  // JSON.stringify, NOT single quotes: Turkish fixture prose is full of apostrophes
  // (`Testiye'nin`), and naive quoting would emit a seed fixture that does not parse — the test
  // would then measure the tool against garbage instead of against a seed row.
  const literals = rows.map((row) => {
    const parts = [
      `    plateCode: ${JSON.stringify(row.plate)},`,
      `    nameTr: ${JSON.stringify(row.nameTr)},`,
    ];
    if (row.hydrography !== undefined) {
      parts.push(`    hydrographyNoteTr: ${JSON.stringify(row.hydrography)},`);
    }
    if (row.other !== undefined) parts.push(`    introTr: ${JSON.stringify(row.other)},`);
    return `  {\n${parts.join('\n')}\n  },`;
  });
  return writeTemp('seed-fixture.ts', `export const ROWS = [\n${literals.join('\n')}\n];\n`);
}

const SEEDED = [
  { plate: '90', nameTr: 'Testiye', hydrography: BODY_90 },
  { plate: '91', nameTr: 'Örnekabat', hydrography: BODY_91 },
];

const FULL_DRAFT = draft([
  { heading: 'Testiye', field: 'hydrographyNoteTr', body: BODY_90 },
  { heading: 'Örnekâbat', field: 'hydrographyNoteTr', body: BODY_91 },
]);

describe('sectionName', () => {
  it.each([
    ['19. Çorum', 'Çorum'],
    ['7) Testiye', 'Testiye'],
    ['Testiye', 'Testiye'],
    // The province drafts annotate headings with the Köppen code — same shape the climate
    // lane's heading regex already tolerates.
    ['19. Çorum (Cfb)', 'Çorum'],
    ['3. Testiye (Csa)', 'Testiye'],
  ])(
    'strips the wave-local ordinal and any trailing parenthetical from %p',
    (heading, expected) => {
      expect(sectionName(heading)).toBe(expected);
    },
  );
});

describe('readCommitted', () => {
  it('folds a `+`-concatenated value back into one string', () => {
    const file = writeTemp(
      'concat.ts',
      `export const ROWS = [\n  {\n    plateCode: '90',\n    nameTr: 'Testiye',\n` +
        `    hydrographyNoteTr: 'bir ' +\n      'iki ' +\n      'üç.',\n  },\n];\n`,
    );
    expect(
      readCommitted(file, ['hydrographyNoteTr']).get('90')?.values.get('hydrographyNoteTr'),
    ).toBe('bir iki üç.');
  });

  it('captures ONLY the requested fields', () => {
    const file = writeSeed([{ plate: '90', nameTr: 'Testiye', hydrography: 'a', other: 'b' }]);
    const values = readCommitted(file, ['hydrographyNoteTr']).get('90')?.values;
    expect(values?.get('hydrographyNoteTr')).toBe('a');
    expect(values?.has('introTr')).toBe(false);
  });

  it('keeps a row that carries none of the requested fields, so the name guard can see it', () => {
    const file = writeSeed([{ plate: '90', nameTr: 'Testiye' }]);
    const row = readCommitted(file, ['hydrographyNoteTr']).get('90');
    expect(row?.nameTr).toBe('Testiye');
    expect(row?.values.size).toBe(0);
  });
});

describe('checkTargetsAgainstSeed', () => {
  it('passes when every plate points at the province the draft names (diacritics folded)', () => {
    expect(checkTargetsAgainstSeed(TARGETS, readCommitted(writeSeed(SEEDED), []))).toEqual([]);
  });

  it('catches a plate that points at a DIFFERENT province — the mis-publish guard', () => {
    const committed = readCommitted(
      writeSeed([{ plate: '90', nameTr: 'Başkayer' }, ...SEEDED.slice(1)]),
      [],
    );
    expect(checkTargetsAgainstSeed(TARGETS, committed)).toEqual([
      expect.stringContaining('the seed row for this plate is "Başkayer"'),
    ]);
  });

  it('catches a plate no seed row carries', () => {
    const committed = readCommitted(writeSeed(SEEDED.slice(1)), []);
    expect(checkTargetsAgainstSeed(TARGETS, committed)).toEqual([
      expect.stringContaining('no seed row carries this plate code'),
    ]);
  });

  it('catches a row with no nameTr — the guard cannot silently pass unverifiable rows', () => {
    // A row carrying `plateCode` but no `nameTr`: the cross-check has nothing to compare, which
    // must be reported rather than treated as agreement.
    const file = writeTemp(
      'no-name.ts',
      `export const ROWS = [\n  {\n    plateCode: '90',\n  },\n  {\n` +
        `    plateCode: '91',\n    nameTr: 'Örnekabat',\n  },\n];\n`,
    );
    expect(checkTargetsAgainstSeed(TARGETS, readCommitted(file, []))).toEqual([
      expect.stringContaining('has no nameTr to check against'),
    ]);
  });
});

describe('readCommitted — unfoldable values', () => {
  it('separates "present but unfoldable" from "absent", so check can diagnose honestly', () => {
    const file = writeTemp(
      'unfoldable.ts',
      `const SHARED = 'x';\nexport const ROWS = [\n  {\n    plateCode: '90',\n` +
        `    nameTr: 'Testiye',\n    hydrographyNoteTr: SHARED,\n  },\n];\n`,
    );
    const row = readCommitted(file, ['hydrographyNoteTr']).get('90');
    expect(row?.values.has('hydrographyNoteTr')).toBe(false);
    expect(row?.unfoldable.has('hydrographyNoteTr')).toBe(true);
  });
});

describe('collectBodies', () => {
  it('keys each parsed body on the target plate + field', () => {
    const { bodies, problems } = collectBodies([FULL_DRAFT], TARGETS);
    expect(problems).toEqual([]);
    expect(bodies.get('90 hydrographyNoteTr')?.value).toBe(BODY_90);
    expect(bodies.get('91 hydrographyNoteTr')?.value).toBe(BODY_91);
  });

  it('reports a draft section no target claims, rather than ignoring it', () => {
    const stray = draft([{ heading: 'Yabancı', field: 'hydrographyNoteTr', body: 'x' }]);
    const { problems } = collectBodies([stray], TARGETS);
    expect(problems).toEqual([expect.stringContaining("this wave's target list does not claim")]);
  });

  it('reports a claimed province whose FIELD no target claims', () => {
    const otherField = draft([{ heading: 'Testiye', field: 'introTr', body: 'x' }]);
    const { problems } = collectBodies([otherField], TARGETS);
    expect(problems).toEqual([expect.stringContaining("this wave's target list does not claim")]);
  });

  it('refuses to pick a winner when two drafts carry different prose for one field', () => {
    const a = draft([{ heading: 'Testiye', field: 'hydrographyNoteTr', body: 'ilk metin.' }]);
    const b = draft([{ heading: 'Testiye', field: 'hydrographyNoteTr', body: 'başka metin.' }]);
    const { problems } = collectBodies([a, b], TARGETS);
    expect(problems).toEqual([expect.stringContaining('two drafts carry different prose')]);
  });

  it('accepts the same prose supplied twice — identical is not a conflict', () => {
    const same = draft([{ heading: 'Testiye', field: 'hydrographyNoteTr', body: BODY_90 }]);
    expect(collectBodies([same, same], TARGETS).problems).toEqual([]);
  });

  it('surfaces a parser ERROR diagnostic (a mistyped field header drops real prose)', () => {
    const typo = draft([{ heading: 'Testiye', field: 'hydrographyNoteTR', body: 'x' }]);
    const { problems } = collectBodies([typo], TARGETS);
    expect(problems).toEqual([expect.stringContaining('differs from `hydrographyNoteTr`')]);
  });
});

describe('runProse — the exit-code contract', () => {
  /**
   * Run with stdout/stderr CAPTURED, so the exit code AND the report can be asserted — and so the
   * failure-path cases below do not write real bytes into a green test run. Mirrors the sibling
   * climate spec's helper.
   */
  const run = (
    mode: 'emit' | 'check',
    markdown: string,
    seedFile: string,
    targets: readonly ProseTarget[] = TARGETS,
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
      const code = runProse({
        mode,
        draftPaths: [writeTemp('draft-fixture.md', markdown)],
        targets,
        seedFile,
      });
      return { code, stdout, stderr };
    } finally {
      outSpy.mockRestore();
      errSpy.mockRestore();
    }
  };

  it('exits 0 when every committed value is byte-identical to the draft', () => {
    const { code, stdout } = run('check', FULL_DRAFT, writeSeed(SEEDED));
    expect(code).toBe(0);
    // The count line is the human-readable half of the gate; pin its semantics, not just the code.
    expect(stdout).toContain('checked 2 field(s): 2 identical, 0 drifted, 0 not yet seeded');
  });

  it('exits 1 on drift — the gate cannot be read by eye', () => {
    const seed = writeSeed([{ ...SEEDED[0]!, hydrography: 'kaymış metin.' }, SEEDED[1]!]);
    const { code, stdout } = run('check', FULL_DRAFT, seed);
    expect(code).toBe(1);
    expect(stdout).toContain('1 drifted');
  });

  it('exits 1 when a target is not yet seeded', () => {
    const seed = writeSeed([{ plate: '90', nameTr: 'Testiye' }, SEEDED[1]!]);
    const { code, stdout } = run('check', FULL_DRAFT, seed);
    expect(code).toBe(1);
    expect(stdout).toContain('absent from the seed');
  });

  it('exits 1 when a draft covers no target at all — the false-green hole stays shut', () => {
    const { code, stderr } = run('check', '# nothing the parser understands\n', writeSeed(SEEDED));
    expect(code).toBe(1);
    expect(stderr).toContain('no draft body found');
  });

  it('exits 1 on an EMPTY target list rather than reporting "checked 0 field(s)"', () => {
    const { code, stderr } = run('check', FULL_DRAFT, writeSeed(SEEDED), []);
    expect(code).toBe(1);
    expect(stderr).toContain('target list is empty');
  });

  it('exits 1 when the target list disagrees with the seed, BEFORE reading any draft', () => {
    // The fixture row still carries the field, so the only reason to fail is the name mismatch —
    // otherwise this case would pass through the "not yet seeded" path and prove nothing.
    const seed = writeSeed([{ plate: '90', nameTr: 'Başkayer', hydrography: BODY_90 }, SEEDED[1]!]);
    const { code, stderr } = run('check', FULL_DRAFT, seed);
    expect(code).toBe(1);
    expect(stderr).toContain('the wave target list disagrees with the seed');
  });

  it('prints one emitted snippet per target', () => {
    const { code, stdout } = run('emit', FULL_DRAFT, writeSeed(SEEDED));
    expect(code).toBe(0);
    expect(stdout.match(/^ {4}hydrographyNoteTr:/gmu)).toHaveLength(TARGETS.length);
    expect(stdout).toContain(BODY_90);
  });

  it('REPORTS a tight join in check mode too — the gate must not be blind to it', () => {
    // The draft breaks a line after an apostrophe, so the parser joins with no separator and
    // flags it. `check` compares folded values and would otherwise stay silent about the join.
    const tight = "## 1. Testiye\n\n### `hydrographyNoteTr`\n\n> Testiye'\n> nin ırmağı.\n";
    const seed = writeSeed([
      { plate: '90', nameTr: 'Testiye', hydrography: "Testiye'nin ırmağı." },
    ]);
    const targets = [TARGETS[0]!];
    const { code, stdout } = run('check', tight, seed, targets);
    expect(code).toBe(0);
    expect(stdout).toContain('No-space line joins performed');
    expect(stdout).toContain('90 Testiye.hydrographyNoteTr:');
  });

  it('surfaces a non-fatal parser warning instead of dropping it', () => {
    const withWarning =
      FULL_DRAFT + '\n## 3. Testiye\n\n### `bilinmeyenAlan`\n\n> kaybolmaması gereken metin.\n';
    const { code, stderr } = run('check', withWarning, writeSeed(SEEDED));
    expect(code).toBe(0);
    expect(stderr).toContain('bilinmeyenAlan');
  });
});
