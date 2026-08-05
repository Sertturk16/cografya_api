/**
 * ONE-OFF — wave P2 province PROSE transcription (NOT a tool generalization).
 *
 * Scope: the single `hydrographyNoteTr` rewrite AS-6b/AS-9 ruled for Sivas — the bare 1.355 km
 * figure gains its MEB attribution (FENER92-I1) and the field's live `CONTENT-STYLE.md` §16
 * violation (one sentence carrying four independent facts) closes. Governing text:
 * `Owner's Inbox/terim-gecisi-sivas/brief.md` §2.3 Varyant A, landing order §R.6 row 8.
 *
 * It gets a committed entry point rather than a throwaway script for the same reason P1 did:
 * `ENGINEERING.md` §8 defines the content-fidelity gate as a command the REVIEWING code-reviewer
 * re-runs BY HAND — a deleted script cannot be re-run, so the gate would not exist
 * (Atlas ruling AS-3, 2026-08-05). A new wave is a new target list plus a new entry point,
 * deliberately NOT a generalisation of the shared shell.
 *
 * USAGE (reviewer-reproducible — pass the ONE authoritative P2 draft):
 *   node tools/seed-transcription/oneoff-p2-province-prose.ts emit  "../Owner's Inbox/terim-gecisi-sivas/seed-draft-provinces.md"
 *   node tools/seed-transcription/oneoff-p2-province-prose.ts check "../Owner's Inbox/terim-gecisi-sivas/seed-draft-provinces.md"
 *
 * `emit`  prints the `hydrographyNoteTr:` concatenation snippet, produced by the property-tested
 *         lossless emitter — that snippet is what goes into the seed, never hand-typed prose.
 * `check` folds the committed value back out of `province.seed-data.ts` and byte-diffs it against
 *         the freshly-extracted draft body — exit 0 iff every target is identical (0 drifted,
 *         0 not yet seeded), the same exit-code contract as `seed:transcribe check`.
 *
 * WHICH LANE OWNS WHICH FILE (the §8 false-green rule): this lane owns `province.seed-data.ts`.
 * `pnpm seed:transcribe` owns `src/database/seeds/countries/` and CANNOT see this file, so the
 * country half of this PR and this province half each need their OWN gate run — one command
 * covering both would report a green it did not earn.
 *
 * The draft lives OUTSIDE the repo (`Owner's Inbox/`), so the path is a CLI argument and this
 * ENTRY POINT is wired into NO CI job (it is covered by `typecheck` only). The logic it drives IS
 * covered: `oneoff-province-prose-runner.ts` carries a unit spec in the `Test (unit)` job.
 *
 * ONE CROSS-LANE COUPLING, DELIBERATE AND WORTH NAMING (the file reads as if it were pure prose
 * otherwise): `parseArgs` and `isDirectInvocation` are imported from the CLIMATE runner, not the
 * prose one. Both are lane-agnostic — an argv shape and a "was I run directly?" check — and the
 * climate runner is simply where they already lived and are already unit-tested. Duplicating
 * either into the prose runner would fork an exit-code contract (`parseArgs` decides the exit-2
 * usage path) and a false-green guard (`isDirectInvocation`, PR #94 SFH94-I1) across lanes,
 * which is the failure mode this toolchain keeps re-learning. Only the FIELD-FOLDING half is
 * lane-specific, and that is what `oneoff-province-prose-runner.ts` owns.
 */
import * as path from 'node:path';

import { isDirectInvocation, parseArgs } from './oneoff-province-climate-runner.ts';
import { P2_TARGETS } from './oneoff-province-prose-targets.ts';
import { runProse } from './oneoff-province-prose-runner.ts';

const SEED_FILE = path.resolve(
  import.meta.dirname,
  '../../src/database/seeds/province.seed-data.ts',
);

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write('usage: oneoff-p2-province-prose.ts <emit|check> <draft.md> [...]\n');
    return 2;
  }
  return runProse({ ...args, targets: P2_TARGETS, seedFile: SEED_FILE });
}

// Run only when executed directly (`node oneoff-…ts …`), not when imported by a spec —
// importing must not trigger the CLI or clobber the test runner's exit code. The comparison is
// symlink-safe on BOTH sides (see `isDirectInvocation`): comparing the raw paths made this guard
// no-op through any symlinked segment, which turned the mandated §8 gate into a silent exit 0.
if (isDirectInvocation(import.meta.filename, process.argv[1])) {
  process.exitCode = main();
}
