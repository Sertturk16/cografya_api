/**
 * ONE-OFF — wave N2 province `climateNarrativeTr` transcription (NOT a tool generalization).
 *
 * Same mechanism as wave N1 (`oneoff-n1-province-climate.ts`, PR #69), by Atlas ruling for this
 * wave (2026-07-25): the country `seed:transcribe` pipeline stays untouched — it is country-only
 * by construction (`isoCode` identity) and provinces are keyed on `plateCode`. What is reused is
 * the part that actually kills the PR #43 dropped-space bug class: the property-tested lossless
 * emitter `emitConcat` and the AST folder `foldStringConcat`. NO PROSE IS EVER RETYPED BY HAND —
 * each body is extracted from NOVA's fact-checked draft programmatically and re-verified
 * byte-for-byte against the committed seed by `check`.
 *
 * USAGE (reviewer-reproducible — pass the ONE authoritative N2 draft):
 *   node tools/seed-transcription/oneoff-n2-province-climate.ts emit  "Owner's Inbox/iklim-N2/draft.md"
 *   node tools/seed-transcription/oneoff-n2-province-climate.ts check "Owner's Inbox/iklim-N2/draft.md"
 *
 * `emit`  prints the `climateNarrativeTr:` concatenation snippet for each of the 10 provinces.
 * `check` folds the committed value out of `province.seed-data.ts` and byte-diffs it against the
 *         freshly-extracted draft body — exit 0 iff all 10 are identical (0 drifted, 0 missing),
 *         the same exit-code contract as `seed:transcribe check`.
 *
 * The draft lives OUTSIDE the repo (`Owner's Inbox/`), so the path is a CLI argument and this
 * one-off is wired into NO CI job (it is covered by `typecheck` only). The content-fidelity
 * reviewer replays the command above by hand — deliberate, unchanged from N1.
 *
 * BODY-BOUNDARY RULE (Atlas-confirmed 2026-07-20, unchanged for N2): the seeded body is the
 * NARRATIVE PARAGRAPHS ONLY of each `## N. <Province>` section. Excluded: the `**Veri:**` block,
 * the `**Mekanizma → kaynak:**` block AND EVERYTHING AFTER IT, any other `**bold:**`-led meta
 * paragraph, tables (`|`), rules (`---`) and headings.
 */
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { N2_TARGETS } from './oneoff-province-climate-extract.ts';
import { parseArgs, runWave } from './oneoff-province-climate-runner.ts';

const SEED_FILE = path.resolve(
  import.meta.dirname,
  '../../src/database/seeds/province.seed-data.ts',
);

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write('usage: oneoff-n2-province-climate.ts <emit|check> <draft.md> [...]\n');
    return 2;
  }
  return runWave({ ...args, targets: N2_TARGETS, seedFile: SEED_FILE });
}

// Run only when executed directly (`node oneoff-…ts …`), not when imported by a spec —
// importing must not trigger the CLI or clobber the test runner's exit code.
const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  process.exitCode = main();
}
