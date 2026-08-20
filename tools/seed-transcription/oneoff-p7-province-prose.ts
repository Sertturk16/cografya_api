/**
 * ONE-OFF — wave P7 province PROSE transcription (NOT a tool generalization).
 *
 * Scope: the province half of the prose-cleanup W8-VOLKAN wave — four `landformNoteTr` rows whose
 * "sönmüş" (extinct) classification contradicts the institution the same sentence cites (register
 * item PC-37, owner greenlight DEC 2026-08-19d). The criterion applied is AT-8's: a volcano with
 * a Holocene activity record is not called extinct.
 *
 * FOUR PAIRS, ZERO TRANSFERS. `(21|38|42|70) landformNoteTr` are all pairs no wave has owned, so
 * no earlier target list is emptied and no earlier gate turns red. Three of the four plates are
 * owned by P3 on `settlementNoteTr` — the key is the PAIR, never the plate, and the targets spec
 * pins both halves of that statement.
 *
 * ONE OF THE FOUR IS A DIFFERENT KIND OF CORRECTION, and conflating them is the misreading to
 * avoid. Diyarbakır, Kayseri and Konya each contradict a named source (MTA TURKVOLC keeps Karaca
 * Dağ, Erciyes Dağı and the Karapınar volcanic field on its ACTIVE list). Karaman contradicts
 * nothing: neither MTA nor the Smithsonian GVP classifies Karadağ at all — measured with positive
 * controls in the draft's §2 — so its correction removes an unsourced adjective and adds no claim.
 *
 * THE KONYA SENTENCE CARRIES AN ATLAS RULING, not just a source. `AK-34` (2026-08-20) accepted the
 * fact-check's F-4 and F-5 together: the direction phrase moves from "Kuzeydoğuda, Aksaray
 * sınırındaki" to "Doğuda Karapınar çevresindeki … güneyde Karaman sınırındaki", and "(Hotamış)"
 * is deleted because Hotamış is a ~980 m marsh, not a second name for a 2.288 m volcanic massif.
 * That ruling also makes Konya and Karaman two pages describing the SAME Karadağ — a real
 * `SEO-POLICY.md` A4 pair, recorded in the draft §4 for the cross-link that follows it.
 *
 * USAGE (reviewer-reproducible — pass the ONE authoritative P7 draft):
 *   node tools/seed-transcription/oneoff-p7-province-prose.ts emit  "../Owner's Inbox/prose-cleanup/seed-draft-provinces-p7.md"
 *   node tools/seed-transcription/oneoff-p7-province-prose.ts check "../Owner's Inbox/prose-cleanup/seed-draft-provinces-p7.md"
 *
 * NOTE THE FILENAME: pass `seed-draft-provinces-p7.md`, not `w8-volkan-draft.md`. The latter is
 * NOVA's authored deliverable; its `### 1.1 Diyarbakır · …` headings and its many commentary
 * blockquotes are not a wave draft, and pointing this lane at it fails the "no draft body found"
 * guard by design rather than silently transcribing the wrong quote.
 *
 * HOW THE LANE DRAFT RELATES TO NOVA'S FILE, as a property a reviewer can re-derive rather than a
 * provenance claim they must trust (the P6 lesson, PR #103 review CR-M3): every CHANGED paragraph
 * in the lane draft is the line-unwrapped form of the matching "Önerilen …" blockquote in
 * `w8-volkan-draft.md`, and every UNCHANGED paragraph is the committed seed value folded through
 * this toolchain's own `foldStringConcat`. Nothing was retyped. The replay command is published in
 * `Owner's Inbox/prose-cleanup/closing-summary-w8.md` §7.
 *
 * THE FOUR COUNTRY ROWS OF THE SAME WAVE ARE NOT HERE. They ride the COUNTRY lane
 * (`pnpm seed:transcribe`), which keys on `isoCode` and cannot parse a `## 21. Diyarbakır`
 * heading, while this lane cannot parse a country section. Only two of those four landed:
 * `RU landformNoteTr` in `seed-draft-countries-w8.md` and `SV hydrographyNoteTr` back-ported into
 * the draft that already owns it. `IR` and `AM` did NOT land in this wave: at the time they were
 * declared in `country.seed-data.ts`, outside the country lane's `SEED_DIR` entirely (§8), so no
 * `check` gate could reach them — they were escalated to Atlas rather than hand-edited.
 * THAT IS NO LONGER THE STATE, and the difference decides which tool you reach for:
 * FU-PILOT-RETIRE (PR #127, AK-36) moved all eight pilot rows into
 * `src/database/seeds/countries/`, so both rows ARE inside the country lane's world now and
 * both corrections landed there through `pnpm seed:transcribe apply --force`. A further IR/AM
 * prose fix is an ordinary COUNTRY-lane wave — never a hand edit of `asia.countries.ts`, which
 * is the PR #43 dropped-space path §8 forbids.
 *
 * WHICH LANE OWNS WHICH FILE (the §8 false-green rule): this lane owns `province.seed-data.ts`.
 * `pnpm seed:transcribe` owns `src/database/seeds/countries/` and cannot see this file, so
 * running it against this PR's province change would report a green it did not earn — a real
 * PR #70 review finding, not a hypothetical.
 *
 * The draft lives OUTSIDE the repo (`Owner's Inbox/`), so the path is a CLI argument and this
 * ENTRY POINT is wired into NO CI job (it is covered by `typecheck` only). The logic it drives IS
 * covered: `oneoff-province-prose-runner.ts` and the wave tables carry unit specs.
 *
 * `parseArgs` and `isDirectInvocation` come from the CLIMATE runner deliberately, exactly as
 * P1-P6 take them: both are lane-agnostic and already spec-pinned there, and `isDirectInvocation`
 * must never be re-implemented as a raw `import.meta.url === pathToFileURL(argv[1])` compare —
 * that silently no-ops the whole gate on any symlinked path (PR #94 review, SFH94-I1).
 */
import * as path from 'node:path';

import { isDirectInvocation, parseArgs } from './oneoff-province-climate-runner.ts';
import { P7_TARGETS } from './oneoff-province-prose-targets.ts';
import { runProse } from './oneoff-province-prose-runner.ts';

const SEED_FILE = path.resolve(
  import.meta.dirname,
  '../../src/database/seeds/province.seed-data.ts',
);

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write('usage: oneoff-p7-province-prose.ts <emit|check> <draft.md> [...]\n');
    return 2;
  }
  return runProse({ ...args, targets: P7_TARGETS, seedFile: SEED_FILE });
}

// Run only when executed directly (`node oneoff-…ts …`), not when imported by a spec —
// importing must not trigger the CLI or clobber the test runner's exit code. The comparison is
// symlink-safe on BOTH sides (see `isDirectInvocation`): comparing the raw paths made this guard
// no-op through any symlinked segment, which turned the mandated §8 gate into a silent exit 0.
if (isDirectInvocation(import.meta.filename, process.argv[1])) {
  process.exitCode = main();
}
