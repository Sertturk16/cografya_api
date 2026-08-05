/**
 * Shared SHELL for the province `climateNarrativeTr` wave one-offs (N1, N2, …).
 *
 * Holds the file IO, the committed-seed AST fold and the `emit`/`check` drivers; the pure
 * classification logic lives in `oneoff-province-climate-extract.ts` and the per-wave entry
 * points (target list + usage banner + direct-invocation guard) in
 * `oneoff-n<wave>-province-climate.ts`. Deliberately `import.meta`-free: the wave CLIs own that,
 * so nothing here can break a ts-jest (CommonJS) import of a sibling module.
 *
 * WHY SHARED RATHER THAN COPIED PER WAVE: `check` IS the byte-fidelity gate. Forking its diff
 * and its exit-code contract into one copy per wave would let the gate weaken in one wave
 * without anyone noticing; keeping one copy means re-running the N1 command also regression-tests
 * the code N2's gate runs on. The wave-specific part is data (the target list), and data is what
 * gets passed in.
 */
import * as fs from 'node:fs';

import ts from 'typescript';

import { readDraftFiles, renderDraftReadFailures } from './draft-io.ts';
import { emitConcat } from './emit.ts';
import {
  collectFromContents,
  collectSectionHeadings,
  type ExtractResult,
  foldProvinceName,
  type WaveTarget,
} from './oneoff-province-climate-extract.ts';
import { foldStringConcat, syntaxErrorsIn } from './seed-reader.ts';

/** One committed seed row, as far as this tool cares: its name and its narrative (if any). */
export interface CommittedProvince {
  readonly nameTr: string | null;
  /** `null` when the row exists but carries no `climateNarrativeTr` yet. */
  readonly narrative: string | null;
}

/**
 * Syntax errors in the committed seed source. Empty on a healthy file.
 *
 * WHY THIS IS CHECKED RATHER THAN ASSUMED: `ts.createSourceFile` (used by `readCommitted` below)
 * is ERROR-TOLERANT. Handed a seed file with a missing comma it still returns a tree — one quietly
 * missing properties or whole rows. `check` would then compare against an index that never saw the
 * narrative and print "0 drifted": a false green on the very command `ENGINEERING.md` §8 mandates
 * as the gate. Syntax is not this gate's remit, but a gate a broken file can defeat is not a gate.
 * The same refusal the country lane's `cli.ts` and the prose lane's runner already perform — the
 * three copies of the contract must carry the same refusals, not one each.
 */
export function seedSyntaxErrors(seedFile: string): string[] {
  return syntaxErrorsIn(fs.readFileSync(seedFile, 'utf8'));
}

/**
 * Fold every `plateCode`-bearing seed row out of the AST, keyed by plate code.
 *
 * Rows WITHOUT a `climateNarrativeTr` are included (with `narrative: null`) on purpose: the
 * name→plate cross-check has to be able to see a province that has not been authored yet, and
 * `check` still reports such a row as "not yet seeded" exactly as before.
 */
export function readCommitted(seedFile: string): Map<string, CommittedProvince> {
  const text = fs.readFileSync(seedFile, 'utf8');
  const source = ts.createSourceFile(seedFile, text, ts.ScriptTarget.Latest, true);
  const byPlate = new Map<string, CommittedProvince>();

  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      let plate: string | null = null;
      let nameTr: string | null = null;
      let narrative: string | null = null;
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name = ts.isIdentifier(property.name)
          ? property.name.text
          : ts.isStringLiteralLike(property.name)
            ? property.name.text
            : null;
        if (name === 'plateCode') plate = foldStringConcat(property.initializer);
        else if (name === 'nameTr') nameTr = foldStringConcat(property.initializer);
        else if (name === 'climateNarrativeTr') narrative = foldStringConcat(property.initializer);
      }
      if (plate !== null) byPlate.set(plate, { nameTr, narrative });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return byPlate;
}

/**
 * THE NAME→PLATE GUARD. Assert every target's plate points at the seed row for the province the
 * draft heading names. Without it the mapping is the single unguarded link in the chain: `emit`
 * writes to the plate the table names and `check` folds the same plate back, so a wrong plate
 * publishes one province's climate prose on another province's page with every gate green.
 *
 * Returns the human-readable problems; an empty array means the table is consistent with the seed.
 */
export function checkTargetsAgainstSeed(
  targets: readonly WaveTarget[],
  committed: ReadonlyMap<string, CommittedProvince>,
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

/**
 * THE UNKNOWN-SECTION GUARD (the mirror of "no draft body found"). A `## N. <province>` section
 * present in a supplied draft but absent from the wave's target list would otherwise be ignored
 * silently, with `check` exiting 0 and the e2e count guard — which mirrors the same target list —
 * green, while that province never reaches the seed at all.
 *
 * A heading counts as a province ONLY when its name matches a committed seed row: the drafts also
 * number their editorial sections (`## 5. Paylaşılan varlık …`, `## 6. Register …`), which must
 * not be mistaken for provinces.
 */
export function checkDraftsAgainstTargets(
  drafts: readonly string[],
  targets: readonly WaveTarget[],
  committed: ReadonlyMap<string, CommittedProvince>,
): string[] {
  const seedNames = new Set(
    [...committed.values()]
      .map((row) => row.nameTr)
      .filter((name): name is string => name !== null)
      .map(foldProvinceName),
  );
  const targeted = new Set(targets.map((t) => foldProvinceName(t.name)));
  const problems: string[] = [];
  for (const draft of drafts) {
    for (const heading of collectSectionHeadings(draft)) {
      const folded = foldProvinceName(heading);
      if (!seedNames.has(folded) || targeted.has(folded)) continue;
      problems.push(`  ${heading} — a province section no wave target claims`);
    }
  }
  return problems;
}

/** Read each draft path and delegate to the pure, one-authoritative-draft-per-province collector. */
function collect(
  contents: readonly string[],
  targets: readonly WaveTarget[],
): Map<string, ExtractResult> {
  return collectFromContents(contents, targets);
}

/**
 * Print every no-separator line join the extractor performed, for a human to eyeball. Mirrors the
 * country lane's `reportTightJoins` (`cli.ts`) and the prose lane's, including its silence when
 * the list is empty.
 */
function reportTightJoins(
  targets: readonly WaveTarget[],
  bodies: ReadonlyMap<string, ExtractResult>,
): void {
  const joins = targets.flatMap((target) =>
    (bodies.get(target.plate)?.tightJoins ?? []).map(
      (join) => `  ${target.plate} ${target.name}: ${join}`,
    ),
  );
  if (joins.length === 0) return;
  process.stdout.write(
    `\nNo-space line joins performed (draft broke a line after "'" or "-"; verify each):\n` +
      `${joins.join('\n')}\n`,
  );
}

export interface WaveRunOptions {
  readonly mode: 'emit' | 'check';
  readonly draftPaths: readonly string[];
  readonly targets: readonly WaveTarget[];
  readonly seedFile: string;
}

/**
 * Run one wave's `emit` or `check`. Returns the process exit code: 0 on success, 1 when the
 * wave's own bookkeeping is inconsistent (target plate/name mismatch, a draft province no target
 * claims, a target no draft covers) or, in `check`, when the committed seed diverges from the
 * draft.
 *
 * The three bookkeeping guards run in BOTH modes and stay silent when they pass, so a correct
 * wave's stdout/exit code is exactly what it was before they existed — they add failure modes,
 * never output.
 */
export function runWave({ mode, draftPaths, targets, seedFile }: WaveRunOptions): number {
  // AN EMPTY TARGET LIST WOULD SAIL THROUGH EVERY GUARD BELOW and print "checked 0 province(s)"
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

  const { files, failures } = readDraftFiles(draftPaths);
  if (failures.length > 0) {
    process.stderr.write(renderDraftReadFailures(failures));
    return 1;
  }
  const contents = files.map((file) => file.markdown);
  const committed = readCommitted(seedFile);

  const tableProblems = checkTargetsAgainstSeed(targets, committed);
  if (tableProblems.length > 0) {
    process.stderr.write(
      `error: the wave target list disagrees with the seed:\n${tableProblems.join('\n')}\n`,
    );
    return 1;
  }

  const strayProblems = checkDraftsAgainstTargets(contents, targets, committed);
  if (strayProblems.length > 0) {
    process.stderr.write(
      `error: draft province section(s) outside this wave's target list:\n${strayProblems.join('\n')}\n`,
    );
    return 1;
  }

  const bodies = collect(contents, targets);
  const missingFromDraft = targets.filter((t) => !bodies.has(t.plate));
  if (missingFromDraft.length > 0) {
    process.stderr.write(
      `error: no draft body found for: ${missingFromDraft.map((t) => `${t.plate} ${t.name}`).join(', ')}\n`,
    );
    return 1;
  }

  if (mode === 'emit') {
    for (const target of targets) {
      const body = bodies.get(target.plate);
      if (body === undefined) continue;
      process.stdout.write(`// ${target.plate} ${target.name} (${body.value.length} chars)\n`);
      process.stdout.write(`${emitConcat(body.value, 4, 'climateNarrativeTr')}\n`);
      for (const join of body.tightJoins) process.stdout.write(`//   tight-join: ${join}\n`);
      process.stdout.write('\n');
    }
    return 0;
  }

  // check
  const drifted: string[] = [];
  const missing: string[] = [];
  for (const target of targets) {
    const draftValue = bodies.get(target.plate)?.value ?? '';
    const seedValue = committed.get(target.plate)?.narrative ?? null;
    if (seedValue === null) {
      missing.push(`  ${target.plate} ${target.name} — absent from the seed`);
      continue;
    }
    if (seedValue !== draftValue) {
      let at = 0;
      while (at < seedValue.length && at < draftValue.length && seedValue[at] === draftValue[at]) {
        at += 1;
      }
      drifted.push(
        `  ${target.plate} ${target.name} — diverges at offset ${at}\n` +
          `      draft: ${JSON.stringify(draftValue.slice(Math.max(0, at - 30), at + 40))}\n` +
          `      seed : ${JSON.stringify(seedValue.slice(Math.max(0, at - 30), at + 40))}`,
      );
    }
  }

  process.stdout.write(
    `checked ${targets.length} province(s): ${targets.length - drifted.length - missing.length} identical, ` +
      `${drifted.length} drifted, ${missing.length} not yet seeded\n`,
  );
  if (drifted.length > 0) process.stdout.write(`\nDRIFT:\n${drifted.join('\n')}\n`);
  if (missing.length > 0) process.stdout.write(`\nNOT SEEDED:\n${missing.join('\n')}\n`);

  // THE TIGHT-JOIN SIGNAL MUST SURVIVE `check`, not only `emit`. `check` is the mandated fidelity
  // gate, and both of its sides run the SAME extractor — so a wrongly glued line join
  // ("Karadeniz-" + "Akdeniz") agrees with itself and exits 0. Computing that list and throwing it
  // away here made the gate blind to the exact PR #43 class it exists to stop. Reporting only —
  // deliberately NOT a failure mode, since the rule is right far more often than not and a hard
  // failure would train people to route around the gate.
  reportTightJoins(targets, bodies);
  return drifted.length > 0 || missing.length > 0 ? 1 : 0;
}

/** Parse `<emit|check> <draft.md> [...]` argv; returns null when the usage is wrong. */
export function parseArgs(
  argv: readonly string[],
): { mode: 'emit' | 'check'; draftPaths: readonly string[] } | null {
  const [mode, ...draftPaths] = argv;
  if ((mode !== 'emit' && mode !== 'check') || draftPaths.length === 0) return null;
  return { mode, draftPaths };
}
