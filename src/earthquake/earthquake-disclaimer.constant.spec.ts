import { describe, expect, it } from '@jest/globals';
import { isEndorsementClaim } from '../common/attribution/endorsement-guard';
import { EARTHQUAKE_DISCLAIMER_TR } from './earthquake-disclaimer.constant';

/**
 * Byte-for-byte pins on the owner-ruled early-warning disclaimer.
 *
 * ## Why a literal lives in this test, when the house rule forbids fact literals
 * `CONVENTIONS.md` §2 says tests assert structure, never facts. Licence, regulation and LIABILITY
 * text is the ONE recorded exception (the `earthquake-attribution.constant.spec.ts`,
 * `marine-attribution-catalogue.spec.ts` and `air-quality-attribution.constant.spec.ts`
 * precedent): a mandated verbatim string is not a claim ABOUT the world that a separate
 * fact-check owns — it IS the artifact under test. One changed word here reopens an owner
 * decision (`DEC 2026-08-19l`) about how the platform describes its own liability, and no
 * structural assertion can see that.
 *
 * Source of the accepted text: `DEC 2026-08-19l`, which locks it verbatim; SPEC §10 carries the
 * identical draft.
 */
describe('the earthquake early-warning disclaimer', () => {
  it('pins the ruled text byte-for-byte', () => {
    expect(EARTHQUAKE_DISCLAIMER_TR).toBe(
      "Bu sayfa, AFAD'ın yayımladığı gerçekleşmiş deprem kayıtlarını gösterir. " +
        'Erken uyarı sistemi değildir; gelecek depremler hakkında bilgi vermez.',
    );
  });

  /**
   * The apostrophe asserted as a CODE POINT, separately from the whole-string pin above.
   *
   * A typographic `’` (U+2019) for the ASCII `'` (U+0027) leaves every other byte of a
   * 142-character string correct, and the two are indistinguishable in most terminals and diffs —
   * the substitution an editor, a paste through a "smart punctuation" filter, or a spec written
   * from memory makes without anyone seeing it. This is the same trap the attribution notice's
   * EN DASH assertion exists for, and it is asserted the same way: by naming the failure instead
   * of printing two strings that look identical.
   */
  it("writes AFAD'ın with the ASCII apostrophe U+0027, never a typographic one", () => {
    expect(EARTHQUAKE_DISCLAIMER_TR).toContain("AFAD'ın");
    expect(EARTHQUAKE_DISCLAIMER_TR).not.toContain('’');
    expect(EARTHQUAKE_DISCLAIMER_TR.split("'")).toHaveLength(2);
  });

  /**
   * The seam between the two source segments, asserted on its own.
   *
   * The constant is written as two concatenated literals for line width, and the failure that
   * idiom actually produces is a dropped or doubled space at the join (the PR #43 bug class). The
   * whole-string pin above would catch it — this case exists so that when it does, the message
   * says WHICH seam rather than diffing 142 characters.
   */
  it('joins its two sentences with exactly one space', () => {
    expect(EARTHQUAKE_DISCLAIMER_TR).toContain('gösterir. Erken');
    expect(EARTHQUAKE_DISCLAIMER_TR).not.toMatch(/ {2}/);
    expect(EARTHQUAKE_DISCLAIMER_TR.trim()).toBe(EARTHQUAKE_DISCLAIMER_TR);
  });

  /**
   * `CONTENT-STYLE.md` §22's ceiling for this class, checked as a shape rather than trusted.
   *
   * Two sentences is the cap the ruling was written against. A third one arriving later would be
   * a §22 violation on an untouchable string, which is exactly the change that should not be able
   * to land quietly.
   */
  it('stays within the two-sentence ceiling for an untouchable note', () => {
    const sentences = EARTHQUAKE_DISCLAIMER_TR.split('.').filter((part) => part.trim() !== '');
    expect(sentences).toHaveLength(2);
  });

  /**
   * The structural half of SPEC §9.2: the note must DENY early warning, and it must not smuggle a
   * forward-looking word back in through the very sentence that bans them.
   */
  it('carries the early-warning denial and no future-tense claim', () => {
    expect(EARTHQUAKE_DISCLAIMER_TR).toContain('Erken uyarı sistemi değildir');
    expect(EARTHQUAKE_DISCLAIMER_TR).not.toMatch(/tahmin|olasılık|beklenen|risk|uyarı seviyesi/i);
  });

  /** `CONVENTIONS.md` §7 — known endorsement phrasings, over the string actually served. */
  it('matches no known endorsement phrasing', () => {
    expect(isEndorsementClaim(EARTHQUAKE_DISCLAIMER_TR)).toBe(false);
  });
});
