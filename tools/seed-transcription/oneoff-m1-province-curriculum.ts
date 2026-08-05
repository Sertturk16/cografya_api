/**
 * ONE-OFF — M1: the MÜFREDAT climate-name mapping fidelity gate (NOT a tool generalization).
 *
 * Scope: the 81 `climateCurriculumNameTr` values in `province.seed-data.ts`, checked against
 * NOVA's `Owner's Inbox/koppen-mufredat-eslemesi/brief.md` §3 tables plus the owner rulings for
 * the ten BELİRSİZ rows. The reasoning for why this lane exists — and why no prose lane can do
 * its job — lives in `oneoff-province-curriculum-runner.ts`; the short form is that the seed
 * stores constant REFERENCES, which no AST-folding byte-compare can see, while ENGINEERING §5
 * still requires a write-path fidelity rule on a line that publishes per-province values.
 *
 * USAGE (reviewer-reproducible):
 *   node tools/seed-transcription/oneoff-m1-province-curriculum.ts check "../Owner's Inbox/koppen-mufredat-eslemesi/brief.md"
 *   node tools/seed-transcription/oneoff-m1-province-curriculum.ts emit  "../Owner's Inbox/koppen-mufredat-eslemesi/brief.md"
 *
 * `check` is the gate — judge it by the EXIT CODE, not by reading the printed count.
 * `emit` regenerates the 81 seed property lines from the brief, so a reviewer can diff the
 * generated lines against the committed ones rather than eyeballing 81 values.
 *
 * WHY A COMMITTED ENTRY POINT rather than a throwaway script: `ENGINEERING.md` §8 defines the
 * fidelity gate as a command the REVIEWING code-reviewer re-runs BY HAND, and a deleted script
 * cannot be re-run. Same ruling that gave every prose wave its own entry point (AS-3, option C).
 *
 * This entry point is wired into NO CI job — the brief lives outside the repo, under
 * `Owner's Inbox/` — so it is covered by `typecheck` only. The logic it drives IS covered:
 * `oneoff-province-curriculum-runner.ts` carries a unit spec.
 *
 * `isDirectInvocation` comes from the CLIMATE runner deliberately, exactly as the P-waves take
 * it: it is lane-agnostic and already spec-pinned there, and it must never be re-implemented as
 * a raw `import.meta.url === pathToFileURL(argv[1])` compare — that silently no-ops the whole
 * gate on any symlinked path (PR #94 review, SFH94-I1).
 */
import * as path from 'node:path';

import { isDirectInvocation } from './oneoff-province-climate-runner.ts';
import { parseCurriculumArgs, runCurriculum } from './oneoff-province-curriculum-runner.ts';

const SEED_FILE = path.resolve(
  import.meta.dirname,
  '../../src/database/seeds/province.seed-data.ts',
);

function main(): number {
  const args = parseCurriculumArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write('usage: oneoff-m1-province-curriculum.ts <emit|check> <brief.md> [...]\n');
    return 2;
  }
  return runCurriculum({ ...args, seedFile: SEED_FILE });
}

// Run only when executed directly (`node oneoff-…ts …`), not when imported by a spec.
if (isDirectInvocation(import.meta.filename, process.argv[1])) {
  process.exitCode = main();
}
