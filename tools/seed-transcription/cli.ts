/**
 * seed-transcription — deterministic transcription of fact-checked narrative drafts into
 * the country seed files.
 *
 *   node tools/seed-transcription/cli.ts check <draft.md> [...]
 *   node tools/seed-transcription/cli.ts emit  <draft.md> [...]
 *   node tools/seed-transcription/cli.ts apply [--force] <draft.md> [...]
 *
 * `check` is the automated form of the CONVENTIONS §2 byte-for-byte roundtrip gate: it
 * re-parses the draft and diffs it against what is committed. `apply` is the prevention:
 * it writes the seed so no human transcribes prose by hand.
 *
 * This file is the ENTRY POINT only — argv, the usage banner, the seed directory and the exit
 * code. The shell it drives is `country-runner.ts` (fs, stdout, the refusals) and every decision
 * lives in `pipeline.ts`, which is pure. The split is the same one both province lanes use, and
 * for the same reason: `import.meta` lives here so the runner stays importable from a spec.
 *
 * Run with Node's native type stripping (Node >= 24) — no build step, so the tool is
 * usable mid-review without a compile.
 */
import * as path from 'node:path';

import { runCli, type Mode } from './country-runner.ts';

const SEED_DIR = path.resolve(import.meta.dirname, '../../src/database/seeds/countries');

function main(): number {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const [modeArg, ...draftPaths] = argv.filter((arg) => arg !== '--force');
  const modes: readonly Mode[] = ['check', 'emit', 'apply'];
  if (modeArg === undefined || !modes.includes(modeArg as Mode) || draftPaths.length === 0) {
    process.stderr.write(`usage: cli.ts <${modes.join('|')}> [--force] <draft.md> [...]\n`);
    return 2;
  }

  const mode = modeArg as Mode;
  if (force && mode !== 'apply') {
    process.stderr.write(`--force is only meaningful for "apply"\n`);
    return 2;
  }

  return runCli({ mode, draftPaths, force, seedDir: SEED_DIR });
}

process.exitCode = main();
