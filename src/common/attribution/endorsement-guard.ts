/**
 * The shared No-Endorsement guard — ONE copy, used by every attribution spec.
 *
 * ## SPEC INFRASTRUCTURE. Never imported by production code, never emitted to `dist/`
 * It lives under `src/` only so the unit lane collects the spec beside it, and it is listed in
 * `tsconfig.build.json`'s `exclude` for exactly that reason — the same treatment as
 * `netcdf3-fixture.builder.ts` and `era5-fixture.builder.ts`. Nothing in `src/` outside a
 * `.spec.ts` may import it: this is a REVIEW aid, not a runtime filter. Our attribution strings
 * are compiled constants that a human reads in the diff; a runtime guard over them would be
 * theatre.
 *
 * ## Why it is shared (review #84 cf-1, and its Atlas follow-up)
 * Marine (M5) and air-quality (A2b) each grew their own copy, spec-private and therefore
 * un-importable. The A2b review measured both and found EACH catching what the other missed:
 * M5 caught `official ECMWF data`, `ECMWF-approved`, `sponsored by ECMWF` (`sponsored` was absent
 * from A2b entirely) while A2b caught `an ECMWF endorsement`, `the EU endorses this platform`,
 * `officially European data` (all three missed by M5). The fix was ruled to be a UNION, not an
 * adoption of either — and a union kept in two hand-maintained copies is a drift waiting to
 * happen, since the copies had ALREADY diverged by the time anyone measured them. So the union
 * lives here, once, and both legs import it.
 *
 * ## What it is honest about
 * A DENYLIST of phrasings we have seen or been warned about — NOT a proof of non-endorsement.
 * `catches every phrasing` is not the claim, and has never been the claim; a novel wording still
 * needs a human reading the diff. Three of this guard's revisions shipped a comment that promised
 * more precision than the code had (review #83 I2c, its round 3, then #84 cf-1), which is why the
 * limits are PINNED as behaviour in the spec beside this file rather than described in prose.
 */

/**
 * Turkish-aware folding, applied to a string BEFORE the denylist runs.
 *
 * JavaScript's `/i` flag does not fold the Turkish dotted/dotless i (review #83 I2c): the
 * ECMAScript canonicalizer refuses any mapping that moves a non-ASCII character into ASCII, so
 * `ı` (U+0131) never matches `I`, and `İ` (U+0130) never matches `i`. Measured consequence with
 * the old `/onaylı/i` denylist: `ECMWF Onaylı` was caught while `ECMWF ONAYLI` and `AB DESTEKLİ`
 * sailed through — i.e. the guard was blind to the one spelling a headline would use. Collapsing
 * the whole i-family (`I İ ı i Î î`) onto plain `i` closes that; the patterns below are therefore
 * written pre-folded and carry no `/i` flag.
 *
 * Over-folding is the safe direction for a denylist: it can only ever catch more phrasings, and
 * every string each leg actually serves is asserted clean in that leg's own spec.
 */
export function foldForEndorsementGuard(value: string): string {
  return value.replace(/[IİıiÎî]/g, 'i').toLowerCase();
}

/**
 * Phrasing that would claim or imply a provider or the EU endorses this platform — banned by
 * `CONVENTIONS.md` §7 (from ADS Terms of Use art. 5, NOVA first-hand).
 *
 * A STRUCTURAL guard, not a byte-pin: it asserts a property of whatever a catalogue serves, so it
 * keeps working when a licence changes and the pinned strings are legitimately updated. Four
 * properties are deliberate, and each was measured rather than reasoned about:
 *
 * - patterns run over {@link foldForEndorsementGuard} output, so Turkish casing cannot evade them;
 * - the Turkish approval family is matched at its STEM (`onayl…`), not at the adjective `onaylı`.
 *   `onaylanmıştır` and `onayladı` are the same claim in another inflection, and an adjective-only
 *   pattern read them as clean. The lookahead then exempts `onayl` followed by `a`/`an` + `ma` +
 *   anything but `k`. State that precisely, because it is NOT the same as "exempts negation" (an
 *   earlier revision of this comment claimed that, and it was measurably false): Turkish `-ma` is
 *   HOMOPHONOUS — it is both the negation morpheme and the affirmative verbal noun. The exemption
 *   therefore covers the denials it was written for (`onaylanmamıştır` / `onaylamamaktadır` /
 *   `onaylamaz` — the opposite of the banned claim, and exactly the disclaimer ADS art. 5 pushes a
 *   careful publisher towards, so a guard rejecting them would be routed around rather than fixed)
 *   AND, unavoidably, the affirmative verbal noun that shares its surface form (`onaylanması`,
 *   `onaylaması`, `onaylanma süreci`). The inner `(?!k)` recovers the infinitive, so affirmative
 *   `onaylamaktadır` still fires. This is a KNOWN, ACCEPTED limit, not an oversight: `onaylanmaya`
 *   (affirmative, should fire) and `onaylanmayan` (denial, must not) are surface-identical up to
 *   `onaylanmay`, so no regex over this stem can separate the two families. Separating them needs a
 *   morphological analyser, which is far past what a denylist over a dozen authored strings is
 *   worth;
 * - the officialness rule binds the ADJECTIVE TO ITS HEAD NOUN rather than to a provider name.
 *   `CONVENTIONS.md` §7 bans the whole `resmî X verisi` class, not only its Copernicus spelling,
 *   and the previous provider-proximity window (`copernicus[^.]{0,40}resmi`) was wrong in both
 *   directions at once: it missed `ECMWF resmî verisi`, and it flagged `Copernicus … resmî lisans
 *   metni` (a licence TITLE) and `Copernicus tarafından resmi olarak yayımlanmamıştır` (a DENIAL).
 *   `resmî`/`official` followed within ONE token by a data noun is the claim itself. One token is
 *   what the phrasings the brief lists need (`resmî Copernicus verisi`, `official ECMWF data`) and
 *   is the widest window that still leaves `resmî lisansı bu veriyi kapsar` alone — both directions
 *   are asserted in the spec. The `[^.]{0,40}` window is gone with it, and with it the old
 *   docblock's claim that the window "stops at a sentence break": a negated character class stops
 *   at a period only, and would have spanned `;`, `!`, `?` and newlines — which the served ECMWF
 *   `explanationTr`, with its semicolon, actually contains.
 *   The one-token window's cost is a small CLASS, not a lone curiosity, and the class's most likely
 *   member is generated by this repo's own `providerName` — `E.U. Copernicus Marine Service` is
 *   four tokens. Measured, the class is bounded to ONE word order: the adjective placed BEFORE a
 *   multi-token name escapes (`resmî Copernicus Marine Service verisi`), while the natural Turkish
 *   order — the name first, the adjective on its head noun — is caught (`Copernicus Marine Service
 *   resmî verisi` fires). Widening to three tokens was measured and REJECTED: it turns `Copernicus
 *   resmî lisansı bu veriyi kapsar` into a false positive, i.e. it buys the rarer word order at the
 *   price of the licence-clause phrasing this repo actually writes;
 * - the English families are matched at their STEMS where a stem exists. `/endorse/` covers
 *   endorse/endorses/endorsed/endorsement in one — M5's narrower `/endorsed/` was blind to the noun
 *   form, which is how `an ECMWF endorsement` escaped it (review #84 cf-1).
 */
export const ENDORSEMENT_PATTERNS: readonly RegExp[] = [
  /onayl(?!an?ma(?!k))/,
  /destekli/,
  /approved/,
  /certified/,
  /endorse/,
  /sponsored/,
  /(?:resmi|official)\s+(?:\S+\s+)?(?:veri|ölçüm|kaynak|ürün|data|measurement|source)/,
  // The adverb form, which the pattern above cannot reach: `officially European data`.
  /official(?:ly)?\s+(?:eu|european)/,
];

/** `true` when the folded value matches any banned phrasing — the one seam every caller uses. */
export function isEndorsementClaim(value: string): boolean {
  const folded = foldForEndorsementGuard(value);
  return ENDORSEMENT_PATTERNS.some((pattern) => pattern.test(folded));
}
