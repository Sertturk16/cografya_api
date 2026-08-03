import { describe, expect, it } from '@jest/globals';
import { isEndorsementClaim } from './endorsement-guard';

/**
 * The guard's OWN test, in BOTH directions plus its known limits.
 *
 * A denylist that quietly matches nothing passes every served-strings property forever (marine
 * review #83 I2c found one doing exactly that), and a denylist that matches everything gets routed
 * around instead of fixed. Neither failure is visible from the served strings alone, so each
 * direction gets its own corpus here.
 *
 * ## This corpus is a UNION of the marine and air-quality corpora
 * Both legs kept their own copy of the guard and their own corpus; the copies had already drifted
 * when review #84 cf-1 measured them (see the module docblock). Merging the corpora with the
 * patterns is the point: a phrasing one leg had learned about could not protect the other while
 * they lived apart. Each leg keeps ONLY its "every string I actually serve is clean" assertion,
 * where it belongs — beside the strings.
 */
describe('the endorsement guard', () => {
  /**
   * Phrasings that MUST fire. Every English row was measured missing from one of the two original
   * guards by review #84's cf-1 validator; every Turkish row was measured missing from marine's
   * pre-#83 guard.
   */
  const banned = [
    // ── English: the classes the air-quality module can actually publish, since it serves
    // English exclusively.
    'official ECMWF data',
    'official source',
    'ECMWF-approved',
    'Approved product of ECMWF',
    'approved by ECMWF',
    'sponsored by ECMWF',
    'EU-sponsored',
    'officially European data',
    'certified by CAMS',
    'certified by ECMWF',
    // The noun and verb forms of `endorse`, which marine's narrower `/endorsed/` missed.
    'an ECMWF endorsement',
    'the EU endorses this platform',
    'endorsed by the European Union',
    // ── Turkish, with the casing JavaScript's `/i` flag cannot fold (U+0131 / U+0130).
    'ECMWF onaylı veri',
    'ECMWF ONAYLI',
    'ECMWF Onaylı',
    'Copernicus onaylı veri',
    'CAMS ONAYLI',
    'AB destekli',
    'AB DESTEKLİ',
    'Avrupa Birliği destekli',
    // The verb family an adjective-only pattern missed: the same claim, other inflections.
    'ECMWF tarafından onaylanmıştır',
    'onaylanmıştır',
    'Copernicus onayladı',
    // Affirmative `-makta-`, one letter away from the negated `-mamakta-` the guard exempts.
    'ECMWF onaylamaktadır',
    'ECMWF tarafından onaylanmaktadır',
    // The officialness class §7 actually bans, beyond its Copernicus spelling.
    'resmî Copernicus verisi',
    'Copernicus resmî ölçümü',
    'Copernicus resmi ölçümü',
    'RESMÎ COPERNICUS VERİSİ',
    'ECMWF resmî verisi',
    'Copernicus Marine Service resmî verisi',
    'resmî veri kaynağı',
  ];

  it.each(banned)('flags %s', (phrase) => {
    expect(isEndorsementClaim(phrase)).toBe(true);
  });

  /**
   * The other direction, and the reason the widening is not simply `/onayl/` + `/resmi/`.
   *
   * Every entry is text we may legitimately publish — a DENIAL of endorsement, a licence TITLE, or
   * a provider-mandated notice. The first rows were measured false positives of earlier pattern
   * sets. A guard that rejects our own disclaimers gets routed around rather than fixed, which is
   * the failure mode this corpus exists to prevent.
   */
  const allowed = [
    'Bu veri Copernicus tarafından resmi olarak yayımlanmamıştır.',
    'Copernicus Marine Service (CMEMS) resmî lisans metni bu sayfada yayımlanır.',
    'Copernicus Marine Service resmî lisans sayfası',
    'Copernicus resmî lisansı bu veriyi kapsar',
    'Copernicus resmî lisans metni',
    'resmî lisansı bu veriyi kapsar',
    'Bu platform ECMWF tarafından onaylanmamıştır.',
    'Copernicus tarafından onaylanmamıştır',
    'ECMWF bu servisi onaylamamaktadır.',
    'ECMWF bu platformu onaylamamaktadır',
    'ECMWF bu platformu onaylamaz.',
    'Bu platform hiçbir kurum tarafından onaylanmamıştır',
    'Contains modified Copernicus Atmosphere Monitoring Service information 2026',
    'Neither the European Commission nor ECMWF is responsible for any use that may be made of the Copernicus information or data it contains.',
    'Değiştirilmiş Copernicus Atmosphere Monitoring Service bilgisi içerir 2026. Ne Avrupa Komisyonu ne de ECMWF, içerdiği Copernicus bilgi veya verisinin yapılabilecek herhangi bir kullanımından sorumludur.',
    'Copernicus, Avrupa Birliği tarafından desteklenen bir Dünya gözlem programıdır.',
  ];

  it.each(allowed)('leaves %s alone', (phrase) => {
    expect(isEndorsementClaim(phrase)).toBe(false);
  });

  /**
   * The guard's KNOWN LIMITS, pinned as behaviour rather than described in prose.
   *
   * Every entry below is a phrase the guard handles imperfectly, and every one is an ACCEPTED cost
   * recorded in the module docblock — none is a defect list waiting to be worked off. They are
   * pinned for one reason: this guard has shipped several comments that claimed more precision than
   * the code had. A prose limit drifts silently; an asserted one cannot. If a future revision closes
   * one of these, THIS BLOCK GOES RED and forces the docblock to be corrected with it.
   *
   * `caught: false` = the phrase escapes the denylist. `caught: true` = it fires when ideally it
   * would not.
   */
  const knownLimits: readonly { phrase: string; caught: boolean; why: string }[] = [
    // Turkish `-ma` is homophonous: negation AND the affirmative verbal noun. The exemption that
    // protects our denials necessarily lets the verbal noun through. `onaylanmaya` (affirmative)
    // and `onaylanmayan` (denial) are surface-identical up to `onaylanmay`, so a regex cannot split
    // the families — only a morphological analyser could.
    { phrase: 'ECMWF tarafından onaylanması', caught: false, why: '-ma verbal noun' },
    { phrase: 'onaylanmasıyla', caught: false, why: '-ma verbal noun' },
    { phrase: 'ECMWF onaylaması', caught: false, why: '-ma verbal noun' },
    { phrase: 'onaylanma süreci', caught: false, why: '-ma verbal noun' },
    // The stem anchor is the VERB `onayl-`; the bare noun `onay` is a different word.
    { phrase: 'ECMWF onayı', caught: false, why: 'bare noun escapes the verb stem' },
    { phrase: 'ECMWF onay vermiştir', caught: false, why: 'bare noun escapes the verb stem' },
    // The one-token window, in the one word order it cannot reach. The natural order is caught —
    // asserted in `banned` above, not here.
    {
      phrase: 'resmî Copernicus Marine Service verisi',
      caught: false,
      why: 'adjective before a multi-token name',
    },
    // The deliberate asymmetry: Turkish denials are exempted by morphology, English ones are not.
    // English negates with a separate word (`not approved`, `never endorsed`, `no approval from`)
    // or a prefix (`unapproved`), so there is no single morpheme to subtract — only a growing list
    // of lookbehinds, each of which would punch a real hole in the affirmative patterns. Nothing
    // served hits this, and the failure direction is the safe one: an author adding an English
    // no-endorsement disclaimer gets a red test and must widen the guard DELIBERATELY, with a
    // measured row in `allowed` — which is the outcome we want anyway. Contorting `/approved/` and
    // `/endorse/` to guess at negation is not.
    {
      phrase: 'not approved by ECMWF',
      caught: true,
      why: 'English denial, no morpheme to subtract',
    },
    { phrase: 'unapproved', caught: true, why: 'English denial, no morpheme to subtract' },
    {
      phrase: 'this platform is not endorsed by ECMWF',
      caught: true,
      why: 'English denial, no morpheme to subtract',
    },
  ];

  it.each(knownLimits)('known limit ($why): $phrase', ({ phrase, caught }) => {
    expect(isEndorsementClaim(phrase)).toBe(caught);
  });
});
