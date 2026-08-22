/**
 * WAVE TARGET LISTS for the province PROSE lane — the data half of P1, P2, P3, …
 *
 * WHY THIS MODULE EXISTS (TA94-M1, ruled into effect by the PR #95 review). Each prose wave's
 * target list used to live inside its own entry point, next to `import.meta.dirname`. That made
 * the lists structurally UNTESTABLE: an entry point owns `import.meta`, so a CommonJS (ts-jest)
 * spec cannot import one, and the only cross-wave guarantee available was a human promising to
 * eyeball three files. The check that matters most — "a later wave must not silently re-seed a
 * province+field an earlier wave already published" — was therefore performed BY HAND on every
 * PR, which is exactly the kind of guarantee that holds until the day it does not.
 *
 * The climate lane already solved this: `N1_TARGETS`/`N2_TARGETS` live in the `import.meta`-free
 * `oneoff-province-climate-extract.ts` and its spec pins their cross-wave invariants. This is the
 * same move for the prose lane, and the third wave (P3) was the recorded trigger for making it.
 *
 * Deliberately `import.meta`-free, and it stays that way: the moment anything here reaches for
 * `import.meta.dirname` the spec stops being able to load it and the guarantee silently reverts
 * to a human promise. The entry points keep owning `import.meta`, argv and the usage banner; the
 * SHELLS (`oneoff-province-prose-runner.ts`, `oneoff-province-climate-runner.ts`) are untouched
 * by this split — a new wave is still "a new target list + a new entry point", never a
 * generalisation of the shared shell (Atlas ruling 2026-07-25 / AS-3 option C).
 *
 * THE KEY IS `(plate, field)`, NOT `plate`. The climate lane keys its cross-wave check on the
 * plate alone because it transcribes exactly one field (`climateNarrativeTr`), so one province
 * belongs to one wave forever. The prose lane is field-parametric: P1 corrected Çorum's
 * `hydrographyNoteTr`, and a future wave correcting Çorum's `introTr` is perfectly legal and must
 * not be reported as a collision. P3 makes the same point inside a single wave — it carries Van
 * twice, on two different fields. Only the PAIR is the identity.
 *
 * ONE OWNER PER PAIR, AND OWNERSHIP CAN MOVE. These lists say who owns a field NOW, not who ever
 * touched it — git holds the history. When a later wave corrects a field an earlier wave already
 * published, the entry MOVES: it is deleted from the earlier list (and from that wave's draft)
 * and added to the later one. It is NOT duplicated, and the non-overlap invariant is NOT relaxed
 * to permit duplication.
 *
 * That is not bookkeeping taste, it is the only arrangement in which every gate can be green at
 * once. A wave's `check` byte-compares the seed against THAT wave's draft. If two waves both
 * claimed a pair, the later correction would put the seed at odds with the earlier wave's draft,
 * so the earlier gate would go red on a PR that never mentioned it — and a mandated gate that
 * cannot go green is the thing `ENGINEERING.md` §8 warns trains people to ignore gates. Moving
 * the entry leaves exactly one draft asserting each field, so P1…P4 are all green simultaneously.
 * PR #96 is the first exercise of this: Mersin/33 `settlementNoteTr` moved P3 -> P4.
 */
import type { ProseTarget } from './oneoff-province-prose-runner.ts';

/**
 * P1 (PR #92) — the single `hydrographyNoteTr` correction AN-3/AN-4 ruled for Çorum: the
 * Kızılırmak length figure and the çeltik claim.
 */
export const P1_TARGETS: readonly ProseTarget[] = [
  { name: 'Çorum', plate: '19', field: 'hydrographyNoteTr' },
];

/**
 * P2 (PR #94) — the single `hydrographyNoteTr` rewrite AS-6b/AS-9 ruled for Sivas: the bare
 * 1.355 km figure gains its MEB attribution and the field's `CONTENT-STYLE.md` §16 violation
 * closes.
 */
export const P2_TARGETS: readonly ProseTarget[] = [
  { name: 'Sivas', plate: '58', field: 'hydrographyNoteTr' },
];

/**
 * P3 (PR #95) — the content-fix micro pass (NOVA's brief PART A, Atlas AT-5..AT-9): internal
 * jargon leaks, the broken `settlementNoteTr` template that turned out to sit in twelve
 * provinces, the Nemrut/Erciş factual corrections, Rize's unsourceable rainfall figure and
 * İstanbul's repeated Haliç/Bosphorus definitions.
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
  // İstanbul/34 `landformNoteTr` stood here until P8. CONTENT-W4 corrects the same field's
  // tense, so ownership MOVED to P8 rather than being duplicated.
  // İstanbul/34 `hydrographyNoteTr` stood here until PR-P6. P6 splits that same field into
  // three paragraphs (CONTENT-STYLE §20, zero words changed), so OWNERSHIP MOVED — see the
  // "one owner per pair" note in this module's docblock. CONTENT-W4 later moved the plate's
  // DIFFERENT `landformNoteTr` pair to P8; the key is the PAIR, never the plate.
  // The A.6 single-rule repair. SIX entries remain below. Mersin/33 moved to P4 (PR #96),
  // Ankara/06 moved to P6 (PR-P6), and Gaziantep/27 plus Konya/42 plus Kayseri/38 moved to P8
  // (CONTENT-W4). Each move is noted at the exact line the entry used to occupy.
  //
  // Ankara/06 `settlementNoteTr` stood here until PR-P6, which corrects the same field again
  // (PC-34: the migration sentence framed +8,91 as "behind İstanbul", which this seed's own
  // netMigrationRate values contradict — İstanbul is +1,66). Ownership MOVED to P6.
  { name: 'Diyarbakır', plate: '21', field: 'settlementNoteTr' },
  // Gaziantep/27 `settlementNoteTr` stood here until P8; ownership MOVED.
  { name: 'Mardin', plate: '47', field: 'settlementNoteTr' },
  { name: 'Şanlıurfa', plate: '63', field: 'settlementNoteTr' },
  { name: 'Hatay', plate: '31', field: 'settlementNoteTr' },
  // Mersin/33 stood here until PR #96. P4 corrects the same field again (a wave-name leak
  // this pass did not carry), so OWNERSHIP MOVED rather than being duplicated — see the
  // "one owner per pair" note in this module's docblock.
  { name: 'Erzurum', plate: '25', field: 'settlementNoteTr' },
  { name: 'Malatya', plate: '44', field: 'settlementNoteTr' },
  // Konya/42 and Kayseri/38 `settlementNoteTr` stood here until P8; ownership MOVED.
];

/**
 * P4 (PR #96) — the B17 survivors NOVA's structural re-scan found after P3 landed, plus the last
 * three wave-name leaks (`p4-ek-brief.md` Part 1 §2 + Part 3 §4.3, Atlas AT-11a-d).
 *
 * WHY THERE WAS A SECOND ROUND AT ALL, worth stating because it is the lesson: P3 scanned for the
 * defect with ONE literal string, which silently made that string's loudest marker (`sonucu,` +
 * `gelmiyor`) stand in for the defect itself. Twelve provinces carried the same comma-splice with
 * a complete predicate and the correct tense, and one (Samsun) carries it with the caveat's second
 * half missing entirely — so it holds no anchor text at all and no string search could reach it.
 * NOVA re-scanned STRUCTURALLY (independent clause + comma + independent clause across all 280
 * prose fields) and cross-checked against the narrow anchor; the two passes agree on this set.
 *
 * Mersin/33 moved here from P3 because P4 corrected it again — P3 repaired its B17 tail, while
 * this wave dropped its "dalganın en yüksek ikinci" wave-name leak. CONTENT-W4 later moved the
 * pair from P4 to P8. See the ownership note above.
 */
export const P4_TARGETS: readonly ProseTarget[] = [
  { name: 'İzmir', plate: '35', field: 'settlementNoteTr' },
  // Kocaeli/41 and Sakarya/54 `settlementNoteTr` stood here until P8; ownership MOVED.
  { name: 'Aydın', plate: '09', field: 'settlementNoteTr' },
  { name: 'Denizli', plate: '20', field: 'settlementNoteTr' },
  { name: 'Manisa', plate: '45', field: 'settlementNoteTr' },
  // Adana/01 `settlementNoteTr` stood here until P8; ownership MOVED.
  { name: 'Kahramanmaraş', plate: '46', field: 'settlementNoteTr' },
  { name: 'Eskişehir', plate: '26', field: 'settlementNoteTr' },
  { name: 'Ordu', plate: '52', field: 'settlementNoteTr' },
  { name: 'Trabzon', plate: '61', field: 'settlementNoteTr' },
  // Samsun/55 `settlementNoteTr` stood here until PR-P6. P6 corrects the same field again
  // (PC-35: this row's caveat was missing its whole second half AND the "büyükşehir
  // statüsündeki illerde" qualifier), so OWNERSHIP MOVED — the same transfer rule.
  // Mersin/33 `settlementNoteTr` stood here until P8; ownership MOVED.
];

/**
 * P5 — the fifteen `climateCurriculumNoteTr` notes that ship with the müfredat climate name
 * (→ DEC 2026-08-05c, DEC 2026-08-05f #3/#4, DEC 2026-08-06a, DEC 2026-08-06b; Atlas ruling
 * AK-1/AK-4/AK-7).
 *
 * Draft: `Owner's Inbox/koppen-sablon-gecisi/seed-draft-provinces-p5.md` — the lane-format
 * transcription of NOVA's `cumle-taslaklari.md` §2 blocks (see that file's header).
 *
 * TWO KINDS OF NOTE, ONE FIELD. Eleven provinces sit on a boundary the textbook map cannot
 * resolve at its ~1:10.000.000 scale (Tekirdağ, Çanakkale, Balıkesir, Kütahya, Isparta,
 * Burdur, Amasya, Tokat, Gümüşhane, Bayburt, Denizli); eight carry a name whose geographic
 * label is not their own region (Gaziantep, Kilis, Afyonkarahisar, Çorum, Kütahya, Gümüşhane,
 * Bayburt, Denizli). The four in both sets get ONE flowing paragraph rather than two glued
 * blocks — the reason the entity has a single note column.
 *
 * ZERO OWNERSHIP TRANSFERS: every pair here is a field no wave has ever owned (the column
 * did not exist until this PR), so the non-overlap invariant holds without moving anything
 * out of P1-P4.
 */
export const P5_TARGETS: readonly ProseTarget[] = [
  // The eleven boundary readings (DEC 2026-08-05f #3; Denizli joined them with
  // DEC 2026-08-06b, which returned its mapping row to BELİRSİZ).
  { name: 'Tekirdağ', plate: '59', field: 'climateCurriculumNoteTr' },
  { name: 'Çanakkale', plate: '17', field: 'climateCurriculumNoteTr' },
  { name: 'Balıkesir', plate: '10', field: 'climateCurriculumNoteTr' },
  { name: 'Kütahya', plate: '43', field: 'climateCurriculumNoteTr' },
  { name: 'Isparta', plate: '32', field: 'climateCurriculumNoteTr' },
  { name: 'Burdur', plate: '15', field: 'climateCurriculumNoteTr' },
  { name: 'Amasya', plate: '05', field: 'climateCurriculumNoteTr' },
  { name: 'Tokat', plate: '60', field: 'climateCurriculumNoteTr' },
  { name: 'Gümüşhane', plate: '29', field: 'climateCurriculumNoteTr' },
  { name: 'Bayburt', plate: '69', field: 'climateCurriculumNoteTr' },
  { name: 'Denizli', plate: '20', field: 'climateCurriculumNoteTr' },
  // The out-of-region names (DEC 2026-08-05f #4). Kütahya, Gümüşhane, Bayburt and Denizli are
  // also in the list above — their single note answers both, so they appear ONCE.
  { name: 'Gaziantep', plate: '27', field: 'climateCurriculumNoteTr' },
  { name: 'Kilis', plate: '79', field: 'climateCurriculumNoteTr' },
  { name: 'Afyonkarahisar', plate: '03', field: 'climateCurriculumNoteTr' },
  { name: 'Çorum', plate: '19', field: 'climateCurriculumNoteTr' },
];

/**
 * P6 (PR-P6) — the prose-cleanup wave-1 W1 half, as scoped by owner ruling AY-1
 * (`QUESTIONS.md`, 2026-08-06).
 *
 * WHICH REGISTER ITEMS THIS TABLE ACTUALLY IMPLEMENTS, which is NOT the same list as W1's
 * scope (PR #103 review, CR-M2 — the two were conflated here). The original ten pairs were
 * accounted for by FIVE items: PC-34 ×1 (Ankara), PC-35 ×4, PC-36 ×2, PC-17 ×2, PC-04 ×1.
 * CONTENT-W4 moved Ankara/06 (PC-34) and Bursa/16 (one PC-35 row) to P8, so eight pairs remain.
 * Three further W1 items are NOT implemented by any entry in this list:
 *   - PC-18 (Çorum `hydrographyNoteTr`) and PC-07 (Sivas `hydrographyNoteTr`) land entirely
 *     through the P1/P2 back-ports described below — their pairs stay owned by P1 and P2;
 *   - PC-06 SPANS both halves: its Sivas `introTr` side is here (jointly with PC-36), its
 *     Sivas `hydrographyNoteTr` side is in the P2 back-port.
 * Stating the wave's scope here instead would make this docblock claim assertions the table
 * does not carry, which is the one thing a target list must never do.
 *
 * Draft: `Owner's Inbox/prose-cleanup/seed-draft-provinces-p6.md`. The W2 half of the same
 * wave is FOUR COUNTRY fields and rides the country lane in its own drafts — a country
 * section is unparseable here and a province section is unparseable there (§8).
 *
 * THE ORIGINAL LANDING WAS TEN PAIRS, NOT TWELVE — and the two missing ones are the interesting
 * part. W1 corrects
 * twelve province fields, but Çorum/19 and Sivas/58 `hydrographyNoteTr` are the SOLE entries
 * of `P1_TARGETS` and `P2_TARGETS`. Moving them the ordinary way would EMPTY both lists, and
 * an empty list is not a quiet no-op here: it trips the spec's `$label is non-empty` case and
 * `runProse`'s own "nothing expected" refusal at once — two green gates turned permanently red
 * by a PR that improves the prose they guard. So those two corrections were BACK-PORTED into
 * the P1/P2 drafts instead (`ENGINEERING.md` §8, "back-port the fix to the draft"), leaving
 * ownership exactly where it was. This wave never claims them.
 *
 * WHEN P6 LANDED, THREE PAIRS MOVED HERE (P3 -> P6: Ankara/06 `settlementNoteTr`, İstanbul/34
 * `hydrographyNoteTr`; P4 -> P6: Samsun/55 `settlementNoteTr`), because P3 and P4 are
 * multi-entry and do not empty. Each move is two edits — delete there, add here — plus the
 * draft-section deletion that keeps the older wave's `check` green. `HISTORICALLY_OWNED`
 * needs NO edit for a move: it is append-only and deliberately keeps a pair listed after it
 * changes hands. The seven pairs that were new when P6 landed are what extended it; the later P8
 * transfers of Ankara/06 and Bursa/16 add no duplicate historical entries.
 */
export const P6_TARGETS: readonly ProseTarget[] = [
  // Ankara/06 `settlementNoteTr` stood here until P8; ownership MOVED.
  // PC-35 — four büyükşehir rows carrying only the first half of the shared 6360 caveat.
  { name: 'Balıkesir', plate: '10', field: 'settlementNoteTr' },
  // Bursa/16 `settlementNoteTr` stood here until P8; ownership MOVED.
  { name: 'Tekirdağ', plate: '59', field: 'settlementNoteTr' },
  { name: 'Samsun', plate: '55', field: 'settlementNoteTr' },
  // PC-36 (fact) — the loose "Türkiye'nin en uzun nehri" scope, on its two remaining pages.
  { name: 'Sivas', plate: '58', field: 'introTr' },
  { name: 'Samsun', plate: '55', field: 'hydrographyNoteTr' },
  // PC-17 — CONTENT-STYLE §16, sentences carrying three independent facts.
  { name: 'Şırnak', plate: '73', field: 'landformNoteTr' },
  { name: 'Bolu', plate: '14', field: 'landformNoteTr' },
  // PC-04 — CONTENT-STYLE §20 paragraph split, zero words changed.
  { name: 'İstanbul', plate: '34', field: 'hydrographyNoteTr' },
];

/**
 * P7 (PR-W8) — the province half of the prose-cleanup W8-VOLKAN wave: the four `landformNoteTr`
 * rows whose "sönmüş" (extinct) classification contradicts the institutions the same sentence
 * cites (register item PC-37; owner greenlight DEC 2026-08-19d, Atlas ruling AK-34 for the Konya
 * sentence's final form).
 *
 * Draft: `Owner's Inbox/prose-cleanup/seed-draft-provinces-p7.md`. The FOUR country rows of the
 * same wave ride the country lane in their own drafts — a country section is unparseable here.
 *
 * ZERO OWNERSHIP TRANSFERS, and that is measured rather than assumed: no `(plate, landformNoteTr)`
 * pair for 21, 38, 42 or 70 appears in `HISTORICALLY_OWNED` below. Three of those plates ARE owned
 * by P3 — on `settlementNoteTr` — which is exactly the case the module docblock calls out: the key
 * is the PAIR, never the plate. So this wave empties no list and reddens no earlier gate.
 *
 * WHY 21/38/42 CHANGE AND 70 IS DIFFERENT IN KIND, worth recording because the next reader will
 * assume all four are the same fix. Diyarbakır, Kayseri and Konya each CONTRADICT a source their
 * own sentence names (MTA keeps Karaca Dağ, Erciyes and the Karapınar field on its active list).
 * Karaman contradicts nothing: no institution classifies Karadağ at all, so the correction is the
 * removal of one unsourced adjective, not a factual repair (draft §2).
 */
export const P7_TARGETS: readonly ProseTarget[] = [
  { name: 'Diyarbakır', plate: '21', field: 'landformNoteTr' },
  { name: 'Kayseri', plate: '38', field: 'landformNoteTr' },
  { name: 'Konya', plate: '42', field: 'landformNoteTr' },
  { name: 'Karaman', plate: '70', field: 'landformNoteTr' },
];

/**
 * P8 (CONTENT-W4 PR-1) — seventeen province narrative fields whose structural/geographic prose
 * uses present tense where `CONTENT-STYLE.md` §23 requires simple present (or Gaziantep's ruled
 * past-tense result). Ten pairs transfer from P3/P4/P6 and seven pairs receive first ownership.
 */
export const P8_TARGETS: readonly ProseTarget[] = [
  { name: 'İstanbul', plate: '34', field: 'landformNoteTr' },
  { name: 'Ankara', plate: '06', field: 'settlementNoteTr' },
  { name: 'Gaziantep', plate: '27', field: 'settlementNoteTr' },
  { name: 'Bilecik', plate: '11', field: 'settlementNoteTr' },
  { name: 'Bursa', plate: '16', field: 'settlementNoteTr' },
  { name: 'Çanakkale', plate: '17', field: 'settlementNoteTr' },
  { name: 'Edirne', plate: '22', field: 'settlementNoteTr' },
  { name: 'Kırklareli', plate: '39', field: 'settlementNoteTr' },
  { name: 'Kocaeli', plate: '41', field: 'settlementNoteTr' },
  { name: 'Sakarya', plate: '54', field: 'settlementNoteTr' },
  { name: 'Yalova', plate: '77', field: 'settlementNoteTr' },
  { name: 'Adana', plate: '01', field: 'settlementNoteTr' },
  { name: 'Mersin', plate: '33', field: 'settlementNoteTr' },
  { name: 'Konya', plate: '42', field: 'settlementNoteTr' },
  { name: 'Kayseri', plate: '38', field: 'settlementNoteTr' },
  { name: 'Ordu', plate: '52', field: 'hydrographyNoteTr' },
  { name: 'Trabzon', plate: '61', field: 'hydrographyNoteTr' },
];

/**
 * EVERY shipped prose wave, in landing order.
 *
 * The spec iterates THIS, so adding a wave above without appending it here would leave the new
 * list unguarded — which is the failure this module was created to end. Keep them together.
 */
export const PROSE_WAVES: readonly {
  readonly label: string;
  readonly targets: readonly ProseTarget[];
}[] = [
  { label: 'P1', targets: P1_TARGETS },
  { label: 'P2', targets: P2_TARGETS },
  { label: 'P3', targets: P3_TARGETS },
  { label: 'P4', targets: P4_TARGETS },
  { label: 'P5', targets: P5_TARGETS },
  { label: 'P6', targets: P6_TARGETS },
  { label: 'P7', targets: P7_TARGETS },
  { label: 'P8', targets: P8_TARGETS },
];

/** The `(plate, field)` identity of a target — the only key a cross-wave collision means. */
export function targetKey(target: ProseTarget): string {
  return `${target.plate} ${target.field}`;
}

/**
 * Every `(plate, field)` pair any wave has EVER owned. **APPEND-ONLY — never delete a line.**
 *
 * WHAT THIS CLOSES. Ownership moves (see the note above), and moving is two edits: delete from
 * the old wave, add to the new one. The second edit is the one nothing else can check. Forget it
 * and the field becomes an ORPHAN — corrected prose sitting in the seed that NO draft asserts, so
 * no `check` in any lane ever looks at it again and it can drift silently forever. The
 * transfer-specific case pinned in the spec catches that for Mersin alone; this catches it for
 * every pair, including the transfers nobody has made yet.
 *
 * The invariant is a SUPERSET one: the union of all live wave lists must contain every pair ever
 * recorded here. It deliberately does NOT require the reverse — a wave may add new pairs freely,
 * and appending them here is the same edit's other half.
 *
 * Order is landing order, then wave-local order. Entries are never removed even when the pair
 * changes hands; that is exactly the history this list exists to hold.
 */
export const HISTORICALLY_OWNED: readonly string[] = [
  // P1 (PR #92)
  '19 hydrographyNoteTr',
  // P2 (PR #94)
  '58 hydrographyNoteTr',
  // P3 (PR #95) — 33 settlementNoteTr moved to P4, then P8; it stays listed here.
  '65 settlementNoteTr',
  '65 landformNoteTr',
  '07 settlementNoteTr',
  '48 settlementNoteTr',
  '64 introTr',
  '53 introTr',
  '53 hydrographyNoteTr',
  '34 landformNoteTr',
  '34 hydrographyNoteTr',
  '06 settlementNoteTr',
  '21 settlementNoteTr',
  '27 settlementNoteTr',
  '47 settlementNoteTr',
  '63 settlementNoteTr',
  '31 settlementNoteTr',
  '33 settlementNoteTr',
  '25 settlementNoteTr',
  '44 settlementNoteTr',
  '42 settlementNoteTr',
  '38 settlementNoteTr',
  // P4 (PR #96)
  '35 settlementNoteTr',
  '41 settlementNoteTr',
  '54 settlementNoteTr',
  '09 settlementNoteTr',
  '20 settlementNoteTr',
  '45 settlementNoteTr',
  '01 settlementNoteTr',
  '46 settlementNoteTr',
  '26 settlementNoteTr',
  '52 settlementNoteTr',
  '61 settlementNoteTr',
  '55 settlementNoteTr',
  // P5 (the müfredat climate note) — a brand-new field, so no pair here was ever owned before.
  '59 climateCurriculumNoteTr',
  '17 climateCurriculumNoteTr',
  '10 climateCurriculumNoteTr',
  '43 climateCurriculumNoteTr',
  '32 climateCurriculumNoteTr',
  '15 climateCurriculumNoteTr',
  '05 climateCurriculumNoteTr',
  '60 climateCurriculumNoteTr',
  '29 climateCurriculumNoteTr',
  '69 climateCurriculumNoteTr',
  '20 climateCurriculumNoteTr',
  '27 climateCurriculumNoteTr',
  '79 climateCurriculumNoteTr',
  '03 climateCurriculumNoteTr',
  '19 climateCurriculumNoteTr',
  // P6 (PR-P6, prose-cleanup wave-1 / W1). Only the SEVEN pairs no wave had owned before are
  // listed. Its transferred pairs — '06 settlementNoteTr', '34 hydrographyNoteTr' (both from P3)
  // and '55 settlementNoteTr' (from P4) — were already recorded under their first owner. P8 has
  // since taken '06 settlementNoteTr'; the append-only record deliberately does not move or
  // duplicate it.
  '10 settlementNoteTr',
  '16 settlementNoteTr',
  '59 settlementNoteTr',
  '58 introTr',
  '55 hydrographyNoteTr',
  '73 landformNoteTr',
  '14 landformNoteTr',
  // P7 (PR-W8, prose-cleanup W8-VOLKAN). All four pairs are NEW — 21, 38 and 42 appear above
  // only on `settlementNoteTr` (P3), and plate 70 appears here for the first time.
  '21 landformNoteTr',
  '38 landformNoteTr',
  '42 landformNoteTr',
  '70 landformNoteTr',
  // P8 (CONTENT-W4 PR-1). Only the SEVEN first-owned pairs are appended. The ten transfers
  // already appear under P3/P4/P6 and must not be duplicated in this append-only record.
  '11 settlementNoteTr',
  '17 settlementNoteTr',
  '22 settlementNoteTr',
  '39 settlementNoteTr',
  '77 settlementNoteTr',
  '52 hydrographyNoteTr',
  '61 hydrographyNoteTr',
];
