/**
 * The early-warning disclaimer served on `GET /api/earthquakes/meta` — a liability note, and
 * therefore an UNTOUCHABLE string (`CONTENT-STYLE.md` §22: licence, liability and KVKK text).
 *
 * ## Owner-ruled, verbatim, and a single character is a new owner decision
 * `DEC 2026-08-19l` locks the wording. It is never translated, shortened, re-cased, re-punctuated
 * or "improved"; the §22 formal register stays (the site-wide informal "sen" address explicitly
 * exempts this class). SPEC §10 carries the identical draft and the two agree byte for byte — the
 * ruling is the authority, and the SPEC line is a copy of it rather than a second source.
 *
 * ## Why a compiled constant, and why it is pinned in a spec
 * Same reasoning as `earthquake-attribution.constant.ts`: the string exists at compile time, a
 * human reads it in the diff, and the spec beside this file asserts it byte for byte plus the ONE
 * substitution a whole-string diff hides in a terminal — the ASCII apostrophe in `AFAD'ın`
 * (U+0027) silently becoming a typographic `’` (U+2019). That is this string's version of the
 * attribution notice's EN DASH trap, and it is why the code point is asserted on its own.
 *
 * ## What it is FOR, structurally
 * SPEC §9.2 gives the early-warning ban three api-side forms: no future-tense field anywhere in
 * the contract, no push/stream endpoint, and this note published as data. The first two are
 * enforced by the contract spec; this is the third, and it is the only one a reader ever sees.
 * The API publishes the SENTENCE here because it is not interface copy the web may re-author —
 * every other reader-facing string on this leg is Vera's (SPEC §10).
 *
 * D-6 (`QUESTIONS.md`) and DEC 2026-07-30k are the underlying rulings; this note is their
 * "görünür not" requirement discharged.
 */

/**
 * The ruled text. See the file docblock before touching a single byte of it.
 *
 * Split across two segments at a sentence boundary purely for line width — the spec beside this
 * file asserts the JOINED value, so a dropped or doubled space at the seam fails there rather
 * than reaching a page.
 */
export const EARTHQUAKE_DISCLAIMER_TR =
  "Bu sayfa, AFAD'ın yayımladığı gerçekleşmiş deprem kayıtlarını gösterir. " +
  'Erken uyarı sistemi değildir; gelecek depremler hakkında bilgi vermez.';
