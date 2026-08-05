/**
 * Unit coverage for the COUNTRY lane's shell — the refusals `runCli` performs before, and instead
 * of, any mode.
 *
 * WHY THIS FILE EXISTS: the same reason both province runners carry one. `check` is the mandated
 * §8 fidelity gate, its refusals are duplicated per lane on purpose, and a duplicated invariant
 * with evidence in only two of three copies is one edit away from silently losing the third. Until
 * this file, the country lane's two newest refusals lived in an unexported `main()` inside an
 * `import.meta`-bearing entry point a CommonJS spec cannot even import, and were pinned by
 * nothing — a later edit could move the empty-draft guard inside `if (mode === 'check')`
 * and leave the suite green while `emit`/`apply` went back to exiting 0 on a file the tool did not
 * understand (PR #93 review, TA93-I1).
 *
 * FIXTURES ARE SYNTHETIC: an invented two-country seed directory and invented prose. Nothing is
 * read from `src/database/seeds/` or from a real draft (→ CONVENTIONS §2).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { runCli } from './country-runner.ts';

const ALFA = 'Alfa ülkesinin deneme metni.';

/** A seed directory shaped like `src/database/seeds/countries/`: one file, two rows. */
function writeSeedDir(rows: readonly { iso: string; nameTr: string; intro?: string }[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-seed-'));
  const literals = rows.map((row) => {
    const intro = row.intro === undefined ? '' : `    introTr: ${JSON.stringify(row.intro)},\n`;
    return (
      `  {\n    isoCode: ${JSON.stringify(row.iso)},\n` +
      `    nameTr: ${JSON.stringify(row.nameTr)},\n` +
      `    nameEn: ${JSON.stringify(row.nameTr)},\n${intro}  },`
    );
  });
  fs.writeFileSync(
    path.join(dir, 'test.countries.ts'),
    `export const TEST_COUNTRIES = [\n${literals.join('\n')}\n];\n`,
    'utf8',
  );
  return dir;
}

function writeDraft(markdown: string): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-draft-')), 'draft.md');
  fs.writeFileSync(file, markdown, 'utf8');
  return file;
}

const SEED_ROWS = [
  { iso: 'AA', nameTr: 'Alfa', intro: ALFA },
  { iso: 'BB', nameTr: 'Beta' },
];

const GOOD_DRAFT = `## 1. Alfa (AA)\n\n### \`introTr\`\n\n> ${ALFA}\n`;
const NO_FIELDS = '# Bir başlık\n\nBu dosyada hiçbir alan başlığı yok.\n';

/** Run `runCli` with stdout/stderr captured, so the exit code AND the report can be asserted. */
function run(options: Parameters<typeof runCli>[0]): {
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
    return { code: runCli(options), stdout, stderr };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
}

const MODES = ['check', 'emit', 'apply'] as const;

describe('runCli — the exit-code contract', () => {
  it('check exits 0 and reports the count when the seed matches the draft', () => {
    const { code, stdout } = run({
      mode: 'check',
      draftPaths: [writeDraft(GOOD_DRAFT)],
      force: false,
      seedDir: writeSeedDir(SEED_ROWS),
    });
    expect(stdout).toContain('checked 1 field(s): 1 identical, 0 drifted, 0 not yet seeded');
    expect(code).toBe(0);
  });

  it('check exits 1 when the draft carries a field the seed does not', () => {
    const { code, stdout } = run({
      mode: 'check',
      draftPaths: [writeDraft(GOOD_DRAFT)],
      force: false,
      seedDir: writeSeedDir([{ iso: 'AA', nameTr: 'Alfa' }]),
    });
    expect(stdout).toContain('1 not yet seeded');
    expect(code).toBe(1);
  });
});

describe('runCli — the shared refusals', () => {
  // THE GUARD IS MODE-INDEPENDENT, and that is the half an edit is most likely to lose: moving
  // the block inside the `check` branch would leave `emit`/`apply` exiting 0 on a file the tool
  // understood nothing in — the exact false green PR #93 closed.
  it.each(MODES)('exits 1 in %s mode on a draft with no transcribable field', (mode) => {
    const { code, stdout, stderr } = run({
      mode,
      draftPaths: [writeDraft(NO_FIELDS)],
      force: false,
      seedDir: writeSeedDir(SEED_ROWS),
    });
    expect(code).toBe(1);
    expect(stderr).toContain('no transcribable field found');
    // Nothing may be reported as checked, emitted or written on the way out.
    expect(stdout).toBe('');
  });

  it('names ONLY the unusable draft when a good one is passed alongside it', () => {
    const empty = writeDraft(NO_FIELDS);
    const { code, stderr } = run({
      mode: 'check',
      draftPaths: [writeDraft(GOOD_DRAFT), empty],
      force: false,
      seedDir: writeSeedDir(SEED_ROWS),
    });
    expect(code).toBe(1);
    expect(stderr).toContain(empty);
    expect(stderr).not.toContain('Alfa');
  });

  it('ACCEPTS a byte-identical duplicate draft — dedup is not "understood nothing"', () => {
    // The false RED this gate shipped with (CR93-I1): `collect` drops the duplicate's fields
    // before they become items, so an items-based gate blamed a perfectly good draft.
    const seedDir = writeSeedDir(SEED_ROWS);
    const first = writeDraft(GOOD_DRAFT);
    const second = writeDraft(GOOD_DRAFT);
    const forward = run({ mode: 'check', draftPaths: [first, second], force: false, seedDir });
    const reversed = run({ mode: 'check', draftPaths: [second, first], force: false, seedDir });
    expect(forward.code).toBe(0);
    // ARGV ORDER MUST NOT DECIDE: the old gate blamed whichever file came second.
    expect(reversed.code).toBe(0);
    expect(forward.stdout).toContain('1 identical');
    expect(reversed.stdout).toContain('1 identical');
  });

  it("answers a typo'd draft path with a readable message, not a node:fs stack trace", () => {
    const missing = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-gone-')), 'yok.md');
    const { code, stderr } = run({
      mode: 'check',
      draftPaths: [missing],
      force: false,
      seedDir: writeSeedDir(SEED_ROWS),
    });
    expect(code).toBe(1);
    expect(stderr).toContain(`${missing} — no such file`);
    expect(stderr).not.toContain('ENOENT');
  });

  it('refuses every mode when a committed seed file does not parse', () => {
    const seedDir = writeSeedDir(SEED_ROWS);
    fs.writeFileSync(
      path.join(seedDir, 'broken.countries.ts'),
      `export const ROWS = [\n  { isoCode: 'CC' nameTr: 'Gama' },\n];\n`,
      'utf8',
    );
    const { code, stdout, stderr } = run({
      mode: 'check',
      draftPaths: [writeDraft(GOOD_DRAFT)],
      force: false,
      seedDir,
    });
    expect(code).toBe(1);
    expect(stderr).toContain('seed source does not parse');
    expect(stdout).toBe('');
  });
});
