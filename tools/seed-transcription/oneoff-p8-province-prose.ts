/**
 * ONE-OFF — wave P8 province PROSE transcription (NOT a tool generalization).
 *
 * Scope: CONTENT-W4 PR-1, seventeen province narrative fields. The source draft folds each
 * committed field and changes only the exact tense ruled in the approved W4 implementation SPEC:
 * ten pairs transfer from P3/P4/P6 and seven pairs receive first ownership.
 *
 * USAGE (reviewer-reproducible — pass the ONE authoritative P8 draft):
 *   node tools/seed-transcription/oneoff-p8-province-prose.ts emit  "../Owner's Inbox/prose-cleanup/seed-draft-provinces-p8.md"
 *   node tools/seed-transcription/oneoff-p8-province-prose.ts check "../Owner's Inbox/prose-cleanup/seed-draft-provinces-p8.md"
 *
 * `emit` produces the concatenation snippets placed into `province.seed-data.ts`; prose is never
 * retyped. `check` folds the committed values and byte-compares all seventeen fields against the
 * source draft, exiting 0 only for zero drift and zero not-yet-seeded fields.
 *
 * The shared runner/parser/emitter remain unchanged. `parseArgs` and `isDirectInvocation` come
 * from the climate runner, as in every province prose entry point; the latter realpaths both sides
 * so a symlinked invocation cannot silently no-op the gate.
 */
import * as path from 'node:path';

import { isDirectInvocation, parseArgs } from './oneoff-province-climate-runner.ts';
import { P8_TARGETS } from './oneoff-province-prose-targets.ts';
import { runProse } from './oneoff-province-prose-runner.ts';

const SEED_FILE = path.resolve(
  import.meta.dirname,
  '../../src/database/seeds/province.seed-data.ts',
);

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write('usage: oneoff-p8-province-prose.ts <emit|check> <draft.md> [...]\n');
    return 2;
  }
  return runProse({ ...args, targets: P8_TARGETS, seedFile: SEED_FILE });
}

if (isDirectInvocation(import.meta.filename, process.argv[1])) {
  process.exitCode = main();
}
