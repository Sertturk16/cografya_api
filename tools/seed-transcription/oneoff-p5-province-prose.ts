/**
 * ONE-OFF — wave P5 province PROSE transcription (NOT a tool generalization).
 *
 * Scope: the FIFTEEN `climateCurriculumNoteTr` notes that ship alongside the müfredat climate
 * name (`climateCurriculumNameTr`), per DEC 2026-08-05c, DEC 2026-08-05f #3/#4, DEC 2026-08-06a
 * and DEC 2026-08-06b, as scoped by Atlas rulings AK-1, AK-4 and AK-7. Eleven notes explain a
 * boundary reading the textbook map cannot resolve at its scale; eight explain a name whose
 * geographic label is not the province's own region; four provinces (Kütahya, Gümüşhane,
 * Bayburt, Denizli) need both and get ONE flowing paragraph, which is why the entity carries a
 * single note column.
 *
 * WHY THE NAME FIELD IS NOT IN THIS WAVE, and what covers it instead. `climateCurriculumNameTr`
 * is not prose: its 81 values are references to eight shared constants, and a constant reference
 * is NOT a foldable string-literal chain — this lane's AST folder reports it as `unfoldable` and
 * could never byte-compare it. Pointing any lane at it would produce a green it did not earn. The
 * mapping has its OWN write-path fidelity check instead (ENGINEERING §5), which re-parses the
 * brief's §3 tables and cross-checks name + curriculum name + Köppen code 81/81:
 *
 *   node tools/seed-transcription/oneoff-m1-province-curriculum.ts check "../Owner's Inbox/koppen-mufredat-eslemesi/brief.md"
 *
 * Both commands must be run; neither substitutes for the other.
 *
 * NO OWNERSHIP TRANSFER IN THIS WAVE. `climateCurriculumNoteTr` is a brand-new column, so all
 * fifteen `(plate, field)` pairs are new and P1-P4 are untouched — the non-overlap invariant
 * holds without moving an entry out of an earlier list (contrast PR #96's Mersin move; see the
 * ownership note in `oneoff-province-prose-targets.ts`).
 *
 * THE DRAFT IS A DERIVED FILE, and that is deliberate. NOVA's authored deliverable is
 * `koppen-sablon-gecisi/cumle-taslaklari.md`, whose §2 blocks head each note with a `###`
 * heading carrying the rendered title string — a shape this lane's parser reads as "any other
 * heading", i.e. it would find zero fields. Rather than edit another author's deliverable, the
 * fifteen blockquote paragraphs were copied byte-for-byte into the lane's own format as
 * `seed-draft-provinces-p5.md`, beside it in the same task folder. Nothing was retyped and
 * nothing was reworded; the two files' §2 blockquote bodies are byte-identical. The PR #97
 * review round re-derived that file mechanically from the same §2 blocks after NOVA revised
 * five of them — the derivation is a script's output, never a hand edit.
 *
 * It gets a committed entry point rather than a throwaway script for the same reason P1-P4 did:
 * `ENGINEERING.md` §8 defines the content-fidelity gate as a command the REVIEWING code-reviewer
 * re-runs BY HAND — a deleted script cannot be re-run, so the gate would not exist (Atlas ruling
 * AS-3, option C). A new wave is a new target list plus a new entry point, deliberately NOT a
 * generalisation of the shared shell, which is untouched here.
 *
 * USAGE (reviewer-reproducible — pass the ONE authoritative P5 draft):
 *   node tools/seed-transcription/oneoff-p5-province-prose.ts emit  "../Owner's Inbox/koppen-sablon-gecisi/seed-draft-provinces-p5.md"
 *   node tools/seed-transcription/oneoff-p5-province-prose.ts check "../Owner's Inbox/koppen-sablon-gecisi/seed-draft-provinces-p5.md"
 *
 * NOTE THE FILENAME: pass `seed-draft-provinces-p5.md`, not `cumle-taslaklari.md`. The latter is
 * the authored source and parses to zero fields, which this lane reports as "no draft body found"
 * — loudly, by design.
 *
 * WHICH LANE OWNS WHICH FILE (the §8 false-green rule): this lane owns `province.seed-data.ts`.
 * `pnpm seed:transcribe` owns `src/database/seeds/countries/` and cannot see this file. This PR
 * also appends the shared A-2 sentence to the eight `MGM_KOPPEN_CAVEAT_*_TR` constants — shared
 * CONSTANTS, not per-row prose, so they are outside every lane's reach by construction and are
 * guarded by structural assertions in `test/province.e2e-spec.ts` instead.
 *
 * The draft lives OUTSIDE the repo (`Owner's Inbox/`), so the path is a CLI argument and this
 * ENTRY POINT is wired into NO CI job (it is covered by `typecheck` only). The logic it drives IS
 * covered: `oneoff-province-prose-runner.ts` and the wave tables carry unit specs.
 *
 * `parseArgs` and `isDirectInvocation` come from the CLIMATE runner deliberately, exactly as
 * P1-P4 take them: both are lane-agnostic and already spec-pinned there, and `isDirectInvocation`
 * must never be re-implemented as a raw `import.meta.url === pathToFileURL(argv[1])` compare —
 * that silently no-ops the whole gate on any symlinked path (PR #94 review, SFH94-I1).
 */
import * as path from 'node:path';

import { isDirectInvocation, parseArgs } from './oneoff-province-climate-runner.ts';
import { P5_TARGETS } from './oneoff-province-prose-targets.ts';
import { runProse } from './oneoff-province-prose-runner.ts';

const SEED_FILE = path.resolve(
  import.meta.dirname,
  '../../src/database/seeds/province.seed-data.ts',
);

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write('usage: oneoff-p5-province-prose.ts <emit|check> <draft.md> [...]\n');
    return 2;
  }
  return runProse({ ...args, targets: P5_TARGETS, seedFile: SEED_FILE });
}

// Run only when executed directly (`node oneoff-…ts …`), not when imported by a spec —
// importing must not trigger the CLI or clobber the test runner's exit code. The comparison is
// symlink-safe on BOTH sides (see `isDirectInvocation`): comparing the raw paths made this guard
// no-op through any symlinked segment, which turned the mandated §8 gate into a silent exit 0.
if (isDirectInvocation(import.meta.filename, process.argv[1])) {
  process.exitCode = main();
}
