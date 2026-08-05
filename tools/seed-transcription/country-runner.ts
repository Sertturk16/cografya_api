/**
 * Shared SHELL for the COUNTRY transcription lane — the I/O half of `pnpm seed:transcribe`:
 * fs, stdout, stderr and the exit code. Every decision lives in `pipeline.ts`, which is pure.
 *
 * SPLIT OUT OF `cli.ts` FOR THE SAME REASON BOTH PROVINCE LANES ARE SPLIT, and with the same
 * boundary: this module is deliberately `import.meta`-free, so ts-jest (which transpiles to
 * CommonJS) can import it from a spec, while the entry point next door owns `import.meta.dirname`,
 * argv parsing and the usage banner. Before the split, the lane's refusals sat in an unexported
 * `main()` where nothing could pin them — and this lane's `check` is the gate `ENGINEERING.md` §8
 * mandates, whose invariants are duplicated per lane on purpose (PR #93 review, TA93-I1).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { readDraftFiles, renderDraftReadFailures } from './draft-io.ts';
import { emitConcat } from './emit.ts';
import { readSeedDirectory, syntaxErrorsIn, type SeedIndex } from './seed-reader.ts';
import { applyToSource, type Divergence } from './apply.ts';
import {
  collect,
  draftsWithoutFields,
  evaluateCheck,
  routeWrites,
  type DraftInput,
  type Item,
} from './pipeline.ts';

export type Mode = 'check' | 'emit' | 'apply';

/**
 * Read the drafts, or report EVERY path that could not be read and let the caller exit 1.
 *
 * A typo'd path used to surface as a raw `node:fs` stack trace, which reads like a tool crash
 * rather than like "you named a file that is not there" (`draft-io.ts` carries the full rationale
 * and the shared wording, so all four entry points answer a typo identically).
 */
function readDrafts(draftPaths: readonly string[]): DraftInput[] | null {
  const { files, failures } = readDraftFiles(draftPaths);
  if (failures.length > 0) {
    process.stderr.write(renderDraftReadFailures(failures));
    return null;
  }
  return files.map((file) => ({
    // The PATH, not the basename: two different waves ship a file called
    // `sovereignty-narrative-draft.md`, and a collision-prone label makes the duplicate-key
    // and drift messages ambiguous exactly when they matter most.
    label: path.relative(process.cwd(), file.path),
    markdown: file.markdown,
  }));
}

function reportTightJoins(items: readonly Item[]): void {
  const joins = items.flatMap((item) =>
    item.tightJoins.map((join) => `  ${item.isoCode}.${item.field}: ${join}`),
  );
  if (joins.length === 0) return;
  process.stdout.write(
    `\nNo-space line joins performed (draft broke a line after "'" or "-"; verify each):\n` +
      `${joins.join('\n')}\n`,
  );
}

function runCheck(items: readonly Item[], seed: SeedIndex): number {
  const { matched, drifted, missing } = evaluateCheck(items, seed);

  process.stdout.write(
    `checked ${items.length} field(s): ${matched} identical, ` +
      `${drifted.length} drifted, ${missing.length} not yet seeded\n`,
  );
  if (drifted.length > 0) process.stdout.write(`\nDRIFT:\n${drifted.join('\n')}\n`);
  if (missing.length > 0) process.stdout.write(`\nNOT SEEDED:\n${missing.join('\n')}\n`);

  // `missing` FAILS TOO. A wave where `apply` was never run has every field missing and no
  // drift, so ignoring `missing` printed "0 drifted" and exited green — verbatim the
  // failure this command exists to catch, and the exact wording `ENGINEERING.md` §8 relies on.
  return drifted.length > 0 || missing.length > 0 ? 1 : 0;
}

function runEmit(items: readonly Item[]): number {
  for (const item of items) {
    process.stdout.write(`// ${item.isoCode} — ${item.heading}\n`);
    process.stdout.write(`${emitConcat(item.value, 4, item.field)}\n`);
  }
  return 0;
}

/**
 * Show the window AROUND the first differing character, not the first 90 characters.
 * A leading slice of two long prose values is usually identical on both sides, which makes
 * the refusal message look like it is complaining about nothing — worst possible reading
 * for a message whose whole job is to make a human adjudicate the difference.
 */
function renderDivergence(d: Divergence): string {
  let at = 0;
  while (at < d.committed.length && at < d.draft.length && d.committed[at] === d.draft[at]) {
    at += 1;
  }
  const window = (value: string): string =>
    JSON.stringify(value.slice(Math.max(0, at - 30), at + 40));
  return (
    `  ${d.isoCode}.${d.field} — diverges at offset ${at}\n` +
    `      committed: ${window(d.committed)}\n` +
    `      draft    : ${window(d.draft)}`
  );
}

function runApply(
  items: readonly Item[],
  seed: SeedIndex,
  force: boolean,
  seedDir: string,
): number {
  const { byFile, errors } = routeWrites(items, seed);
  if (errors.length > 0) {
    process.stderr.write(`error:\n${errors.map((e) => `  ${e}`).join('\n')}\n`);
    return 1;
  }

  // TWO PASSES, ON PURPOSE. Every file is computed before ANY file is written, so a
  // divergence found in the last file cannot leave the first three already rewritten.
  const planned = [...byFile.entries()].sort().map(([file, writes]) => {
    const fullPath = path.join(seedDir, file);
    const before = fs.readFileSync(fullPath, 'utf8');
    return { file, fullPath, before, result: applyToSource(fullPath, before, writes, { force }) };
  });

  // VERIFY BEFORE WRITING, not after. The two-pass structure above already computes every
  // file before touching disk, which makes this the one place a syntactically broken output
  // can still be stopped for free. It is a belt over `apply.ts`'s separator handling rather
  // than a substitute for it: that logic is unit-tested, but this module writes SOURCE, and
  // "the bytes we are about to commit parse" is cheap enough to prove on every run instead of
  // trusting. A failure here is a TOOL BUG — say so, and name the file.
  const unparseable = planned.flatMap((plan) => {
    const errors = syntaxErrorsIn(plan.result.text);
    if (errors.length === 0) return [];
    // Name the ROWS, not just the file: a tool bug is reported by a human who needs to say
    // which row triggered it, and `apply` is the only place that still knows.
    const rows = [...new Set(byFile.get(plan.file)?.map((write) => write.isoCode) ?? [])].sort();
    return [
      `  ${plan.file} (rows: ${rows.join(', ') || 'unknown'})`,
      ...errors.map((e) => `    ${e}`),
    ];
  });
  if (unparseable.length > 0) {
    process.stderr.write(
      `\nREFUSING TO WRITE — the generated seed source does not parse. This is a BUG in the\n` +
        `applier, not in your draft; NOTHING has been written. Please report it with the\n` +
        `draft(s) you passed and the rows named below.\n\n${unparseable.join('\n')}\n`,
    );
    return 1;
  }

  const diverged = planned.flatMap((plan) => plan.result.diverged);
  if (diverged.length > 0) {
    process.stderr.write(
      `\nREFUSING TO WRITE — ${diverged.length} field(s) already carry a different committed ` +
        `value.\nThe seed may hold a correction the draft has not caught up with, in which ` +
        `case applying\nthe draft would silently revert it on a live page. Back-port the fix ` +
        `to the draft, or\nre-run with --force if the draft is genuinely the newer text.\n\n` +
        diverged.map(renderDivergence).join('\n') +
        '\n',
    );
    return 1;
  }

  for (const plan of planned) {
    if (plan.result.text === plan.before) {
      process.stdout.write(`${plan.file}: unchanged (${plan.result.skipped} already correct)\n`);
      continue;
    }
    fs.writeFileSync(plan.fullPath, plan.result.text, 'utf8');
    process.stdout.write(
      `${plan.file}: ${plan.result.inserted} inserted, ${plan.result.updated} updated, ` +
        `${plan.result.skipped} already correct (untouched)\n`,
    );
  }

  // The emitter is Prettier-stable by construction (same printWidth, same quote rule), so
  // no reformatting step is needed. Verify rather than assume.
  process.stdout.write(`\nVerify with: pnpm exec prettier --check src/database/seeds/countries\n`);
  return 0;
}

export interface CliRunOptions {
  readonly mode: Mode;
  readonly draftPaths: readonly string[];
  readonly force: boolean;
  /** Injected rather than read from the module constant, so a spec can point at a fixture. */
  readonly seedDir: string;
}

/**
 * Run one country-lane invocation. Returns the process exit code: 0 on success, 1 on any refusal
 * or, in `check`, on divergence. Argv shape (and its exit code 2) belongs to `main` below.
 *
 * SPLIT OUT OF `main` SO THE REFUSALS CAN BE PINNED, mirroring `runWave` / `runProse`. The
 * refusals below are duplicated per lane on purpose (ENGINEERING §8), which means each copy needs
 * its own evidence: while this logic sat in an unexported `main`, nothing could assert that the
 * empty-draft guard runs BEFORE the mode dispatch, or that an unreadable path exits 1 — the two
 * greens this PR exists to close could have been reopened by an edit with the suite green
 * (PR #93 review, TA93-I1).
 */
export function runCli({ mode, draftPaths, force, seedDir }: CliRunOptions): number {
  const seed = readSeedDirectory(seedDir);

  // A COMMITTED SEED FILE THAT DOES NOT PARSE POISONS EVERY MODE, SILENTLY. `ts.createSourceFile`
  // is error-tolerant: handed a file with a missing comma it still returns a tree, just one
  // missing properties or whole rows. `check` would then compare against an index that never
  // saw those fields and print "0 drifted" — a false green on the command `ENGINEERING.md` §8
  // mandates as the content-fidelity gate — while `apply` would route writes off the same
  // incomplete picture. Syntax is not this gate's remit, but a gate a broken file can defeat is
  // not a gate, so refuse before any mode runs.
  if (seed.syntaxErrors.length > 0) {
    process.stderr.write(
      `seed source does not parse — refusing to run, because every mode would be reading an\n` +
        `incomplete index (and "check" would report a green it did not earn):\n` +
        `${seed.syntaxErrors.map((e) => `  ${e}`).join('\n')}\n`,
    );
    return 1;
  }

  const drafts = readDrafts(draftPaths);
  if (drafts === null) return 1;

  const { items, errors, warnings, understood } = collect(drafts, seed);

  if (warnings.length > 0) {
    process.stderr.write(`warning(s):\n${warnings.map((w) => `  ${w}`).join('\n')}\n`);
  }

  if (errors.length > 0) {
    process.stderr.write(
      `unresolved draft section(s):\n${errors.map((e) => `  ${e}`).join('\n')}\n`,
    );
    // Never proceed on a partially-understood draft: a skipped country is a silently
    // empty field, which is the failure this tool exists to prevent.
    return 1;
  }

  // A DRAFT THIS TOOL UNDERSTOOD NOTHING IN IS AN ERROR IN EVERY MODE, not a quiet no-op.
  // Without this, `check` prints "checked 0 field(s)" and exits 0, `emit` prints nothing and
  // exits 0, and `apply` writes nothing and exits 0 — three greens earned by understanding none
  // of the file. The guard is mode-independent for the same reason the two refusals above are: a
  // per-mode carve-out is a special case someone later has to explain. It is measured on what the
  // parser UNDERSTOOD, never on the surviving items — see `draftsWithoutFields` (Atlas ruling
  // AS-7; corrected after the PR #93 review's duplicate-draft false red).
  const unusedDrafts = draftsWithoutFields(drafts, understood);
  if (unusedDrafts.length > 0) {
    process.stderr.write(
      `error: no transcribable field found in:\n${unusedDrafts.map((d) => `  ${d}`).join('\n')}\n` +
        `Wrong file: it carries no "## <n>. <Ülke>" section with a "### \`field\`" header this\n` +
        `tool recognises, so nothing would have been transcribed from it.\n`,
    );
    return 1;
  }

  let code: number;
  if (mode === 'check') code = runCheck(items, seed);
  else if (mode === 'emit') code = runEmit(items);
  else code = runApply(items, seed, force, seedDir);

  if (mode !== 'emit') reportTightJoins(items);
  return code;
}
