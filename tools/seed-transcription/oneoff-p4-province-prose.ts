/**
 * ONE-OFF — wave P4 province PROSE transcription (NOT a tool generalization).
 *
 * Scope: `Owner's Inbox/icerik-duzeltme-mikro/p4-ek-brief.md` Part 1 §2 + Part 3 §4.3, as
 * scoped by Atlas rulings AT-11a-d. Thirteen `settlementNoteTr` fields, all FULL-field blocks:
 *
 *   - the TWELVE B17 survivors P3's scan could not see (İzmir · Kocaeli · Sakarya · Aydın ·
 *     Denizli · Manisa · Adana · Kahramanmaraş · Eskişehir · Ordu · Trabzon · Samsun);
 *   - the last three internal wave-name leaks, which are the SAME EDIT as the B17 repair in
 *     Adana and Kahramanmaraş and a standalone one in Mersin (Part 3 / AT-11b).
 *
 * WHY A SECOND B17 ROUND EXISTS — the lesson this wave records. P3 scanned with one literal
 * string, which made that string's loudest marker (`sonucu,` + present-tense `gelmiyor`) stand in
 * for the defect itself. Twelve provinces carry the same comma-splice with a COMPLETE predicate
 * and the CORRECT tense, so the anchor slid straight past them; Samsun carries it with the
 * caveat's second half missing altogether, so it holds no anchor text at all and no string search
 * could ever have reached it. NOVA re-scanned structurally — independent clause + comma +
 * independent clause, over all 280 prose fields — and cross-checked that against the narrow
 * anchor; the two passes agree on exactly this set, which is why a third variant is not expected
 * to be hiding. Seven further hits were read by hand and declared CORRECT prose (`çünkü` clauses
 * in Antalya/Balıkesir/Bursa/Tekirdağ; explicit-subject clauses in Şırnak/Sakarya-landform/Bolu)
 * and are deliberately untouched.
 *
 * The defect is not "a comma between clauses" — Turkish allows that. It is a dropped subject
 * arriving together with a CHANGED subject, so "…kaldırılmasının bir sonucudur, ilin fiilen
 * tamamen kentleştiği anlamına gelmez" reads as if the ABOLITION were what does not mean full
 * urbanisation. The repair gives the second clause its subject back (`Bu oran,`).
 *
 * MERSİN/33 IS OWNED HERE, NOT BY P3. P3 repaired its B17 tail; this wave drops its
 * "dalganın en yüksek ikinci pozitif değeri" wave-name leak, so the pair MOVED lists (and moved
 * out of P3's draft). See the ownership note in `oneoff-province-prose-targets.ts`: one owner per
 * `(plate, field)` is what lets P1…P4 all be green at the same time.
 *
 * It gets a committed entry point rather than a throwaway script for the same reason P1-P3 did:
 * `ENGINEERING.md` §8 defines the content-fidelity gate as a command the REVIEWING code-reviewer
 * re-runs BY HAND — a deleted script cannot be re-run, so the gate would not exist (Atlas ruling
 * AS-3, option C). A new wave is a new target list plus a new entry point, deliberately NOT a
 * generalisation of the shared shell, which is untouched here.
 *
 * USAGE (reviewer-reproducible — pass the ONE authoritative P4 draft):
 *   node tools/seed-transcription/oneoff-p4-province-prose.ts emit  "../Owner's Inbox/icerik-duzeltme-mikro/seed-draft-provinces-p4.md"
 *   node tools/seed-transcription/oneoff-p4-province-prose.ts check "../Owner's Inbox/icerik-duzeltme-mikro/seed-draft-provinces-p4.md"
 *
 * NOTE THE FILENAME: this wave's draft is `seed-draft-provinces-p4.md`. P3's
 * `seed-draft-provinces.md` lives in the SAME task folder and is a different wave — passing the
 * wrong one produces "a draft section this wave's target list does not claim", loudly, by design.
 *
 * WHICH LANE OWNS WHICH FILE (the §8 false-green rule): this lane owns `province.seed-data.ts`.
 * `pnpm seed:transcribe` owns `src/database/seeds/countries/` and cannot see this file. This PR
 * also re-attributes Georgia's population comment, which at the time sat in
 * `country.seed-data.ts` and now travels with the GE row in
 * `../../src/database/seeds/countries/asia.countries.ts` (moved by FU-PILOT-RETIRE) —
 * a COMMENT, no value and no prose changed there, so no country-lane transcription is
 * involved.
 *
 * The draft lives OUTSIDE the repo (`Owner's Inbox/`), so the path is a CLI argument and this
 * ENTRY POINT is wired into NO CI job (it is covered by `typecheck` only). The logic it drives IS
 * covered: `oneoff-province-prose-runner.ts` and the wave tables carry unit specs.
 *
 * `parseArgs` and `isDirectInvocation` come from the CLIMATE runner deliberately, exactly as
 * P1-P3 take them: both are lane-agnostic and already spec-pinned there, and `isDirectInvocation`
 * must never be re-implemented as a raw `import.meta.url === pathToFileURL(argv[1])` compare —
 * that silently no-ops the whole gate on any symlinked path (PR #94 review, SFH94-I1).
 */
import * as path from 'node:path';

import { isDirectInvocation, parseArgs } from './oneoff-province-climate-runner.ts';
import { P4_TARGETS } from './oneoff-province-prose-targets.ts';
import { runProse } from './oneoff-province-prose-runner.ts';

const SEED_FILE = path.resolve(
  import.meta.dirname,
  '../../src/database/seeds/province.seed-data.ts',
);

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write('usage: oneoff-p4-province-prose.ts <emit|check> <draft.md> [...]\n');
    return 2;
  }
  return runProse({ ...args, targets: P4_TARGETS, seedFile: SEED_FILE });
}

// Run only when executed directly (`node oneoff-…ts …`), not when imported by a spec —
// importing must not trigger the CLI or clobber the test runner's exit code. The comparison is
// symlink-safe on BOTH sides (see `isDirectInvocation`): comparing the raw paths made this guard
// no-op through any symlinked segment, which turned the mandated §8 gate into a silent exit 0.
if (isDirectInvocation(import.meta.filename, process.argv[1])) {
  process.exitCode = main();
}
