/**
 * ONE-OFF — wave P3 province PROSE transcription (NOT a tool generalization).
 *
 * Scope: the content-fix micro pass NOVA specified in
 * `Owner's Inbox/icerik-duzeltme-mikro/brief.md` PART A, as scoped by Atlas rulings AT-5..AT-9.
 * Twenty fields across seventeen provinces, in three deterministic classes:
 *
 *   - B4 internal-jargon leaks ("dört pilot il", "bu dalgada incelenen yedi il") removed from
 *     Van/Antalya/Muğla `settlementNoteTr` and Uşak `introTr` — the last of which is the first
 *     sentence a reader of that page sees;
 *   - B16/B17 defects on Van `landformNoteTr` (Nemrut reclassified "uykuda" in line with the
 *     Bitlis page, `Erçiş` -> `Erciş`, the wrong district attribution for the 2011 epicentre,
 *     "üçüncü EN yüksek") and the broken `settlementNoteTr` template that turned out to sit in
 *     TWELVE provinces, not just the one the UX tour walked (Van carries NOVA's fuller block;
 *     the other eleven take the single deterministic A.6 swap);
 *   - B15 Rize (AT-7 option A: the unsourceable ">2.250 mm" figure leaves the prose, the
 *     qualitative "Türkiye'nin en yağışlı ili" claim stays, verified against our own 81-province
 *     ERA5 series) and B18 İstanbul (the Haliç/ria definition stops being told twice and the
 *     Bosphorus apposition stops being told three times).
 *
 * It gets a committed entry point rather than a throwaway script for the same reason P1 and P2
 * did: `ENGINEERING.md` §8 defines the content-fidelity gate as a command the REVIEWING
 * code-reviewer re-runs BY HAND — a deleted script cannot be re-run, so the gate would not exist
 * (Atlas ruling AS-3, option C, 2026-08-05). A new wave is a new target list plus a new entry
 * point, deliberately NOT a generalisation of the shared shell, which stays untouched here.
 *
 * CROSS-WAVE OVERLAP WAS CHECKED BY HAND (TA94-M1 has no CI net yet): P1 owns Çorum/19
 * `hydrographyNoteTr` and P2 owns Sivas/58 `hydrographyNoteTr`. Neither province+field pair
 * appears below, so no earlier wave's `check` can be knocked red by this one.
 *
 * USAGE (reviewer-reproducible — pass the ONE authoritative P3 draft):
 *   node tools/seed-transcription/oneoff-p3-province-prose.ts emit  "../Owner's Inbox/icerik-duzeltme-mikro/seed-draft-provinces.md"
 *   node tools/seed-transcription/oneoff-p3-province-prose.ts check "../Owner's Inbox/icerik-duzeltme-mikro/seed-draft-provinces.md"
 *
 * `emit`  prints each field's concatenation snippet, produced by the property-tested lossless
 *         emitter — that snippet is what goes into the seed, never hand-typed prose.
 * `check` folds the committed values back out of `province.seed-data.ts` and byte-diffs them
 *         against the freshly-extracted draft bodies — exit 0 iff every target is identical
 *         (0 drifted, 0 not yet seeded), the same exit-code contract as `seed:transcribe check`.
 *
 * WHICH LANE OWNS WHICH FILE (the §8 false-green rule): this lane owns `province.seed-data.ts`.
 * `pnpm seed:transcribe` owns `src/database/seeds/countries/` and CANNOT see this file. This PR
 * touches BOTH — the province prose here and five country population values plus one areaKm2 in
 * `africa.countries.ts` — so each half needs its OWN gate run. One command covering both would
 * report a green it did not earn (the PR #70 review finding).
 *
 * The draft lives OUTSIDE the repo (`Owner's Inbox/`), so the path is a CLI argument and this
 * ENTRY POINT is wired into NO CI job (it is covered by `typecheck` only). The logic it drives IS
 * covered: `oneoff-province-prose-runner.ts` carries a unit spec in the `Test (unit)` job.
 *
 * `parseArgs` and `isDirectInvocation` come from the CLIMATE runner deliberately, exactly as P1
 * and P2 take them: both are lane-agnostic and already spec-pinned there, and `isDirectInvocation`
 * in particular must never be re-implemented as a raw `import.meta.url === pathToFileURL(argv[1])`
 * compare — that silently no-ops the whole gate (exit 0, no output) on any symlinked path
 * (PR #94 review, SFH94-I1).
 */
import * as path from 'node:path';

import { isDirectInvocation, parseArgs } from './oneoff-province-climate-runner.ts';
import { type ProseTarget, runProse } from './oneoff-province-prose-runner.ts';

const SEED_FILE = path.resolve(
  import.meta.dirname,
  '../../src/database/seeds/province.seed-data.ts',
);

/**
 * `name` is the province as the DRAFT heads its section; it is cross-checked against the seed
 * row's own `nameTr` for `plate` before anything is emitted or compared, so a wrong plate cannot
 * quietly publish this prose on another province's page. That guard earns its keep in this wave
 * specifically: seventeen plate codes hand-listed once is exactly where a transposition hides.
 */
export const P3_TARGETS: readonly ProseTarget[] = [
  // NOVA's own blocks (brief §A.1-A.5, §A.7).
  { name: 'Van', plate: '65', field: 'settlementNoteTr' },
  { name: 'Van', plate: '65', field: 'landformNoteTr' },
  { name: 'Antalya', plate: '07', field: 'settlementNoteTr' },
  { name: 'Muğla', plate: '48', field: 'settlementNoteTr' },
  { name: 'Uşak', plate: '64', field: 'introTr' },
  { name: 'Rize', plate: '53', field: 'introTr' },
  { name: 'Rize', plate: '53', field: 'hydrographyNoteTr' },
  { name: 'İstanbul', plate: '34', field: 'landformNoteTr' },
  { name: 'İstanbul', plate: '34', field: 'hydrographyNoteTr' },
  // The A.6 single-rule repair, eleven provinces (Van is fixed by its own block above).
  { name: 'Ankara', plate: '06', field: 'settlementNoteTr' },
  { name: 'Diyarbakır', plate: '21', field: 'settlementNoteTr' },
  { name: 'Gaziantep', plate: '27', field: 'settlementNoteTr' },
  { name: 'Mardin', plate: '47', field: 'settlementNoteTr' },
  { name: 'Şanlıurfa', plate: '63', field: 'settlementNoteTr' },
  { name: 'Hatay', plate: '31', field: 'settlementNoteTr' },
  { name: 'Mersin', plate: '33', field: 'settlementNoteTr' },
  { name: 'Erzurum', plate: '25', field: 'settlementNoteTr' },
  { name: 'Malatya', plate: '44', field: 'settlementNoteTr' },
  { name: 'Konya', plate: '42', field: 'settlementNoteTr' },
  { name: 'Kayseri', plate: '38', field: 'settlementNoteTr' },
];

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write('usage: oneoff-p3-province-prose.ts <emit|check> <draft.md> [...]\n');
    return 2;
  }
  return runProse({ ...args, targets: P3_TARGETS, seedFile: SEED_FILE });
}

// Run only when executed directly (`node oneoff-…ts …`), not when imported by a spec —
// importing must not trigger the CLI or clobber the test runner's exit code. The comparison is
// symlink-safe on BOTH sides (see `isDirectInvocation`): comparing the raw paths made this guard
// no-op through any symlinked segment, which turned the mandated §8 gate into a silent exit 0.
if (isDirectInvocation(import.meta.filename, process.argv[1])) {
  process.exitCode = main();
}
