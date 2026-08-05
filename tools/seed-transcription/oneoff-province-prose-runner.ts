/**
 * Shared SHELL for the province PROSE one-offs (P1, …) — the narrative fields the climate lane
 * structurally cannot see.
 *
 * WHY A SECOND PROVINCE LANE EXISTS AT ALL. `oneoff-province-climate-runner.ts` folds exactly ONE
 * field out of the AST (`climateNarrativeTr`, hard-coded at its `readCommitted`). A PR that
 * corrects `hydrographyNoteTr` therefore has NO gate available to it:
 *
 *   - pointing `pnpm seed:transcribe` at it reports a green it did not earn, because that
 *     pipeline's entire world is `src/database/seeds/countries/` and it never opens
 *     `province.seed-data.ts` (the false green `ENGINEERING.md` §8 names, and a real PR #70
 *     review finding);
 *   - widening the climate runner would edit the byte-fidelity core that two SHIPPED waves (N1,
 *     N2) depend on, to serve one field — and the 2026-07-25 Atlas ruling ("a new wave is a new
 *     target list, deliberately NOT a generalisation") points the other way.
 *
 * So this lane is FIELD-PARAMETRIC and the climate lane is left untouched (Atlas ruling AS-3,
 * 2026-08-05).
 *
 * WHAT IS REUSED is precisely the part that kills the PR #43 dropped-space bug class: the draft
 * parser (`parseDraft`), the AST folder (`foldStringConcat`) and the property-tested lossless
 * emitter (`emitConcat`). No prose is ever retyped by hand. The `emit`/`check` exit-code contract
 * is the same one both existing lanes share.
 *
 * Deliberately `import.meta`-free: the wave entry point owns that, so ts-jest (which transpiles to
 * CommonJS) can import this module from a spec. Same split, and the same reason, as the climate
 * runner.
 */
import * as fs from 'node:fs';

import ts from 'typescript';

import { type NarrativeField, parseDraft } from './draft-parser.ts';
import { emitConcat } from './emit.ts';
import { foldProvinceName } from './oneoff-province-climate-extract.ts';
import { foldStringConcat, syntaxErrorsIn } from './seed-reader.ts';

/** One field of one province this wave transcribes. `name` is how the DRAFT heads the section. */
export interface ProseTarget {
  readonly name: string;
  readonly plate: string;
  readonly field: NarrativeField;
}

/** One committed seed row, as far as this tool cares. */
export interface CommittedRow {
  readonly nameTr: string | null;
  /** Only the fields asked for, and only those the row actually carries AND we could fold. */
  readonly values: ReadonlyMap<string, string>;
  /**
   * Fields the row DOES carry but whose initializer is not a foldable string literal chain (a
   * template literal, a shared constant, a function call).
   *
   * Tracked separately so `check` can say so. Lumping them in with "absent from the seed" gives
   * the right exit code with a diagnosis that sends the reader to write a field that is already
   * there — the wrong-rationale-message class this lane exists to avoid.
   */
  readonly unfoldable: ReadonlySet<string>;
}

/** Property indent of a field inside a province seed object (`    hydrographyNoteTr:`). */
const PROPERTY_INDENT = 4;

/**
 * Syntax errors in the committed seed source. Empty on a healthy file.
 *
 * WHY THIS IS CHECKED RATHER THAN ASSUMED: `ts.createSourceFile` is ERROR-TOLERANT. Handed a seed
 * file with a missing comma it still returns a tree — one quietly missing properties or whole
 * rows. `check` would then compare against an index that never saw the field and print
 * "0 drifted": a false green on the very command `ENGINEERING.md` §8 mandates as the gate. Syntax
 * is not this gate's remit, but a gate a broken file can defeat is not a gate. Same refusal the
 * country lane's `cli.ts` performs.
 */
export function seedSyntaxErrors(seedFile: string): string[] {
  return syntaxErrorsIn(fs.readFileSync(seedFile, 'utf8'));
}

/**
 * Fold every `plateCode`-bearing seed row out of the AST, keyed by plate code, capturing the
 * requested fields.
 *
 * Rows are included even when they carry NONE of the requested fields: the name→plate cross-check
 * has to be able to see a province whose field has not been authored yet, and `check` still has to
 * report such a row as "not yet seeded" rather than as a missing row.
 */
export function readCommitted(
  seedFile: string,
  fields: readonly string[],
): Map<string, CommittedRow> {
  const text = fs.readFileSync(seedFile, 'utf8');
  const source = ts.createSourceFile(seedFile, text, ts.ScriptTarget.Latest, true);
  const wanted = new Set(fields);
  const byPlate = new Map<string, CommittedRow>();

  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      let plate: string | null = null;
      let nameTr: string | null = null;
      const values = new Map<string, string>();
      const unfoldable = new Set<string>();
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name = ts.isIdentifier(property.name)
          ? property.name.text
          : ts.isStringLiteralLike(property.name)
            ? property.name.text
            : null;
        if (name === null) continue;
        if (name === 'plateCode') plate = foldStringConcat(property.initializer);
        else if (name === 'nameTr') nameTr = foldStringConcat(property.initializer);
        else if (wanted.has(name)) {
          const folded = foldStringConcat(property.initializer);
          if (folded !== null) values.set(name, folded);
          else unfoldable.add(name);
        }
      }
      if (plate !== null) byPlate.set(plate, { nameTr, values, unfoldable });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return byPlate;
}

/**
 * `19. Çorum` -> `Çorum`. The ordinal is wave-local numbering, never part of the name.
 *
 * A TRAILING PARENTHETICAL IS ALSO DROPPED (`19. Çorum (Cfb)` -> `Çorum`), matching the climate
 * lane's own heading regex. The province drafts annotate headings with the Köppen code, so
 * without this a perfectly well-formed wave draft would fail the "target list does not claim"
 * guard — failing loud, but pointing at the target table instead of at the heading shape.
 */
export function sectionName(heading: string): string {
  return heading
    .replace(/^\d+[.)]\s*/u, '')
    .replace(/\s*\([^)]*\)\s*$/u, '')
    .trim();
}

/** The key a target and a parsed draft body meet on. */
function targetKey(plate: string, field: string): string {
  return `${plate} ${field}`;
}

/**
 * THE NAME→PLATE GUARD. Assert every target's plate points at the seed row for the province the
 * draft heading names. Without it the mapping is the single unguarded link in the chain: `emit`
 * writes to the plate the table names and `check` folds the same plate back, so a wrong plate
 * would publish one province's prose on another province's page with every gate green.
 */
export function checkTargetsAgainstSeed(
  targets: readonly ProseTarget[],
  committed: ReadonlyMap<string, CommittedRow>,
): string[] {
  const problems: string[] = [];
  for (const target of targets) {
    const row = committed.get(target.plate);
    if (row === undefined) {
      problems.push(`  ${target.plate} ${target.name} — no seed row carries this plate code`);
      continue;
    }
    if (row.nameTr === null) {
      problems.push(
        `  ${target.plate} ${target.name} — the seed row has no nameTr to check against`,
      );
      continue;
    }
    if (foldProvinceName(row.nameTr) !== foldProvinceName(target.name)) {
      problems.push(
        `  ${target.plate} ${target.name} — the seed row for this plate is "${row.nameTr}"`,
      );
    }
  }
  return problems;
}

export interface DraftBody {
  readonly value: string;
  readonly tightJoins: readonly string[];
}

/**
 * Extract each target's body from the supplied drafts.
 *
 * Every failure mode here is LOUD by design, because each one is silent content corruption:
 *  - a parser error (a mistyped field header) would drop real prose;
 *  - a `## section` + `### field` pair no target claims would never reach the seed while `check`
 *    still exited 0 — the mirror of the "no draft body found" failure;
 *  - two drafts naming the same province+field with different prose is the "pick a winner"
 *    situation the country lane also refuses, and for the same reason.
 *
 * `warnings` are the parser's non-fatal diagnostics (a `### \`somethingElse\`` header this lane
 * does not transcribe). They are RETURNED rather than dropped because `parseDraft`'s own contract
 * is "printed and the run continues" — a swallowed warning turns a mistyped field header into
 * prose that silently never reaches the seed, which is the failure this file exists to close.
 */
export function collectBodies(
  contents: readonly string[],
  targets: readonly ProseTarget[],
): { bodies: Map<string, DraftBody>; problems: string[]; warnings: string[] } {
  const bodies = new Map<string, DraftBody>();
  const problems: string[] = [];
  const warnings: string[] = [];

  const byName = new Map<string, ProseTarget>();
  for (const target of targets) {
    byName.set(targetKey(foldProvinceName(target.name), target.field), target);
  }

  contents.forEach((markdown, index) => {
    const { fields, diagnostics } = parseDraft(markdown);
    for (const diagnostic of diagnostics) {
      const line = `  draft #${index + 1}, line ${diagnostic.line}: ${diagnostic.message}`;
      if (diagnostic.severity === 'error') problems.push(line);
      else warnings.push(line);
    }
    for (const parsed of fields) {
      const folded = foldProvinceName(sectionName(parsed.section));
      const target = byName.get(targetKey(folded, parsed.field));
      if (target === undefined) {
        problems.push(
          `  "${parsed.section}" \`${parsed.field}\` (line ${parsed.line}) — ` +
            `a draft section this wave's target list does not claim`,
        );
        continue;
      }
      const key = targetKey(target.plate, target.field);
      const existing = bodies.get(key);
      if (existing !== undefined && existing.value !== parsed.value) {
        problems.push(
          `  ${target.plate} ${target.name}.${target.field} — two drafts carry different prose`,
        );
        continue;
      }
      bodies.set(key, { value: parsed.value, tightJoins: parsed.tightJoins });
    }
  });

  return { bodies, problems, warnings };
}

/**
 * Print every no-separator line join the parser performed, for a human to eyeball. Mirrors the
 * country lane's `reportTightJoins` (`cli.ts`), including its silence when the list is empty.
 */
function reportTightJoins(
  targets: readonly ProseTarget[],
  bodies: ReadonlyMap<string, DraftBody>,
): void {
  const joins = targets.flatMap((target) =>
    (bodies.get(targetKey(target.plate, target.field))?.tightJoins ?? []).map(
      (join) => `  ${target.plate} ${target.name}.${target.field}: ${join}`,
    ),
  );
  if (joins.length === 0) return;
  process.stdout.write(
    `\nNo-space line joins performed (draft broke a line after "'" or "-"; verify each):\n` +
      `${joins.join('\n')}\n`,
  );
}

export interface ProseRunOptions {
  readonly mode: 'emit' | 'check';
  readonly draftPaths: readonly string[];
  readonly targets: readonly ProseTarget[];
  readonly seedFile: string;
}

/**
 * Run one wave's `emit` or `check`. Returns the process exit code: 0 on success, 1 when the wave's
 * own bookkeeping is inconsistent or, in `check`, when the committed seed diverges from the draft.
 *
 * NOTE ON THE COUNT. `check` prints `checked N field(s)` where N is the TARGET-TABLE length, not
 * the number of sections a draft happened to parse. A draft the parser understood nothing in
 * therefore cannot print "checked 0 field(s)" and exit 0 — it fails the "no draft body found"
 * guard first. That is the false-green hole the country lane leaves open (there, an unparseable
 * draft yields zero items and a green exit), closed here structurally rather than by convention.
 */
export function runProse({ mode, draftPaths, targets, seedFile }: ProseRunOptions): number {
  // AN EMPTY TARGET LIST WOULD SAIL THROUGH EVERY GUARD BELOW and print "checked 0 field(s)"
  // with exit 0 — reintroducing, via the wave entry point, exactly the false green this lane's
  // count is structured to prevent. A wave with nothing to transcribe is a mistake, not a pass.
  if (targets.length === 0) {
    process.stderr.write('error: the wave target list is empty — nothing to emit or check\n');
    return 1;
  }

  const syntaxErrors = seedSyntaxErrors(seedFile);
  if (syntaxErrors.length > 0) {
    process.stderr.write(
      `seed source does not parse — refusing to run, because every mode would be reading an\n` +
        `incomplete index (and "check" would report a green it did not earn):\n` +
        `${syntaxErrors.map((e) => `  ${e}`).join('\n')}\n`,
    );
    return 1;
  }

  const contents = draftPaths.map((draftPath) => fs.readFileSync(draftPath, 'utf8'));
  const committed = readCommitted(
    seedFile,
    targets.map((target) => target.field),
  );

  const tableProblems = checkTargetsAgainstSeed(targets, committed);
  if (tableProblems.length > 0) {
    process.stderr.write(
      `error: the wave target list disagrees with the seed:\n${tableProblems.join('\n')}\n`,
    );
    return 1;
  }

  const { bodies, problems, warnings } = collectBodies(contents, targets);
  // Printed BEFORE the guards, so a warning that explains the failure below is visible with it.
  if (warnings.length > 0) {
    process.stderr.write(`warning(s):\n${warnings.join('\n')}\n`);
  }
  if (problems.length > 0) {
    process.stderr.write(`error: draft problem(s):\n${problems.join('\n')}\n`);
    return 1;
  }

  const missingFromDraft = targets.filter(
    (target) => !bodies.has(targetKey(target.plate, target.field)),
  );
  if (missingFromDraft.length > 0) {
    process.stderr.write(
      `error: no draft body found for: ` +
        `${missingFromDraft.map((t) => `${t.plate} ${t.name}.${t.field}`).join(', ')}\n`,
    );
    return 1;
  }

  if (mode === 'emit') {
    for (const target of targets) {
      const body = bodies.get(targetKey(target.plate, target.field));
      if (body === undefined) continue;
      process.stdout.write(
        `// ${target.plate} ${target.name}.${target.field} (${body.value.length} chars)\n`,
      );
      process.stdout.write(`${emitConcat(body.value, PROPERTY_INDENT, target.field)}\n`);
      for (const join of body.tightJoins) process.stdout.write(`//   tight-join: ${join}\n`);
      process.stdout.write('\n');
    }
    return 0;
  }

  const drifted: string[] = [];
  const missing: string[] = [];
  for (const target of targets) {
    const draftValue = bodies.get(targetKey(target.plate, target.field))?.value ?? '';
    const row = committed.get(target.plate);
    const seedValue = row?.values.get(target.field) ?? null;
    if (seedValue === null) {
      // Distinguish "the field is not there" from "it is there but we could not fold it": the
      // second sends the reader to the seed row to look at a template literal or a shared
      // constant, the first to write the field at all. Same exit code, honest diagnosis.
      const reason =
        row?.unfoldable.has(target.field) === true
          ? 'present in the seed but its value is not a foldable string-literal chain'
          : 'absent from the seed';
      missing.push(`  ${target.plate} ${target.name}.${target.field} — ${reason}`);
      continue;
    }
    if (seedValue !== draftValue) {
      let at = 0;
      while (at < seedValue.length && at < draftValue.length && seedValue[at] === draftValue[at]) {
        at += 1;
      }
      drifted.push(
        `  ${target.plate} ${target.name}.${target.field} — diverges at offset ${at}\n` +
          `      draft: ${JSON.stringify(draftValue.slice(Math.max(0, at - 30), at + 40))}\n` +
          `      seed : ${JSON.stringify(seedValue.slice(Math.max(0, at - 30), at + 40))}`,
      );
    }
  }

  process.stdout.write(
    `checked ${targets.length} field(s): ` +
      `${targets.length - drifted.length - missing.length} identical, ` +
      `${drifted.length} drifted, ${missing.length} not yet seeded\n`,
  );
  if (drifted.length > 0) process.stdout.write(`\nDRIFT:\n${drifted.join('\n')}\n`);
  if (missing.length > 0) process.stdout.write(`\nNOT SEEDED:\n${missing.join('\n')}\n`);

  // THE TIGHT-JOIN SIGNAL MUST SURVIVE `check`, not only `emit`. `check` is the mandated
  // fidelity gate, and both of its sides run the SAME parser — so a wrongly glued line join
  // ("Karadeniz-" + "Akdeniz") agrees with itself and exits 0. The heuristic's every firing is
  // reported for a human to eyeball (`draft-parser.ts` JOIN RULE); computing that list and
  // throwing it away here would make the gate blind to the exact PR #43 class it exists to stop.
  // Reporting only — deliberately NOT a failure mode, since the rule is right far more often
  // than not and a hard failure would train people to route around the gate.
  reportTightJoins(targets, bodies);
  return drifted.length > 0 || missing.length > 0 ? 1 : 0;
}
