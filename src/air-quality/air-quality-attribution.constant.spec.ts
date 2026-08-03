import { describe, expect, it } from '@jest/globals';
import { isEndorsementClaim } from '../common/attribution/endorsement-guard';
import {
  buildCamsAttribution,
  buildCamsAttributionText,
  CAMS_ATTRIBUTION_TEXT_PREFIX,
  CAMS_DISCLAIMER_TEXT,
  CAMS_NOTICE_KEYS,
} from './air-quality-attribution.constant';

/** Every string this module actually publishes. */
function servedStrings(): string[] {
  return Object.values(buildCamsAttribution(2026))
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === 'string');
}

/**
 * Byte-for-byte pins on the CAMS licence strings — ALL of them.
 *
 * ## Why literals live in THIS test, when the house rule forbids fact literals
 * `CONVENTIONS.md` §2's rule is "tests assert structure and invariants, never facts". These
 * strings are the ONE recorded exception (the W2a / M5 `marine-attribution-catalogue.spec.ts`
 * precedent): a licence-mandated verbatim string is not a claim ABOUT the world that a separate
 * fact-check owns — it IS the artifact under test. One changed letter is a licence-condition
 * breach, and no structural assertion can see that. The accepted text is therefore embedded here
 * as a literal and compared with `toBe` / `toEqual`.
 *
 * The exception is narrow: it covers licence-mandated verbatim strings and nothing else. Do not
 * cite it to hardcode a concentration, a population or any other measured number.
 *
 * ## The whole object, not a sample (review #84, validator MISSED_ISSUE)
 * An earlier revision of this docblock claimed byte-pins on "the CAMS licence strings" while
 * pinning 2 of the 7. `CAMS_LICENCE_URL` in particular was pinned NOWHERE in the repo: the e2e
 * asserts only `attributionText`/`disclaimerText`/`noticeKeys`, and `openapi.json` carries the DTO
 * EXAMPLE rather than the constant, so `openapi:check` cannot see the constant drift. A typo of
 * `by/4.0/` → `by/3.0/` would have shipped green on every response while CC-BY-4.0 §3(a) requires
 * this licence's URI. The pin below is now `toEqual` over the entire served object, so no field
 * can change without a test changing with it.
 *
 * Accepted text: `Owner's Inbox/atif-dogrulama/brief.md` §3.2, ruled by DEC 2026-08-02c-1 —
 * lowercase `information`.
 */
describe('CAMS attribution strings', () => {
  it('pins EVERY served licence string byte-for-byte', () => {
    expect(buildCamsAttribution(2026)).toEqual({
      providerName: 'Copernicus Atmosphere Monitoring Service (CAMS)',
      productName: 'CAMS European air quality forecasts',
      datasetUrl: 'https://ads.atmosphere.copernicus.eu/datasets/cams-europe-air-quality-forecasts',
      licenceName: 'Creative Commons Attribution 4.0 International (CC-BY-4.0)',
      licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      attributionText:
        'Contains modified Copernicus Atmosphere Monitoring Service information 2026',
      disclaimerText:
        'Neither the European Commission nor ECMWF is responsible for any use that may be made ' +
        'of the Copernicus information or data it contains.',
      noticeKeys: [
        'airQuality.notice.modelOutput',
        'airQuality.notice.gridResolution',
        'airQuality.notice.categoryTranslation',
      ],
    });
  });

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
    // The guard itself — its patterns, its two corpora and its pinned known limits — lives at
    // `src/common/attribution/endorsement-guard.ts`. It used to be duplicated here and in
    // `marine-attribution-catalogue.spec.ts`, which is the structural reason review #84 cf-1
    // happened: the copies drifted, each blind to what the other caught. What stays here is the
    // only part that is air-quality's: the strings THIS module serves.
    expect(servedStrings().length).toBeGreaterThan(0);
    for (const value of servedStrings()) {
      expect(`${value} → ${String(isEndorsementClaim(value))}`).toBe(`${value} → false`);
    }
  });
});
