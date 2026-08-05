/**
 * Unit coverage for the SHARED wave runner — `parseArgs`, `readCommitted` and the three
 * bookkeeping guards `runWave` enforces before it emits or diffs anything.
 *
 * WHY THIS FILE EXISTS: `check` IS the byte-fidelity gate, and since wave N2 one copy of it
 * serves every wave. Until now the only regression evidence for that copy was a human replaying
 * the previous wave's command by hand, so a weakened exit-code line (`return 0` where a drift is
 * present) would have shipped with `Test (unit)` green — the exact silent-weakening the split was
 * designed to prevent, merely relocated. These cases pin the exit-code contract itself.
 *
 * FIXTURES ARE SYNTHETIC. Every province name, plate code and paragraph below is invented for the
 * test; nothing is quoted from a draft or from `province.seed-data.ts`. Tests here check the
 * TOOL's mechanics — never the content it carries (→ CONVENTIONS §2: no per-entity content-fact
 * assertions, owner-confirmed 2026-07-26).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { WaveTarget } from './oneoff-province-climate-extract.ts';
import {
  type CommittedProvince,
  checkDraftsAgainstTargets,
  checkTargetsAgainstSeed,
  parseArgs,
  readCommitted,
  runWave,
} from './oneoff-province-climate-runner.ts';

/** Two invented provinces; the second one's name carries a diacritic the seed spelling drops. */
const TARGETS: readonly WaveTarget[] = [
  { name: 'Testiye', plate: '90' },
  { name: 'Örnekâbat', plate: '91' },
];

const BODY_90 = 'Birinci deneme paragrafı.';
const BODY_91 = 'İkinci deneme paragrafı.';

function draft(sections: readonly { heading: string; body: string }[]): string {
  return sections
    .map(({ heading, body }, index) => `## ${index + 1}. ${heading}\n\n${body}\n`)
    .join('\n');
}

/** `runWave` takes PATHS, so a fixture draft has to exist on disk. */
function writeDraft(markdown: string): string {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'climate-runner-')),
    'draft-fixture.md',
  );
  fs.writeFileSync(file, markdown, 'utf8');
  return file;
}

/** A throwaway seed file shaped like the real one: `plateCode` + `nameTr` + optional narrative. */
function writeSeed(rows: readonly { plate: string; nameTr: string; narrative?: string }[]): string {
  const literals = rows.map((row) => {
    const narrative =
      row.narrative === undefined
        ? ''
        : `    climateNarrativeTr: ${JSON.stringify(row.narrative)},\n`;
    return `  {\n    plateCode: '${row.plate}',\n    nameTr: '${row.nameTr}',\n${narrative}  },`;
  });
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'climate-runner-')),
    'seed-fixture.ts',
  );
  fs.writeFileSync(file, `export const rows = [\n${literals.join('\n')}\n];\n`, 'utf8');
  return file;
}

/** A seed fixture written VERBATIM, so a deliberately broken one can be handed to the runner. */
function writeRawSeed(source: string): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'climate-runner-')), 'broken.ts');
  fs.writeFileSync(file, source, 'utf8');
  return file;
}

/** Run `runWave` with stdout/stderr captured, so the exit code AND the report can be asserted. */
function run(options: Parameters<typeof runWave>[0]): {
  code: number;
  stdout: string;
  stderr: string;
} {
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
    return { code: runWave(options), stdout, stderr };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
}

describe('parseArgs', () => {
  it.each(['emit', 'check'])('accepts `%s` with one or more draft paths', (mode) => {
    expect(parseArgs([mode, 'a.md', 'b.md'])).toEqual({ mode, draftPaths: ['a.md', 'b.md'] });
  });

  it('rejects an unknown mode (the CLI turns null into the usage banner + exit 2)', () => {
    expect(parseArgs(['bogus', 'a.md'])).toBeNull();
  });

  it('rejects a mode with no draft path — a wave must never run against zero drafts', () => {
    expect(parseArgs(['check'])).toBeNull();
  });

  it('rejects empty argv', () => {
    expect(parseArgs([])).toBeNull();
  });
});

describe('readCommitted', () => {
  it('folds name and narrative per plate, and keeps rows that have no narrative yet', () => {
    const seedFile = writeSeed([
      { plate: '90', nameTr: 'Testiye', narrative: BODY_90 },
      { plate: '91', nameTr: 'Ornekabat' },
    ]);
    const committed = readCommitted(seedFile);
    expect(committed.get('90')).toEqual({ nameTr: 'Testiye', narrative: BODY_90 });
    // The row exists (so the name guard can see it) but is not authored yet.
    expect(committed.get('91')).toEqual({ nameTr: 'Ornekabat', narrative: null });
  });
});

describe('checkTargetsAgainstSeed — the name→plate guard', () => {
  const seed = new Map<string, CommittedProvince>([
    ['90', { nameTr: 'Testiye', narrative: BODY_90 }],
    ['91', { nameTr: 'Ornekabat', narrative: BODY_91 }],
    ['92', { nameTr: 'Baskayer', narrative: null }],
  ]);

  it('passes when every target plate points at the province the draft heading names', () => {
    expect(checkTargetsAgainstSeed(TARGETS, seed)).toEqual([]);
  });

  it('tolerates a draft spelling that differs from the seed only by diacritics', () => {
    // The live case this exists for: a draft heading may carry a circumflex the seed row drops.
    expect(checkTargetsAgainstSeed([{ name: 'Örnekâbat', plate: '91' }], seed)).toEqual([]);
  });

  it('catches a plate that points at a DIFFERENT province — prose seeded onto the wrong page', () => {
    const problems = checkTargetsAgainstSeed([{ name: 'Testiye', plate: '92' }], seed);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('Baskayer');
  });

  it('catches a plate no seed row carries at all', () => {
    const problems = checkTargetsAgainstSeed([{ name: 'Testiye', plate: '99' }], seed);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no seed row');
  });
});

describe('checkDraftsAgainstTargets — the unknown-section guard', () => {
  const seed = new Map<string, CommittedProvince>([
    ['90', { nameTr: 'Testiye', narrative: null }],
    ['91', { nameTr: 'Ornekabat', narrative: null }],
    ['92', { nameTr: 'Baskayer', narrative: null }],
  ]);

  it('passes when the draft covers exactly the wave targets', () => {
    const md = draft([
      { heading: 'Testiye (Xxx)', body: BODY_90 },
      { heading: 'Örnekâbat (Yyy)', body: BODY_91 },
    ]);
    expect(checkDraftsAgainstTargets([md], TARGETS, seed)).toEqual([]);
  });

  it('catches a province section no target claims (it would be seeded by nobody, silently)', () => {
    const md = draft([
      { heading: 'Testiye', body: BODY_90 },
      { heading: 'Örnekâbat', body: BODY_91 },
      { heading: 'Baskayer', body: 'Uçuncu deneme paragrafı.' },
    ]);
    const problems = checkDraftsAgainstTargets([md], TARGETS, seed);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('Baskayer');
  });

  it('does NOT mistake a numbered editorial section for a province', () => {
    // Real drafts number their own trailing sections; only a name the SEED knows is a province.
    const md = draft([
      { heading: 'Testiye', body: BODY_90 },
      { heading: 'Örnekâbat', body: BODY_91 },
      { heading: 'Paylaşılan varlık satırı (protokol)', body: '| a | b |' },
    ]);
    expect(checkDraftsAgainstTargets([md], TARGETS, seed)).toEqual([]);
  });
});

describe('runWave — the exit-code contract', () => {
  const bothSections = writeDraft(
    draft([
      { heading: 'Testiye (Xxx)', body: BODY_90 },
      { heading: 'Örnekâbat (Yyy)', body: BODY_91 },
    ]),
  );

  it('check exits 0 and reports all identical when the seed matches the draft', () => {
    const seedFile = writeSeed([
      { plate: '90', nameTr: 'Testiye', narrative: BODY_90 },
      { plate: '91', nameTr: 'Ornekabat', narrative: BODY_91 },
    ]);
    const { code, stdout } = run({
      mode: 'check',
      draftPaths: [bothSections],
      targets: TARGETS,
      seedFile,
    });
    expect(stdout).toContain('checked 2 province(s): 2 identical, 0 drifted, 0 not yet seeded');
    expect(code).toBe(0);
  });

  it('check exits 1 and reports the divergence offset when one seeded body drifted', () => {
    const seedFile = writeSeed([
      { plate: '90', nameTr: 'Testiye', narrative: BODY_90 },
      { plate: '91', nameTr: 'Ornekabat', narrative: `${BODY_91} Fazladan cümle.` },
    ]);
    const { code, stdout } = run({
      mode: 'check',
      draftPaths: [bothSections],
      targets: TARGETS,
      seedFile,
    });
    expect(stdout).toContain('1 identical, 1 drifted, 0 not yet seeded');
    expect(stdout).toContain(`diverges at offset ${BODY_91.length}`);
    expect(code).toBe(1);
  });

  it('check exits 1 when a target is not seeded yet', () => {
    const seedFile = writeSeed([
      { plate: '90', nameTr: 'Testiye', narrative: BODY_90 },
      { plate: '91', nameTr: 'Ornekabat' },
    ]);
    const { code, stdout } = run({
      mode: 'check',
      draftPaths: [bothSections],
      targets: TARGETS,
      seedFile,
    });
    expect(stdout).toContain('1 identical, 0 drifted, 1 not yet seeded');
    expect(stdout).toContain('NOT SEEDED:');
    expect(code).toBe(1);
  });

  it('exits 1 when a target has no section in any supplied draft', () => {
    const seedFile = writeSeed([
      { plate: '90', nameTr: 'Testiye', narrative: BODY_90 },
      { plate: '91', nameTr: 'Ornekabat', narrative: BODY_91 },
    ]);
    const onlyFirst = writeDraft(draft([{ heading: 'Testiye', body: BODY_90 }]));
    const { code, stderr } = run({
      mode: 'check',
      draftPaths: [onlyFirst],
      targets: TARGETS,
      seedFile,
    });
    expect(stderr).toContain('no draft body found');
    expect(code).toBe(1);
  });

  it('exits 1 in EMIT mode too when the target table disagrees with the seed', () => {
    // The mis-plate must be caught before its prose is pasted anywhere, not after.
    const seedFile = writeSeed([
      { plate: '90', nameTr: 'Testiye', narrative: BODY_90 },
      { plate: '91', nameTr: 'Baskayer', narrative: BODY_91 },
    ]);
    const { code, stdout, stderr } = run({
      mode: 'emit',
      draftPaths: [bothSections],
      targets: TARGETS,
      seedFile,
    });
    expect(stderr).toContain('disagrees with the seed');
    expect(stdout).toBe('');
    expect(code).toBe(1);
  });

  it('emit exits 0 and prints one concatenation snippet per target', () => {
    const seedFile = writeSeed([
      { plate: '90', nameTr: 'Testiye', narrative: BODY_90 },
      { plate: '91', nameTr: 'Ornekabat', narrative: BODY_91 },
    ]);
    const { code, stdout } = run({
      mode: 'emit',
      draftPaths: [bothSections],
      targets: TARGETS,
      seedFile,
    });
    expect(stdout).toContain('// 90 Testiye');
    expect(stdout).toContain('// 91 Örnekâbat');
    expect(stdout.match(/climateNarrativeTr:/gu)).toHaveLength(2);
    expect(code).toBe(0);
  });
});

/**
 * The three refusals this shell shares with the country lane's `cli.ts` and the prose lane's
 * runner. They are duplicated per lane on purpose (ENGINEERING §8: "a new lane author must
 * replicate the same invariant, not assume one copy guards all"), so each copy needs its own
 * evidence — otherwise a copy can lose a refusal with every suite green.
 */
describe('runWave — the shared refusals', () => {
  const SEEDED: readonly { plate: string; nameTr: string; narrative?: string }[] = [
    { plate: '90', nameTr: 'Testiye', narrative: BODY_90 },
    { plate: '91', nameTr: 'Ornekabat', narrative: BODY_91 },
  ];
  const bothSections = writeDraft(
    draft([
      { heading: 'Testiye (Xxx)', body: BODY_90 },
      { heading: 'Örnekâbat (Yyy)', body: BODY_91 },
    ]),
  );
  const missingPath = path.join(os.tmpdir(), 'climate-runner-no-such-draft.md');

  it('exits 1 on an EMPTY target list rather than reporting "checked 0 province(s)"', () => {
    // The false green a wave entry point could reintroduce: every guard below passes vacuously.
    const { code, stdout, stderr } = run({
      mode: 'check',
      draftPaths: [bothSections],
      targets: [],
      seedFile: writeSeed(SEEDED),
    });
    expect(code).toBe(1);
    expect(stderr).toContain('target list is empty');
    expect(stdout).toBe('');
  });

  it('refuses to run at all when the committed seed does not parse', () => {
    // `ts.createSourceFile` is error-tolerant, so without this the fold silently loses rows and
    // `check` prints a green it did not earn.
    const broken = writeRawSeed(
      `export const rows = [\n  { plateCode: '90', nameTr: 'Testiye' \n];\n`,
    );
    const { code, stdout, stderr } = run({
      mode: 'check',
      draftPaths: [bothSections],
      targets: TARGETS,
      seedFile: broken,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('seed source does not parse');
    expect(stdout).toBe('');
  });

  it('checks the seed BEFORE reading any draft — a broken seed poisons every mode', () => {
    const broken = writeRawSeed(
      `export const rows = [\n  { plateCode: '90' nameTr: 'Testiye' },\n];\n`,
    );
    const { code, stderr } = run({
      mode: 'emit',
      draftPaths: [missingPath],
      targets: TARGETS,
      seedFile: broken,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('seed source does not parse');
    expect(stderr).not.toContain('cannot read draft file(s)');
  });

  it("answers a typo'd draft path with a readable message, not a node:fs stack trace", () => {
    const { code, stderr } = run({
      mode: 'check',
      draftPaths: [missingPath],
      targets: TARGETS,
      seedFile: writeSeed(SEEDED),
    });
    expect(code).toBe(1);
    expect(stderr).toContain('cannot read draft file(s)');
    expect(stderr).toContain('no such file');
  });
});

describe('runWave — the tight-join signal', () => {
  // The draft breaks a line after an apostrophe, so the extractor joins with NO separator and
  // flags it. Both sides of `check` run that same extractor, so the diff can never catch it.
  const TIGHT_TARGETS: readonly WaveTarget[] = [{ name: 'Testiye', plate: '90' }];
  const tightDraft = writeDraft("## 1. Testiye\n\nTestiye'\nnin ırmağı vardır.\n");
  const tightSeed = (): string =>
    writeSeed([{ plate: '90', nameTr: 'Testiye', narrative: "Testiye'nin ırmağı vardır." }]);

  it('REPORTS the join in check mode too — reporting only, the run still exits 0', () => {
    const { code, stdout } = run({
      mode: 'check',
      draftPaths: [tightDraft],
      targets: TIGHT_TARGETS,
      seedFile: tightSeed(),
    });
    expect(stdout).toContain('No-space line joins performed');
    expect(stdout).toContain('90 Testiye:');
    // Deliberately NOT a failure mode: a hard error would train people around the gate.
    expect(code).toBe(0);
  });

  it('stays silent when there is no join to report', () => {
    const plain = writeDraft(draft([{ heading: 'Testiye', body: BODY_90 }]));
    const { code, stdout } = run({
      mode: 'check',
      draftPaths: [plain],
      targets: TIGHT_TARGETS,
      seedFile: writeSeed([{ plate: '90', nameTr: 'Testiye', narrative: BODY_90 }]),
    });
    expect(code).toBe(0);
    expect(stdout).not.toContain('No-space line joins');
  });

  it('still prints the inline tight-join comment in emit — that report did not move', () => {
    const { code, stdout } = run({
      mode: 'emit',
      draftPaths: [tightDraft],
      targets: TIGHT_TARGETS,
      seedFile: tightSeed(),
    });
    expect(code).toBe(0);
    expect(stdout).toContain('//   tight-join:');
  });
});
