import { describe, expect, it } from '@jest/globals';
import { isEndorsementClaim } from '../common/attribution/endorsement-guard';
import {
  AFAD_PROVIDER_NAME,
  AFAD_REQUIRED_NOTICE_TR,
  buildEarthquakeAttributions,
} from './earthquake-attribution.constant';

/** Every string this module actually publishes. */
function servedStrings(): string[] {
  return buildEarthquakeAttributions()
    .flatMap((attribution) => Object.values(attribution))
    .filter((value): value is string => typeof value === 'string');
}

/**
 * Byte-for-byte pins on the AFAD attribution strings — all of them.
 *
 * ## Why literals live in THIS test, when the house rule forbids fact literals
 * `CONVENTIONS.md` §2's rule is "tests assert structure and invariants, never facts". Licence and
 * regulation text is the ONE recorded exception (the `marine-attribution-catalogue.spec.ts` and
 * `air-quality-attribution.constant.spec.ts` precedent): a mandated verbatim string is not a claim
 * ABOUT the world that a separate fact-check owns — it IS the artifact under test. One changed
 * letter breaches TDVMS Yönetmeliği m.9/4, and no structural assertion can see that.
 *
 * The exception is narrow: it covers licence/regulation-mandated verbatim strings and nothing
 * else. Do not cite it to hardcode a magnitude, a depth or any other measured number.
 *
 * Source of the accepted text: `provenance/integrations.md`, row "AFAD TDVMS earthquakes"
 * (DEC 2026-07-30j).
 */
describe('AFAD attribution strings', () => {
  it('pins EVERY served string byte-for-byte', () => {
    expect(buildEarthquakeAttributions()).toEqual([
      {
        providerId: 'afad',
        providerName: 'T.C. İçişleri Bakanlığı AFAD',
        requiredNoticeTr:
          'Kaynak: T.C. İçişleri Bakanlığı AFAD – Türkiye Deprem Veri Merkezi Sistemi (TDVMS)',
        regulationReference: 'TDVMS Yönetmeliği, RG 28.08.2015/29459, m.9/4',
        licenceUrl: null,
      },
    ]);
  });

  /**
   * The separator asserted as a CODE POINT, separately from the whole-string pin above.
   *
   * A hyphen-minus (U+002D) for the ledger's EN DASH (U+2013) leaves every other byte of an
   * 82-character string correct — the kind of substitution an editor, a paste through a
   * "smart punctuation" filter, or a spec written from memory makes without anyone seeing it.
   * Asserting the code point names the failure instead of reporting a diff of two strings that
   * look identical in a terminal.
   */
  it('separates institution from system with U+2013 EN DASH, never a hyphen', () => {
    expect(AFAD_REQUIRED_NOTICE_TR).toContain('–');
    expect(AFAD_REQUIRED_NOTICE_TR).not.toContain('-');
    expect(AFAD_REQUIRED_NOTICE_TR.split('–')).toHaveLength(2);
  });

  /**
   * `providerName` is a CONTIGUOUS substring of the notice, not a paraphrase of it.
   *
   * The DTO carries the institution as its own field while the ledger publishes only the full
   * sentence, so this is the invariant that keeps the two from drifting into two different names
   * for one institution.
   */
  it('keeps providerName an exact substring of the required notice', () => {
    expect(AFAD_REQUIRED_NOTICE_TR).toContain(AFAD_PROVIDER_NAME);
  });

  /** `CONVENTIONS.md` §7 — known endorsement phrasings, over every string actually served. */
  it('serves no string matching a known endorsement phrasing', () => {
    const served = servedStrings();
    expect(served.length).toBeGreaterThan(0);
    for (const value of served) {
      expect(isEndorsementClaim(value)).toBe(false);
    }
  });

  /**
   * A fresh array and fresh objects per call — the payload is handed to the serializer, and a
   * shared instance would make a consumer's mutation a cross-request bug.
   */
  it('returns a fresh array and fresh objects on every call', () => {
    const first = buildEarthquakeAttributions();
    const second = buildEarthquakeAttributions();
    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
    expect(first).toEqual(second);
  });
});
