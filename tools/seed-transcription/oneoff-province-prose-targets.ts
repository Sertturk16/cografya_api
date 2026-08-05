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
];

/** The `(plate, field)` identity of a target — the only key a cross-wave collision means. */
export function targetKey(target: ProseTarget): string {
  return `${target.plate} ${target.field}`;
}
