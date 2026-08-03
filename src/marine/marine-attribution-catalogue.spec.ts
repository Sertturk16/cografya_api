import { describe, expect, it } from '@jest/globals';
import { isEndorsementClaim } from '../common/attribution/endorsement-guard';
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
    // The single place the property is asserted over what MARINE actually publishes. It cuts both
    // ways: over-folding and the widened patterns are safe only while the mandated strings stay
    // clean, and both proper names ("Copernicus Marine Service", "E.U. Copernicus Marine
    // Service") sit inside served text.
    //
    // The guard itself — its patterns, its two corpora and its pinned known limits — moved to
    // `src/common/attribution/endorsement-guard.ts` (review #84 cf-1 follow-up). It used to be
    // duplicated here and in the air-quality spec, and the two copies had ALREADY drifted: this
    // one was blind to `an ECMWF endorsement` and `officially European data`. What stays here is
    // the only part that is marine's: the strings marine serves.
    expect(servedStrings().length).toBeGreaterThan(0);
    for (const value of servedStrings()) {
      expect(`${value} → ${String(isEndorsementClaim(value))}`).toBe(`${value} → false`);
    }
  });
});
