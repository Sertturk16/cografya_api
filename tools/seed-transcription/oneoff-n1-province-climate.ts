/**
 * ONE-OFF — wave N1 province `climateNarrativeTr` transcription (NOT a tool generalization).
 *
 * WHY THIS EXISTS, AND WHY IT IS SEPARATE FROM `cli.ts`
 * ────────────────────────────────────────────────────
 * The main `seed:transcribe` pipeline (cli.ts + pipeline.ts + apply.ts + resolve-country.ts)
 * is COUNTRY-only by construction: it reads `src/database/seeds/countries/*.countries.ts`,
 * identifies an entity by `isoCode`+`nameTr`+`nameEn`, and keys every route/write on
 * `isoCode`. Provinces have `plateCode`+`nameTr`+`slugTr/En` and NONE of `isoCode`/`nameEn`,
 * so that pipeline cannot see them. Extending it to a second identity axis (plate code) is a
 * multi-module refactor that a single 9-province wave does not justify — Atlas ruled it
 * REJECTED as speculative generality for N1 (Path A), to be revisited on its own evidenced
 * PR only if a later wave shows this one-off is clunky. Wave N2 reused this same one-off
 * shape (→ Atlas, 2026-07-25), so the country pipeline is STILL untouched.
 *
 * What this file DELIBERATELY REUSES is the ONE piece that actually kills the PR #43 bug
 * class: the proven, property-tested, lossless emitter `emitConcat` (emit.ts) and the AST
 * folder `foldStringConcat` (seed-reader.ts). No prose is ever retyped by hand — the body is
 * extracted from NOVA's draft programmatically, emitted by the same code the country tool
 * uses, and the CONVENTIONS §2 byte-for-byte roundtrip is re-run here (`check`) and is
 * independently reproducible by the content-fidelity reviewer with the exact command in the
 * closing summary.
 *
 * Since wave N2 this file is a THIN ENTRY POINT: the pure paragraph classification lives in
 * `oneoff-province-climate-extract.ts` (unit-tested) and the IO/AST/diff shell in
 * `oneoff-province-climate-runner.ts`. Behaviour, output and exit codes are unchanged — the
 * command below still prints `checked 9 province(s): …` and still exits 0 only when all nine
 * committed bodies are byte-identical to the drafts.
 *
 * USAGE (reviewer-reproducible — pass the two authoritative draft paths):
 *   node tools/seed-transcription/oneoff-n1-province-climate.ts emit  <pilot.md> <n1.md>
 *   node tools/seed-transcription/oneoff-n1-province-climate.ts check <pilot.md> <n1.md>
 *
 * `emit`  prints the `climateNarrativeTr:` concatenation snippet for each of the 9 provinces.
 * `check` folds the committed value out of `province.seed-data.ts` and byte-diffs it against
 *         the freshly-extracted draft body — exit 0 iff all 9 are identical (0 drifted, 0
 *         missing), the same exit-code contract as `seed:transcribe check`.
 *
 * BODY-BOUNDARY RULE (Atlas-confirmed 2026-07-20): the seeded body is the NARRATIVE
 * PARAGRAPHS ONLY of each `## N. <Province>` section. Excluded: the `**Veri:**` block, the
 * `**Mekanizma → kaynak:**` block and everything after it, any other `**bold:**`-led meta
 * paragraph, tables (`|`), rules (`---`) and headings. A paragraph is kept iff its first line
 * is plain prose; a `**Mekanizma` paragraph STOPS the section; any other `**`-led paragraph
 * (e.g. `**Veri:**`) is SKIPPED.
 */
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { N1_TARGETS } from './oneoff-province-climate-extract.ts';
import { parseArgs, runWave } from './oneoff-province-climate-runner.ts';

const SEED_FILE = path.resolve(
  import.meta.dirname,
  '../../src/database/seeds/province.seed-data.ts',
);

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write('usage: oneoff-n1-province-climate.ts <emit|check> <draft.md> [...]\n');
    return 2;
  }
  return runWave({ ...args, targets: N1_TARGETS, seedFile: SEED_FILE });
}

// Run only when executed directly (`node oneoff-…ts …`), not when imported by a spec —
// importing must not trigger the CLI or clobber the test runner's exit code.
const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  process.exitCode = main();
}
