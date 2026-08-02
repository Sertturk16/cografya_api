import { describe, expect, it } from '@jest/globals';
import {
  MARINE_ATTRIBUTIONS,
  buildEcmwfRequiredNotice,
  buildMarineAttributions,
} from './marine-attribution-catalogue';
import { MARINE_LAYER_CATALOGUE } from './marine-layer-catalogue';

/**
 * The served licence strings, pinned BYTE FOR BYTE — a deliberate, scoped exception to the
 * house rule that tests assert structure and never facts.
 *
 * ## Why the exception is legitimate here
 * The rule exists because a test that hardcodes a fact about the world (a temperature, a
 * population) freezes something the world is entitled to change, and turns fact-checking into
 * a CI problem. These strings are not facts about the world. They are the licence text ECMWF
 * and the Copernicus Marine Service oblige us to publish verbatim — the artifact itself, not a
 * claim about it. Shortening, restyling, reordering or translating any of them is a breach, so
 * "did any byte move" is exactly the invariant worth asserting, and nothing else can assert it:
 * every one of these could change to another perfectly-typed string and ship green.
 *
 * `cografya_web` pins the same strings on its side (W2a precedent, DEC 2026-08-02g §1). Until
 * the web switches to reading this payload (W2d), those two pins are what keep the two copies
 * from drifting. This exception covers attribution and disclaimer text ONLY — no temperature,
 * wave height or any other value is ever pinned in a test.
 *
 * ## Why the expected strings are single literals and not `+`-concatenated
 * Concatenation across lines is how PR #43 lost spaces at the joins. A byte-pin whose expected
 * value can silently lose a space is worse than no pin, so each one is one literal, however
 * long the line. Prettier leaves long string literals alone, so this stays format-stable.
 *
 * The values were transcribed mechanically from NOVA's first-hand licence reading
 * (`Owner's Inbox/atif-dogrulama/brief.md` §3.1) and the machine-verified CMEMS probe
 * artifact, never retyped by hand.
 */

/**
 * ECMWF's full required notice for data belonging to 2026 — copyright line included.
 *
 * The punctuation is the LICENCE's, not the brief's §3.1 composition: `Source www.ecmwf.int`
 * with no colon, and a period before the CC URL (review #83 I2a). Those two characters are the
 * whole reason this pin exists in the first place.
 */
const ECMWF_NOTICE_2026 =
  'Copyright © 2026 European Centre for Medium-Range Weather Forecasts (ECMWF). This service is based on data and products of the European Centre for Medium-Range Weather Forecasts (ECMWF). Source www.ecmwf.int. This ECMWF data is published under a Creative Commons Attribution 4.0 International (CC BY 4.0). https://creativecommons.org/licenses/by/4.0/. Modified: values are sampled from the source grid to selected points; no other modification.';

/** The same notice with no ingested cycle: the copyright line is OMITTED, never faked. */
const ECMWF_NOTICE_NO_YEAR =
  'This service is based on data and products of the European Centre for Medium-Range Weather Forecasts (ECMWF). Source www.ecmwf.int. This ECMWF data is published under a Creative Commons Attribution 4.0 International (CC BY 4.0). https://creativecommons.org/licenses/by/4.0/. Modified: values are sampled from the source grid to selected points; no other modification.';

const ECMWF_DISCLAIMER =
  'ECMWF does not accept any liability whatsoever for any error or omission in the data, their availability, or for any loss or damage arising from their use.';

const ECMWF_EXPLANATION_TR =
  "Bu servis, Avrupa Orta Vadeli Hava Tahminleri Merkezi'nin (ECMWF) veri ve ürünlerine dayanmaktadır. Kaynak: www.ecmwf.int. Veri, Creative Commons Attribution 4.0 International (CC BY 4.0) lisansıyla yayımlanmaktadır. Coğrafya tarafından yapılan değişiklik: değerler kaynak ızgaradan seçilen noktalara örneklenmiştir. ECMWF; verideki hata veya eksikliklerden, verinin erişilebilirliğinden ya da kullanımından doğabilecek hiçbir zarardan sorumluluk kabul etmez.";

const CMEMS_NOTICE = 'Generated using E.U. Copernicus Marine Service Information';

/** The English service name stays inside the Turkish sentence (brief §4.3 — review #83 I2b). */
const CMEMS_EXPLANATION_TR =
  'Avrupa Birliği Copernicus Deniz Hizmeti (E.U. Copernicus Marine Service) bilgileri kullanılarak üretilmiştir.';

/**
 * Turkish-aware folding, applied to a string BEFORE the endorsement denylist runs.
 *
 * JavaScript's `/i` flag does not fold the Turkish dotted/dotless i (review #83 I2c): the
 * ECMAScript canonicalizer refuses any mapping that moves a non-ASCII character into ASCII, so
 * `ı` (U+0131) never matches `I`, and `İ` (U+0130) never matches `i`. Measured consequence with
 * the old `/onaylı/i` denylist: `ECMWF Onaylı` was caught while `ECMWF ONAYLI` and
 * `AB DESTEKLİ` sailed through — i.e. the guard was blind to the one spelling a headline would
 * use. Collapsing the whole i-family (`I İ ı i Î î`) onto plain `i` closes that; the denylist
 * below is therefore written pre-folded and needs no `/i` flag.
 *
 * Over-folding is the safe direction for a denylist: it can only ever catch more phrasings, and
 * every string this module actually serves is asserted clean below.
 */
function foldForEndorsementGuard(value: string): string {
  return value.replace(/[IİıiÎî]/g, 'i').toLowerCase();
}

/**
 * Phrasing that would claim or imply a provider or the EU endorses this platform — banned by
 * `CONVENTIONS.md` §7 (from ADS Terms of Use art. 5, NOVA first-hand).
 *
 * It is a STRUCTURAL guard, not a byte-pin: it asserts a property of whatever the catalogue
 * serves, so it keeps working when a licence changes and the pinned strings above are
 * legitimately updated. Two properties are deliberate, both from review #83 I2c:
 *
 * - patterns run over {@link foldForEndorsementGuard} output, so Turkish casing cannot evade
 *   them;
 * - the `resmî Copernicus` rule is ORDER-TOLERANT. Brief §4.3 lists `Copernicus resmî ölçümü`
 *   as banned, and a fixed two-word pattern missed exactly that. The window is bounded and
 *   stops at a sentence break, so it cannot pair two unrelated sentences.
 *
 * Being honest about its limits: this is a denylist of known phrasings, not a proof of
 * non-endorsement. It catches the wordings we have actually seen or been warned about; a novel
 * phrasing still needs a human reading the diff. `catches every phrasing` is not the claim.
 */
const ENDORSEMENT_PATTERNS: readonly RegExp[] = [
  /onayli/,
  /approved by/,
  /endorsed/,
  /sponsored/,
  /resmi[^.]{0,40}copernicus/,
  /copernicus[^.]{0,40}resmi/,
  /ab destekli/,
];

/** Every string the API actually publishes, across both copyright-year branches. */
function servedStrings(): string[] {
  return [...buildMarineAttributions(2026), ...buildMarineAttributions(null)].flatMap((row) => [
    row.providerName,
    row.licenceName,
    row.licenceUrl,
    row.requiredNoticeEn,
    row.explanationTr,
    ...(row.disclaimerEn === null ? [] : [row.disclaimerEn]),
  ]);
}

describe('MARINE_ATTRIBUTIONS', () => {
  it('publishes exactly two rows, in a stable order, keyed for the layer join', () => {
    expect(MARINE_ATTRIBUTIONS.map((row) => row.providerId)).toEqual(['ecmwf', 'cmems']);
  });

  it('resolves every layer attributionId to a row — no silent join miss', () => {
    // `MarineLayerDto.attributionId` is a plain string in the contract, so a typo there is
    // invisible to the type system and would publish a layer whose licence row cannot be found.
    const known = new Set(MARINE_ATTRIBUTIONS.map((row) => row.providerId));
    expect(known.size).toBe(MARINE_ATTRIBUTIONS.length);
    for (const layer of MARINE_LAYER_CATALOGUE) {
      expect(known.has(layer.attributionId as 'ecmwf' | 'cmems')).toBe(true);
    }
  });

  it('serves doi and productTitle as null on every row, deliberately', () => {
    for (const row of buildMarineAttributions(2026)) {
      expect(row.doi).toBeNull();
      expect(row.productTitle).toBeNull();
    }
  });
});

describe('buildEcmwfRequiredNotice', () => {
  it('states the data year verbatim when a cycle has been ingested', () => {
    expect(buildEcmwfRequiredNotice(2026)).toBe(ECMWF_NOTICE_2026);
    expect(buildEcmwfRequiredNotice(2026)).toContain('© 2026');
  });

  it('OMITS the copyright line with no cycle — and still carries the mandatory sentence', () => {
    const notice = buildEcmwfRequiredNotice(null);

    expect(notice).toBe(ECMWF_NOTICE_NO_YEAR);
    // Not "no year" — no copyright claim at all. Inventing a year would be a false statement
    // about material we are not publishing.
    expect(notice).not.toContain('Copyright');
    expect(notice).not.toContain('©');
    // The sentence ECMWF's terms call out as mandatory carries no year and must never drop.
    expect(notice).toContain(
      'This service is based on data and products of the European Centre for Medium-Range',
    );
  });

  it('changes only the year between two ingested years', () => {
    expect(buildEcmwfRequiredNotice(2027)).toBe(ECMWF_NOTICE_2026.replace('© 2026', '© 2027'));
  });
});

describe('buildMarineAttributions', () => {
  it('byte-pins the ECMWF row', () => {
    const [ecmwf] = buildMarineAttributions(2026);

    expect(ecmwf).toEqual({
      providerId: 'ecmwf',
      providerName: 'European Centre for Medium-Range Weather Forecasts (ECMWF)',
      licenceName: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
      licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      requiredNoticeEn: ECMWF_NOTICE_2026,
      disclaimerEn: ECMWF_DISCLAIMER,
      explanationTr: ECMWF_EXPLANATION_TR,
      doi: null,
      productTitle: null,
    });
  });

  it('byte-pins the CMEMS row — one sentence, and NO disclaimer', () => {
    const [, cmems] = buildMarineAttributions(2026);

    expect(cmems).toEqual({
      providerId: 'cmems',
      providerName: 'E.U. Copernicus Marine Service',
      licenceName: 'Copernicus Marine Service Commitments and Licence',
      licenceUrl: 'https://marine.copernicus.eu/user-corner/service-commitments-and-licence',
      requiredNoticeEn: CMEMS_NOTICE,
      // NULL, and this is the whole reason `disclaimerEn` was split out of the notice in M5:
      // folding ECMWF's disclaimer into the shared field would tell the reader the Copernicus
      // Marine licence imposes one too. It does not.
      disclaimerEn: null,
      explanationTr: CMEMS_EXPLANATION_TR,
      doi: null,
      productTitle: null,
    });
  });

  it('carries the English notice on every row — the Turkish text never stands alone', () => {
    for (const row of [...buildMarineAttributions(2026), ...buildMarineAttributions(null)]) {
      // The invariant the `explanationTr` rename exists to protect: a consumer rendering only
      // the Turkish field would breach the licence, so the English field is never empty and
      // never equal to the Turkish one.
      expect(row.requiredNoticeEn.length).toBeGreaterThan(0);
      expect(row.explanationTr.length).toBeGreaterThan(0);
      expect(row.explanationTr).not.toBe(row.requiredNoticeEn);
    }
  });

  it('serves BOTH rows even when nothing has been ingested (the cold response)', () => {
    // The licence notice is attached to the published section, not to whichever provider
    // happened to answer. A cold `/deniz` still renders the section, so it still carries both.
    const cold = buildMarineAttributions(null);

    expect(cold).toHaveLength(2);
    expect(cold.map((row) => row.providerId)).toEqual(['ecmwf', 'cmems']);
    for (const row of cold) expect(row.requiredNoticeEn.length).toBeGreaterThan(0);
  });

  it('claims no endorsement in any served string', () => {
    for (const value of servedStrings()) {
      for (const pattern of ENDORSEMENT_PATTERNS) {
        expect(foldForEndorsementGuard(value)).not.toMatch(pattern);
      }
    }
  });
});

/**
 * The guard's OWN test. A denylist that quietly matches nothing passes the assertion above
 * forever; review #83 I2c found it doing precisely that for uppercase Turkish and for one word
 * order the brief lists by name. These cases pin the fix.
 */
describe('the endorsement guard itself', () => {
  const banned = [
    'ECMWF onaylı veri',
    // Uppercase Turkish — the class `/onaylı/i` could not see (U+0131 never folds to ASCII I).
    'ECMWF ONAYLI',
    'ECMWF Onaylı',
    'AB destekli',
    // U+0130 on the other side of the same blind spot.
    'AB DESTEKLİ',
    'resmî Copernicus verisi',
    // Brief §4.3 lists this exact phrase; the old fixed-order pattern missed it.
    'Copernicus resmî ölçümü',
    'Copernicus resmi ölçümü',
    'RESMÎ COPERNICUS VERİSİ',
    'approved by ECMWF',
    'endorsed by the European Union',
    'sponsored by ECMWF',
  ];

  it.each(banned)('flags %s', (phrase) => {
    const folded = foldForEndorsementGuard(phrase);
    expect(ENDORSEMENT_PATTERNS.some((pattern) => pattern.test(folded))).toBe(true);
  });

  it('does not fire on the licence wording we are obliged to publish', () => {
    // The negative half: over-folding is safe only while the mandated strings stay clean, and
    // both proper names ("Copernicus Marine Service", "E.U. Copernicus Marine Service") sit in
    // served text. A guard that flagged them would be routed around, not fixed.
    for (const value of servedStrings()) {
      expect(ENDORSEMENT_PATTERNS.some((p) => p.test(foldForEndorsementGuard(value)))).toBe(false);
    }
  });
});
