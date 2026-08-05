/**
 * ONE-OFF — wave P1 province PROSE transcription (NOT a tool generalization).
 *
 * Scope: the single `hydrographyNoteTr` correction AN-3/AN-4 ruled for Çorum (the Kızılırmak
 * length figure and the çeltik claim). It gets a committed entry point rather than a throwaway
 * script because `ENGINEERING.md` §8 defines the content-fidelity gate as a command the REVIEWING
 * code-reviewer re-runs BY HAND — a deleted script cannot be re-run, so the gate would not exist
 * (Atlas ruling AS-3, 2026-08-05).
 *
 * USAGE (reviewer-reproducible — pass the ONE authoritative P1 draft):
 *   node tools/seed-transcription/oneoff-p1-province-prose.ts emit  "../Owner's Inbox/komsu-kenar-rakim-seed/seed-draft-provinces.md"
 *   node tools/seed-transcription/oneoff-p1-province-prose.ts check "../Owner's Inbox/komsu-kenar-rakim-seed/seed-draft-provinces.md"
 *
 * `emit`  prints the `hydrographyNoteTr:` concatenation snippet, produced by the property-tested
 *         lossless emitter — that snippet is what goes into the seed, never hand-typed prose.
 * `check` folds the committed value back out of `province.seed-data.ts` and byte-diffs it against
 *         the freshly-extracted draft body — exit 0 iff every target is identical (0 drifted,
 *         0 not yet seeded), the same exit-code contract as `seed:transcribe check`.
 *
 * WHICH LANE OWNS WHICH FILE (the §8 false-green rule): this lane owns `province.seed-data.ts`.
 * `pnpm seed:transcribe` owns `src/database/seeds/countries/` and CANNOT see this file, so running
 * it against this PR's province change would report a green it did not earn.
 *
 * The draft lives OUTSIDE the repo (`Owner's Inbox/`), so the path is a CLI argument and this
 * ENTRY POINT is wired into NO CI job (it is covered by `typecheck` only). The logic it drives IS
 * covered: `oneoff-province-prose-runner.ts` carries a unit spec in the `Test (unit)` job.
 */
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseArgs } from './oneoff-province-climate-runner.ts';
import { type ProseTarget, runProse } from './oneoff-province-prose-runner.ts';

const SEED_FILE = path.resolve(
  import.meta.dirname,
  '../../src/database/seeds/province.seed-data.ts',
);

/**
 * `name` is the province as the DRAFT heads its section; it is cross-checked against the seed
 * row's own `nameTr` for `plate` before anything is emitted or compared, so a wrong plate cannot
 * quietly publish this prose on another province's page.
 */
export const P1_TARGETS: readonly ProseTarget[] = [
  { name: 'Çorum', plate: '19', field: 'hydrographyNoteTr' },
];

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write('usage: oneoff-p1-province-prose.ts <emit|check> <draft.md> [...]\n');
    return 2;
  }
  return runProse({ ...args, targets: P1_TARGETS, seedFile: SEED_FILE });
}

// Run only when executed directly (`node oneoff-…ts …`), not when imported by a spec —
// importing must not trigger the CLI or clobber the test runner's exit code.
const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  process.exitCode = main();
}
