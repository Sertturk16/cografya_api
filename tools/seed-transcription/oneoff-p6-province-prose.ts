/**
 * ONE-OFF — wave P6 province PROSE transcription (NOT a tool generalization).
 *
 * Scope: the W1 half of prose-cleanup wave-1. Eight `(plate, field)` pairs across seven provinces
 * remain here after CONTENT-W4 moved Ankara/06 and Bursa/16 `settlementNoteTr` to P8. The
 * retained set carries PC-35, PC-36, PC-17 and PC-04 work; PC-34 now belongs to P8.
 *
 * THE ORIGINAL TEN PAIRS IMPLEMENTED FIVE REGISTER ITEMS, not W1's whole item list: PC-34 ×1,
 * PC-35 ×4, PC-36 ×2, PC-17 ×2, PC-04 ×1. After the two P8 transfers, eight pairs and four
 * of those items remain here. PC-18 and PC-07 land entirely through the P1/P2 back-ports
 * below, and PC-06 spans the two halves (Sivas `introTr` here, Sivas `hydrographyNoteTr`
 * there). See `oneoff-province-prose-targets.ts`'s P6 docblock (PR #103 review, CR-M2).
 *
 * WHY THE ORIGINAL LANDING WAS TEN AND NOT TWELVE, which still matters when editing this wave. W1
 * corrects twelve province fields, but two of them — Çorum/19 and Sivas/58
 * `hydrographyNoteTr` — are the SOLE entries of `P1_TARGETS` and `P2_TARGETS`. Moving them
 * here the ordinary way would empty both lists, and an empty target list is not a quiet
 * no-op: it trips `oneoff-province-prose-targets.spec.ts`'s `$label is non-empty` case AND
 * `runProse`'s own "nothing expected" refusal simultaneously, turning two green gates
 * permanently red on a PR that improves the very prose they guard. So those two corrections
 * were BACK-PORTED into the P1/P2 drafts instead — the `ENGINEERING.md` §8 rule "back-port
 * the fix to the draft", applied to a draft that is stale rather than wrong — and ownership
 * never moved. Verifying this PR therefore means running the P1 and P2 gates too: they are
 * where those two fields' fidelity is actually asserted.
 *
 * WHEN P6 LANDED, THREE PAIRS MOVED (P3 -> P6: Ankara/06 `settlementNoteTr`, İstanbul/34
 * `hydrographyNoteTr`; P4 -> P6: Samsun/55 `settlementNoteTr`). P3 and P4 are multi-entry, so
 * they do not empty. Each move is the target-list edit plus the older draft's section
 * deletion — run `oneoff-p3`/`oneoff-p4 check` after this wave to prove the second half
 * landed. CONTENT-W4 later moved Ankara/06 and İstanbul/34 `landformNoteTr` to P8; the latter
 * came from P3, not P6. The key is the PAIR, not the plate.
 *
 * THE W2 HALF OF THIS WAVE IS NOT HERE. Four country fields (DJ, EG, CF) ride the COUNTRY
 * lane (`pnpm seed:transcribe`) in their own drafts, because that lane keys on `isoCode` and
 * cannot parse a `## 06. Ankara` heading, while this lane cannot parse a country section.
 * Two of those four were likewise back-ported into the single-field shims that already owned
 * them (Atlas ruling K-1); see `Owner's Inbox/prose-cleanup/seed-draft-countries-w2.md`.
 *
 * USAGE (reviewer-reproducible — pass the ONE authoritative P6 draft):
 *   node tools/seed-transcription/oneoff-p6-province-prose.ts emit  "../Owner's Inbox/prose-cleanup/seed-draft-provinces-p6.md"
 *   node tools/seed-transcription/oneoff-p6-province-prose.ts check "../Owner's Inbox/prose-cleanup/seed-draft-provinces-p6.md"
 *
 * NOTE THE FILENAME: pass `seed-draft-provinces-p6.md`, not `wave1-taslaklar.md`. The latter
 * is NOVA's authored deliverable, whose `#### \`field\`` headings and trailing commentary
 * blockquotes this lane's parser does not read as a wave draft — it would find zero fields,
 * which the "no draft body found" guard reports loudly by design.
 *
 * HOW THE LANE DRAFT RELATES TO NOVA'S FILE, stated as something a reviewer can CHECK. The
 * lane draft was sliced out of `wave1-taslaklar.md` §2 by a throwaway script, and an earlier
 * version of this docblock offered that script as the guarantee — but it was never committed
 * and no longer exists, so "nothing was retyped" rested on an artifact nobody could obtain
 * (PR #103 review, CR-M3). The guarantee is now the PROPERTY rather than the provenance:
 * every blockquote in the lane draft is BYTE-IDENTICAL to the first blockquote under the
 * matching `#### \`field\`` heading in `wave1-taslaklar.md`. That is verifiable after the
 * fact, by anyone, with no access to whatever produced it; the replay command is published in
 * `Owner's Inbox/prose-cleanup/closing-summary.md` §9; after the two P8 transfers the live
 * replay scope is 10/10 (8 province + 2 country). A property a third party can re-derive is
 * worth more than a script they must
 * trust — which was the point of the tool existing in the first place.
 *
 * WHICH LANE OWNS WHICH FILE (the §8 false-green rule): this lane owns
 * `province.seed-data.ts`. `pnpm seed:transcribe` owns `src/database/seeds/countries/` and
 * cannot see this file, so running it against this PR's province change would report a green
 * it did not earn — a real PR #70 review finding, not a hypothetical.
 *
 * The draft lives OUTSIDE the repo (`Owner's Inbox/`), so the path is a CLI argument and this
 * ENTRY POINT is wired into NO CI job (it is covered by `typecheck` only). The logic it drives IS
 * covered: `oneoff-province-prose-runner.ts` and the wave tables carry unit specs.
 *
 * `parseArgs` and `isDirectInvocation` come from the CLIMATE runner deliberately, exactly as
 * P1-P5 take them: both are lane-agnostic and already spec-pinned there, and `isDirectInvocation`
 * must never be re-implemented as a raw `import.meta.url === pathToFileURL(argv[1])` compare —
 * that silently no-ops the whole gate on any symlinked path (PR #94 review, SFH94-I1).
 */
import * as path from 'node:path';

import { isDirectInvocation, parseArgs } from './oneoff-province-climate-runner.ts';
import { P6_TARGETS } from './oneoff-province-prose-targets.ts';
import { runProse } from './oneoff-province-prose-runner.ts';

const SEED_FILE = path.resolve(
  import.meta.dirname,
  '../../src/database/seeds/province.seed-data.ts',
);

function main(): number {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stderr.write('usage: oneoff-p6-province-prose.ts <emit|check> <draft.md> [...]\n');
    return 2;
  }
  return runProse({ ...args, targets: P6_TARGETS, seedFile: SEED_FILE });
}

// Run only when executed directly (`node oneoff-…ts …`), not when imported by a spec —
// importing must not trigger the CLI or clobber the test runner's exit code. The comparison is
// symlink-safe on BOTH sides (see `isDirectInvocation`): comparing the raw paths made this guard
// no-op through any symlinked segment, which turned the mandated §8 gate into a silent exit 0.
if (isDirectInvocation(import.meta.filename, process.argv[1])) {
  process.exitCode = main();
}
