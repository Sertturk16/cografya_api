import { describe, expect, it } from '@jest/globals';
import {
  buildCamsAttribution,
  buildCamsAttributionText,
  CAMS_ATTRIBUTION_TEXT_PREFIX,
  CAMS_DISCLAIMER_TEXT,
  CAMS_NOTICE_KEYS,
} from './air-quality-attribution.constant';

/**
 * Turkish-aware folding, applied BEFORE the endorsement denylist runs.
 *
 * JavaScript's `/i` flag does not fold the Turkish dotted/dotless i: the ECMAScript canonicalizer
 * refuses any mapping that moves a non-ASCII character into ASCII, so `ı` (U+0131) never matches
 * `I` and `İ` (U+0130) never matches `i` (marine review #83 I2c measured `ECMWF ONAYLI` sailing
 * through a `/onaylı/i` denylist — the one spelling a headline would use). Collapsing the whole
 * i-family onto plain `i` closes that, so the patterns below are written pre-folded and carry no
 * `/i` flag. Over-folding is the safe direction for a denylist: it can only catch more.
 */
function foldForEndorsementGuard(value: string): string {
  return value.replace(/[IİıiÎî]/g, 'i').toLowerCase();
}

/**
 * Phrasing that would claim or imply a provider or the EU endorses this platform — banned by
 * `CONVENTIONS.md` §7 (from ADS Terms of Use art. 5, NOVA first-hand).
 *
 * ## A UNION with M5's set, not an adoption of it (review #84 cf-1)
 * The validator measured both guards and found each catching what the other misses. M5's set
 * catches `official ECMWF data`, `ECMWF-approved`, `sponsored by ECMWF` — and `sponsored` was
 * absent from A2b's first guard entirely, which matters because this module publishes ENGLISH
 * exclusively. A2b's set catches `an ECMWF endorsement`, `the EU endorses this platform` and
 * `officially European data`, which M5 misses. "Just adopt M5's" would therefore have traded one
 * blind spot for another; the union below has neither, and both directions are measured in the
 * corpus at the bottom of this file rather than reasoned about.
 *
 * ## The duplication is deliberate, and it is a known debt
 * `ENDORSEMENT_PATTERNS` and `foldForEndorsementGuard` also live in
 * `src/marine/marine-attribution-catalogue.spec.ts`. They are spec-private there (no `export`, in
 * a file excluded from `tsconfig.build.json`), so importing them is impossible without moving them
 * into shared code — a `dev` refactor that touches marine's gate and is out of this PR's range.
 * Copied deliberately, recorded here, and handed to Atlas as a follow-up so the two copies do not
 * drift in silence.
 *
 * Honest about its limits: this is a denylist of known phrasings, not a proof of non-endorsement.
 * `catches every phrasing` is not the claim — a novel wording still needs a human reading the diff.
 */
const ENDORSEMENT_PATTERNS: readonly RegExp[] = [
  // The Turkish approval family at its STEM. The lookahead exempts `onayl` + `a`/`an` + `ma` +
  // anything but `k`, which covers the denials (`onaylanmamıştır`, `onaylamamaktadır`) and,
  // unavoidably, the homophonous affirmative verbal noun; the inner `(?!k)` recovers the
  // infinitive so `onaylamaktadır` still fires. Reproduced from M5 with its reasoning intact.
  /onayl(?!an?ma(?!k))/,
  /destekli/,
  /approved/,
  /certified/,
  // A STEM, not `endorsed`: covers endorse/endorses/endorsed/endorsement in one.
  /endorse/,
  /sponsored/,
  // `resmî`/`official` followed within ONE token by a data noun is the claim itself; the one-token
  // window is the widest that still leaves `resmî lisansı bu veriyi kapsar` (a licence clause,
  // not a claim) alone.
  /(?:resmi|official)\s+(?:\S+\s+)?(?:veri|ölçüm|kaynak|ürün|data|measurement|source)/,
  // The adverb form, which the pattern above cannot reach: `officially European data`.
  /official(?:ly)?\s+(?:eu|european)/,
];

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
    expect(servedStrings().length).toBeGreaterThan(0);
    for (const value of servedStrings()) {
      for (const pattern of ENDORSEMENT_PATTERNS) {
        expect(foldForEndorsementGuard(value)).not.toMatch(pattern);
      }
    }
  });
});

/**
 * The guard's OWN test, in BOTH directions.
 *
 * A denylist that quietly matches nothing passes the served-strings property above forever (marine
 * review #83 I2c found one doing exactly that), and a denylist that matches everything gets routed
 * around instead of fixed. Neither failure is visible from the served strings alone, so each
 * direction gets its own corpus here. The banned corpus is exactly the set review #84's cf-1
 * validator measured this module's first guard MISSING, plus the denials it wrongly caught.
 */
describe('the endorsement guard itself', () => {
  const banned = [
    // English — the six misses the validator reproduced. This module publishes English only, so
    // these are the classes that actually matter here.
    'official ECMWF data',
    'official source',
    'ECMWF-approved',
    'Approved product of ECMWF',
    'sponsored by ECMWF',
    'EU-sponsored',
    'officially European data',
    'certified by CAMS',
    // …and the two the A2b guard caught that M5's set does not, which is why this is a UNION and
    // not an adoption.
    'an ECMWF endorsement',
    'the EU endorses this platform',
    // Turkish, with the casing JavaScript's /i flag cannot fold.
    'Copernicus onaylı veri',
    'CAMS ONAYLI',
    'AB destekli',
    'AB DESTEKLİ',
    'resmî Copernicus verisi',
  ];

  const allowed = [
    // DENIALS are the opposite of the banned claim — and are exactly what ADS ToS art. 5 pushes a
    // careful publisher towards. A guard that rejected them would be routed around, not fixed.
    'Copernicus tarafından onaylanmamıştır',
    'ECMWF bu platformu onaylamamaktadır',
    'Bu platform hiçbir kurum tarafından onaylanmamıştır',
    // A licence TITLE is not an endorsement claim.
    'Copernicus resmî lisans metni',
    'resmî lisansı bu veriyi kapsar',
  ];

  function fires(value: string): boolean {
    const folded = foldForEndorsementGuard(value);
    return ENDORSEMENT_PATTERNS.some((pattern) => pattern.test(folded));
  }

  it('fires on every known endorsement phrasing', () => {
    for (const value of banned) {
      expect(`${value} → ${String(fires(value))}`).toBe(`${value} → true`);
    }
  });

  it('stays silent on denials and licence titles', () => {
    for (const value of allowed) {
      expect(`${value} → ${String(fires(value))}`).toBe(`${value} → false`);
    }
  });
});
