/**
 * Shared SHELL for the MÜFREDAT climate-name mapping one-off (M1) — the FIDELITY RULE for the
 * only line in this repo that publishes a per-province value which no prose lane can see.
 *
 * WHY A FOURTH LANE EXISTS AT ALL, in the terms `ENGINEERING.md` §8 sets. The three prose lanes
 * all do the same thing: fold a string-literal chain out of the seed AST and byte-compare it
 * against a markdown draft. `climateCurriculumNameTr` cannot be checked that way, and not by
 * accident — its 81 values are REFERENCES to eight shared constants (so a typo is a compile
 * error), and a constant reference is by definition not a foldable literal chain. Pointing the
 * prose lane at it yields `unfoldable`, i.e. a red that says nothing; pointing `pnpm
 * seed:transcribe` at it yields the false green §8 names, because that pipeline's whole world is
 * `src/database/seeds/countries/`.
 *
 * And the value NEEDS a gate: ENGINEERING §5 requires a WRITE-PATH check on any line that
 * publishes values, "because range and ordering invariants cannot detect a plausible-but-wrong
 * value". Seeding "Çorum → Karadeniz iklimi" would satisfy every invariant in
 * `seed-geography.ts` (the pair is expected, so no note is demanded, so nothing fires) and be
 * false on the page. The only thing that can catch it is a re-read of the source table.
 *
 * WHAT IS CHECKED — three joins, over all 81 rows:
 *   1. **name -> curriculum name.** Every NET row of the brief's §3 tables must equal the
 *      committed seed's value for that province.
 *   2. **the ten BELİRSİZ rows -> the OWNER DECISION.** The brief deliberately refuses to pick
 *      a name for those; the decision lives in `BELIRSIZ_OVERRIDES` below, next to the ruling
 *      that made it. The check is two-sided: the seed must match the override AND the brief's
 *      cell must still SAY `BELİRSİZ` — so if the brief is ever revised to resolve a row, the
 *      now-stale override fails instead of silently outranking its own source.
 *   3. **the brief's Köppen column -> the seed's `climateKoppen`, 81/81.** This is the join that
 *      actually catches the dangerous class: a row shifted by one in a hand-transcribed table
 *      still produces valid-looking names, but its Köppen code stops agreeing. NOVA ran this
 *      cross-check once by hand; committing it makes it repeatable.
 *
 * THE FOUR SHARED REFUSALS (PR #93, Atlas ruling AS-7) — a new lane must carry all four, and
 * three of them apply here verbatim: (1) NOTHING EXPECTED — a brief that parses to zero rows, or
 * an empty override table, fails instead of printing "checked 0"; (2) THE COMMITTED SEED DOES
 * NOT PARSE — `ts.createSourceFile` is error-tolerant, so every mode would otherwise read a
 * silently incomplete index; (3) AN UNREADABLE SOURCE PATH is answered by the shared
 * `renderDraftReadFailures` wording, never a `node:fs` stack trace. The fourth (TIGHT JOINS
 * REPORTED IN `check`) has NO analogue here and its absence is deliberate rather than an
 * omission: that refusal exists because the prose lanes REJOIN hard-wrapped lines with a
 * heuristic, and both sides of `check` run the same heuristic so it agrees with itself. This
 * lane reconstructs nothing — every value is one markdown table cell on one line — so there is
 * no heuristic that could agree with itself. If a future revision of this file ever starts
 * joining anything, it inherits that refusal with it.
 *
 * Deliberately `import.meta`-free so a CommonJS (ts-jest) spec can import it; the entry point
 * (`oneoff-m1-province-curriculum.ts`) owns `import.meta`, argv and the usage banner.
 */
import * as fs from 'node:fs';

import ts from 'typescript';

import { readDraftFiles, renderDraftReadFailures } from './draft-io.ts';
import { foldProvinceName } from './oneoff-province-climate-extract.ts';
import { foldStringConcat, syntaxErrorsIn } from './seed-reader.ts';

/**
 * The ten rows the brief marks `BELİRSİZ`, with the name the OWNER ruled and the ruling that
 * ruled it. This table IS the decision; the brief only supplies the candidates and the evidence.
 *
 * Kept here rather than derived from the seed on purpose: deriving it would make the check
 * circular (the seed would be verified against itself). A reviewer reading this file should be
 * able to trace every one of the ten to a dated ruling without opening anything else.
 */
export interface BelirsizOverride {
  readonly name: string;
  readonly curriculumName: string;
  /** The ruling that fixed this name — quoted so a stale entry is visible on sight. */
  readonly ruling: string;
}

export const BELIRSIZ_OVERRIDES: readonly BelirsizOverride[] = [
  // Two MEB sources disagree (Harita 1.39 draws a separate Göller Yöresi area; the TYT summary
  // lists both provinces under Akdeniz). The owner ruled the map, with the conflict stated in
  // each province's note rather than hidden.
  { name: 'Isparta', curriculumName: 'Göller Yöresi geçiş iklimi', ruling: 'DEC 2026-08-05f #1' },
  { name: 'Burdur', curriculumName: 'Göller Yöresi geçiş iklimi', ruling: 'DEC 2026-08-05f #1' },
  // The two maps place the province in different areas; the owner closed these three by name.
  { name: 'Kütahya', curriculumName: 'İç Anadolu karasal iklimi', ruling: 'DEC 2026-08-06a #1' },
  { name: 'Amasya', curriculumName: 'Karadeniz iklimi', ruling: 'DEC 2026-08-06a #2' },
  { name: 'Tokat', curriculumName: 'Karadeniz iklimi', ruling: 'DEC 2026-08-06a #2' },
  // The remaining five follow NOVA's §5 recommendation under the owner's standing approach for
  // boundary rows (name the strongest reading, carry the ambiguity in the note).
  { name: 'Tekirdağ', curriculumName: 'Marmara geçiş iklimi', ruling: 'DEC 2026-08-05f #3' },
  { name: 'Çanakkale', curriculumName: 'Marmara geçiş iklimi', ruling: 'DEC 2026-08-05f #3' },
  { name: 'Balıkesir', curriculumName: 'Marmara geçiş iklimi', ruling: 'DEC 2026-08-05f #3' },
  {
    name: 'Gümüşhane',
    curriculumName: 'Doğu Anadolu karasal iklimi',
    ruling: 'DEC 2026-08-05f #3',
  },
  { name: 'Bayburt', curriculumName: 'Doğu Anadolu karasal iklimi', ruling: 'DEC 2026-08-05f #3' },
];

/** One row read out of the brief's §3 tables. */
export interface BriefRow {
  readonly name: string;
  /** Cell 2 verbatim, `**` stripped. `BELİRSİZ` rows keep their whole "BELİRSİZ — a / b" text. */
  readonly curriculumCell: string;
  readonly koppen: string;
  /** Cell 5 — `NET` or `BELİRSİZ`. */
  readonly status: string;
  readonly line: number;
}

/** One committed province row, as far as this tool cares. */
export interface CommittedCurriculumRow {
  readonly plate: string;
  readonly nameTr: string;
  readonly climateKoppen: string | null;
  readonly climateCurriculumNameTr: string | null;
  /** The identifier the seed uses for the name, when it is a constant reference. */
  readonly curriculumConstant: string | null;
}

/** `**Akdeniz iklimi**` -> `Akdeniz iklimi`. Table cells bold the rows the brief emphasises. */
function stripEmphasis(cell: string): string {
  return cell.replace(/\*\*/gu, '').trim();
}

/** A `### 3.<n>` heading opens a province table; `### 3.8` (the distribution summary) closes it. */
const TABLE_SECTION_RE = /^###\s+3\.(?<index>[1-7])\s/u;
const ANY_SECTION_RE = /^###?\s/u;

/**
 * Read the province rows out of the brief's §3.1-3.7 markdown tables.
 *
 * Header and separator rows are dropped by shape, not by counting: a table whose columns are
 * reordered later would change the meaning of every cell, so the header row is verified to start
 * with `İl` before its table is accepted.
 */
export function parseBriefRows(markdown: string): { rows: BriefRow[]; problems: string[] } {
  const rows: BriefRow[] = [];
  const problems: string[] = [];
  const lines = markdown.replace(/\r\n?/gu, '\n').split('\n');

  let inTable = false;
  let headerSeen = false;
  lines.forEach((line, index) => {
    if (TABLE_SECTION_RE.test(line)) {
      inTable = true;
      headerSeen = false;
      return;
    }
    if (ANY_SECTION_RE.test(line)) {
      inTable = false;
      return;
    }
    if (!inTable || !line.startsWith('|')) return;

    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 5) return;
    if (cells.every((cell) => /^-+$/u.test(cell))) return;
    if (cells[0] === 'İl') {
      headerSeen = true;
      if (cells[1] !== 'Müfredat iklim adı' || cells[2] !== 'Köppen' || cells[4] !== 'Durum') {
        problems.push(
          `  line ${index + 1}: the §3 table header changed shape — refusing to read its cells ` +
            `positionally (${JSON.stringify(cells.slice(0, 5))})`,
        );
      }
      return;
    }
    if (!headerSeen) return;
    rows.push({
      name: stripEmphasis(cells[0] ?? ''),
      curriculumCell: stripEmphasis(cells[1] ?? ''),
      koppen: stripEmphasis(cells[2] ?? ''),
      status: stripEmphasis(cells[4] ?? ''),
      line: index + 1,
    });
  });

  return { rows, problems };
}

/**
 * Top-level `const NAME = '<string>'` declarations of the seed file, folded to their values.
 *
 * WHY THIS LANE RESOLVES CONSTANTS AND THE OTHERS DO NOT: the fields the prose lanes read are
 * literal chains, so they never meet an identifier. Everything this lane compares
 * (`climateKoppen`, `climateCurriculumNameTr`) is a constant reference by design, so resolving
 * them IS the job. Only same-file, top-level, string-valued `const`s are resolved — an
 * identifier this map does not know stays unresolved and is reported, never guessed.
 */
export function readSeedConstants(source: ts.SourceFile): Map<string, string> {
  const constants = new Map<string, string>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue;
      const value = foldStringConcat(declaration.initializer);
      if (value !== null) constants.set(declaration.name.text, value);
    }
  }
  return constants;
}

/** Fold every `plateCode`-bearing seed row, resolving the two constant-referenced fields. */
export function readCommitted(seedFile: string): CommittedCurriculumRow[] {
  const text = fs.readFileSync(seedFile, 'utf8');
  const source = ts.createSourceFile(seedFile, text, ts.ScriptTarget.Latest, true);
  const constants = readSeedConstants(source);
  const byPlate = new Map<string, CommittedCurriculumRow>();

  const resolve = (
    initializer: ts.Expression,
  ): { value: string | null; constant: string | null } => {
    if (ts.isIdentifier(initializer)) {
      return { value: constants.get(initializer.text) ?? null, constant: initializer.text };
    }
    return { value: foldStringConcat(initializer), constant: null };
  };

  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      let plate: string | null = null;
      let nameTr: string | null = null;
      let climateKoppen: string | null = null;
      let curriculumName: string | null = null;
      let curriculumConstant: string | null = null;
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue;
        const key = property.name.text;
        if (key === 'plateCode') plate = foldStringConcat(property.initializer);
        else if (key === 'nameTr') nameTr = foldStringConcat(property.initializer);
        else if (key === 'climateKoppen') climateKoppen = resolve(property.initializer).value;
        else if (key === 'climateCurriculumNameTr') {
          const resolved = resolve(property.initializer);
          curriculumName = resolved.value;
          curriculumConstant = resolved.constant;
        }
      }
      if (plate !== null && nameTr !== null) {
        byPlate.set(plate, {
          plate,
          nameTr,
          climateKoppen,
          climateCurriculumNameTr: curriculumName,
          curriculumConstant,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return [...byPlate.values()].sort((a, b) => a.plate.localeCompare(b.plate));
}

/**
 * Compare the brief (plus the owner overrides) against the committed seed.
 *
 * Returns one human-readable problem per disagreement. An empty array means every one of the
 * three joins holds for every row.
 */
export function compare(
  briefRows: readonly BriefRow[],
  committed: readonly CommittedCurriculumRow[],
  overrides: readonly BelirsizOverride[],
): string[] {
  const problems: string[] = [];
  const overrideByName = new Map(overrides.map((o) => [foldProvinceName(o.name), o]));
  const seedByName = new Map(committed.map((row) => [foldProvinceName(row.nameTr), row]));
  const matchedNames = new Set<string>();

  for (const briefRow of briefRows) {
    const folded = foldProvinceName(briefRow.name);
    const seedRow = seedByName.get(folded);
    if (seedRow === undefined) {
      problems.push(`  ${briefRow.name} (brief line ${briefRow.line}) — no seed row of that name`);
      continue;
    }
    matchedNames.add(folded);
    const label = `${seedRow.plate} ${seedRow.nameTr}`;

    // Join 3 — the row-shift detector. Run FIRST: if the Köppen codes disagree, the name
    // comparison below is comparing two different provinces' rows and its verdict is noise.
    if (briefRow.koppen !== (seedRow.climateKoppen ?? '')) {
      problems.push(
        `  ${label} — brief Köppen ${JSON.stringify(briefRow.koppen)} != seed ` +
          `${JSON.stringify(seedRow.climateKoppen)} (brief line ${briefRow.line}); the tables are ` +
          `misaligned, so every name on this row is suspect`,
      );
    }

    const override = overrideByName.get(folded);
    if (briefRow.status === 'BELİRSİZ') {
      if (override === undefined) {
        problems.push(
          `  ${label} — the brief marks this row BELİRSİZ but no owner override covers it ` +
            `(brief line ${briefRow.line})`,
        );
        continue;
      }
      if (seedRow.climateCurriculumNameTr !== override.curriculumName) {
        problems.push(
          `  ${label} — seed ${JSON.stringify(seedRow.climateCurriculumNameTr)} != ` +
            `${override.ruling} ${JSON.stringify(override.curriculumName)}`,
        );
      }
      continue;
    }

    // A NET row that an override also claims means the brief was revised under the ruling's
    // feet: the override is now either redundant or contradictory, and either way a human must
    // look. Silently preferring one side is what makes a stale decision table invisible.
    if (override !== undefined) {
      problems.push(
        `  ${label} — the brief now resolves this row (${briefRow.status}) but a BELİRSİZ ` +
          `override (${override.ruling}) still claims it — the override is stale`,
      );
      continue;
    }
    if (briefRow.curriculumCell !== seedRow.climateCurriculumNameTr) {
      problems.push(
        `  ${label} — brief ${JSON.stringify(briefRow.curriculumCell)} != seed ` +
          `${JSON.stringify(seedRow.climateCurriculumNameTr)} (brief line ${briefRow.line})`,
      );
    }
  }

  for (const row of committed) {
    if (!matchedNames.has(foldProvinceName(row.nameTr))) {
      problems.push(`  ${row.plate} ${row.nameTr} — seeded but absent from the brief's §3 tables`);
    }
    if (row.climateCurriculumNameTr === null) {
      const via =
        row.curriculumConstant === null
          ? 'the field is missing from this row'
          : `the constant ${row.curriculumConstant} could not be resolved in this file`;
      problems.push(`  ${row.plate} ${row.nameTr} — no curriculum name: ${via}`);
    }
  }

  for (const override of overrides) {
    if (!seedByName.has(foldProvinceName(override.name))) {
      problems.push(`  ${override.name} — override names a province the seed does not have`);
    }
  }

  return problems;
}

export interface CurriculumRunOptions {
  readonly mode: 'emit' | 'check';
  readonly briefPaths: readonly string[];
  readonly seedFile: string;
  readonly overrides?: readonly BelirsizOverride[];
}

/**
 * `emit` prints the seed property line for every province, derived from the brief + overrides —
 * the same output the 81 committed lines were produced from, so a reviewer can regenerate and
 * diff instead of reading 81 values.
 *
 * The constant NAME is looked up in the seed's own constant table rather than a second hard-coded
 * map: exactly one identifier may hold each of the eight names, so a duplicate or a missing
 * constant is reported instead of guessed.
 */
function emitLines(
  briefRows: readonly BriefRow[],
  committed: readonly CommittedCurriculumRow[],
  overrides: readonly BelirsizOverride[],
  seedFile: string,
): { lines: string[]; problems: string[] } {
  const text = fs.readFileSync(seedFile, 'utf8');
  const source = ts.createSourceFile(seedFile, text, ts.ScriptTarget.Latest, true);
  const constants = readSeedConstants(source);
  const identifierByValue = new Map<string, string[]>();
  for (const [identifier, value] of constants) {
    if (!identifier.startsWith('CURRICULUM_')) continue;
    identifierByValue.set(value, [...(identifierByValue.get(value) ?? []), identifier]);
  }

  const overrideByName = new Map(overrides.map((o) => [foldProvinceName(o.name), o]));
  const seedByName = new Map(committed.map((row) => [foldProvinceName(row.nameTr), row]));
  const lines: string[] = [];
  const problems: string[] = [];

  for (const briefRow of briefRows) {
    const folded = foldProvinceName(briefRow.name);
    const seedRow = seedByName.get(folded);
    if (seedRow === undefined) continue;
    const name =
      briefRow.status === 'BELİRSİZ'
        ? overrideByName.get(folded)?.curriculumName
        : briefRow.curriculumCell;
    if (name === undefined) continue;
    const identifiers = identifierByValue.get(name) ?? [];
    if (identifiers.length !== 1) {
      problems.push(
        `  ${seedRow.plate} ${seedRow.nameTr} — ${identifiers.length} CURRICULUM_* constants hold ` +
          `${JSON.stringify(name)}; expected exactly one`,
      );
      continue;
    }
    lines.push(`// ${seedRow.plate} ${seedRow.nameTr}`);
    lines.push(`    climateCurriculumNameTr: ${identifiers[0]},`);
  }

  return { lines, problems };
}

/**
 * Run `emit` or `check`. Returns the process exit code: 0 on success, 1 on any refusal or
 * disagreement.
 */
export function runCurriculum({
  mode,
  briefPaths,
  seedFile,
  overrides = BELIRSIZ_OVERRIDES,
}: CurriculumRunOptions): number {
  // REFUSAL 1a — an empty decision table would make every BELİRSİZ row fail with a confusing
  // message, or (if the brief ever stopped marking them) sail through checking nothing.
  if (overrides.length === 0) {
    process.stderr.write('error: the BELİRSİZ override table is empty — nothing to decide with\n');
    return 1;
  }

  // REFUSAL 2 — `ts.createSourceFile` is error-tolerant, so a seed with a missing comma would be
  // read as a silently incomplete index and "check" would report a green it did not earn.
  const syntaxErrors = syntaxErrorsIn(fs.readFileSync(seedFile, 'utf8'));
  if (syntaxErrors.length > 0) {
    process.stderr.write(
      `seed source does not parse — refusing to run, because every mode would be reading an\n` +
        `incomplete index (and "check" would report a green it did not earn):\n` +
        `  ${seedFile}\n` +
        `${syntaxErrors.map((error) => `  ${error}`).join('\n')}\n`,
    );
    return 1;
  }

  // REFUSAL 3 — a mistyped path is answered by the shared wording, never a node:fs stack trace.
  const { files, failures } = readDraftFiles(briefPaths);
  if (failures.length > 0) {
    process.stderr.write(renderDraftReadFailures(failures));
    return 1;
  }

  const briefRows: BriefRow[] = [];
  const parseProblems: string[] = [];
  for (const file of files) {
    const parsed = parseBriefRows(file.markdown);
    briefRows.push(...parsed.rows);
    parseProblems.push(...parsed.problems.map((problem) => `  ${file.path}\n  ${problem}`));
  }
  if (parseProblems.length > 0) {
    process.stderr.write(`error: brief table problem(s):\n${parseProblems.join('\n')}\n`);
    return 1;
  }

  // REFUSAL 1b — a brief the parser understood NOTHING in must not print "checked 0" and exit 0.
  // Measured on what was UNDERSTOOD, which is the whole point: it is the mirror of the empty
  // target list, and it is what turns "you passed the wrong file" from a green into a red.
  if (briefRows.length === 0) {
    process.stderr.write(
      `error: no §3 province rows parsed from: ${briefPaths.join(', ')}\n` +
        `Pass the mapping brief itself (its "## 3. 81 il tablosu" section), not a summary.\n`,
    );
    return 1;
  }

  const committed = readCommitted(seedFile);
  if (committed.length === 0) {
    process.stderr.write(`error: no province rows found in the seed: ${seedFile}\n`);
    return 1;
  }

  if (mode === 'emit') {
    const { lines, problems } = emitLines(briefRows, committed, overrides, seedFile);
    if (problems.length > 0) {
      process.stderr.write(`error: cannot emit:\n${problems.join('\n')}\n`);
      return 1;
    }
    process.stdout.write(`${lines.join('\n')}\n`);
    return 0;
  }

  const problems = compare(briefRows, committed, overrides);
  process.stdout.write(
    `checked ${briefRows.length} brief row(s) against ${committed.length} seed row(s): ` +
      `${problems.length} disagreement(s)\n`,
  );
  if (problems.length > 0) {
    process.stdout.write(`\nDISAGREEMENTS:\n${problems.join('\n')}\n`);
    return 1;
  }
  return 0;
}

/** Parse `<emit|check> <brief.md> [...]` argv; returns null when the usage is wrong. */
export function parseCurriculumArgs(
  argv: readonly string[],
): { mode: 'emit' | 'check'; briefPaths: readonly string[] } | null {
  const [mode, ...briefPaths] = argv;
  if ((mode !== 'emit' && mode !== 'check') || briefPaths.length === 0) return null;
  return { mode, briefPaths };
}
