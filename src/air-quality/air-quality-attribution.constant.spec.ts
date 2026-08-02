import { describe, expect, it } from '@jest/globals';
import {
  buildCamsAttribution,
  buildCamsAttributionText,
  CAMS_ATTRIBUTION_TEXT_PREFIX,
  CAMS_DISCLAIMER_TEXT,
  CAMS_NOTICE_KEYS,
} from './air-quality-attribution.constant';

/**
 * Byte-for-byte pins on the CAMS licence strings.
 *
 * ## Why literals live in THIS test, when the house rule forbids fact literals
 * `CONVENTIONS.md` §2's rule is "tests assert structure and invariants, never facts". These two
 * sentences are the ONE recorded exception (the W2a / M5 `marine-attribution-catalogue.spec.ts`
 * precedent): a licence-mandated verbatim string is not a claim ABOUT the world that a separate
 * fact-check owns — it IS the artifact under test. One changed letter is a licence-condition
 * breach, and no structural assertion can see that. The accepted text is therefore embedded here
 * as a literal and compared with `toBe`.
 *
 * The exception is narrow: it covers licence-mandated verbatim strings and nothing else. Do not
 * cite it to hardcode a concentration, a population or any other measured number.
 *
 * Accepted text: `Owner's Inbox/atif-dogrulama/brief.md` §3.2, ruled by DEC 2026-08-02c-1 —
 * lowercase `information`.
 */
describe('CAMS attribution strings', () => {
  it('pins the attribution line with a LOWERCASE "information" (DEC 2026-08-02c-1)', () => {
    expect(CAMS_ATTRIBUTION_TEXT_PREFIX).toBe(
      'Contains modified Copernicus Atmosphere Monitoring Service information',
    );
    expect(buildCamsAttributionText(2026)).toBe(
      'Contains modified Copernicus Atmosphere Monitoring Service information 2026',
    );
  });

  it('never publishes the capital-I spelling A1 shipped', () => {
    // The exact defect gate item 2 exists for: a re-introduced capital would pass every
    // structural check while breaking the licensor's own template.
    expect(CAMS_ATTRIBUTION_TEXT_PREFIX).not.toContain('Service Information');
  });

  it('pins the disclaimer verbatim', () => {
    expect(CAMS_DISCLAIMER_TEXT).toBe(
      'Neither the European Commission nor ECMWF is responsible for any use that may be made ' +
        'of the Copernicus information or data it contains.',
    );
  });

  it('renders the data year the caller supplies, never a hidden clock', () => {
    expect(buildCamsAttributionText(1999)).toContain(' 1999');
    expect(buildCamsAttributionText(2100)).toContain(' 2100');
  });

  it('publishes i18n KEYS only — no authored prose leaks into the notice list', () => {
    expect(CAMS_NOTICE_KEYS.length).toBeGreaterThan(0);
    for (const key of CAMS_NOTICE_KEYS) {
      // A key, not a sentence: dotted lowerCamel segments, no spaces.
      expect(key).toMatch(/^[a-zA-Z]+(?:\.[a-zA-Z0-9]+)+$/);
      expect(key.startsWith('airQuality.notice.')).toBe(true);
    }
  });

  it('hands every response its own noticeKeys array (no shared mutable state)', () => {
    const first = buildCamsAttribution(2026);
    const second = buildCamsAttribution(2026);
    expect(first.noticeKeys).not.toBe(second.noticeKeys);
    expect(first.noticeKeys).toEqual(second.noticeKeys);
  });

  it('carries NO endorsement claim in any served string (CONVENTIONS §7 / DEC 2026-08-02c-3)', () => {
    const attribution = buildCamsAttribution(2026);
    const served = Object.values(attribution)
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((value): value is string => typeof value === 'string');
    expect(served.length).toBeGreaterThan(0);
    // Structural guard, not a fact check: any wording that could read as the provider or the EU
    // endorsing/approving/certifying this platform.
    const endorsement = /endorse|approved by|official(?:ly)? (?:eu|european)|certified|onayl/i;
    for (const value of served) {
      expect(value).not.toMatch(endorsement);
    }
  });
});
