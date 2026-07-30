import { describe, expect, it } from '@jest/globals';
import { Continent } from '../../common/continent.enum';
import { SEED_COUNTRIES, type CountrySeed } from './country.seed-data';
import { assertNoTurkiyeCountryRow } from './turkiye-exclusion';

/**
 * The product rule (PR #23 M5) has no database expression: a TR country row inserts cleanly and
 * fails nothing. Its only symptom is a duplicate `/dunya/turkiye` page competing with the real
 * `/turkiye` hub. So the rule is a guard, and this is the test that keeps the guard honest.
 *
 * Pure — no Postgres — so it runs in the fast `Test (unit)` job (ENGINEERING §8). The e2e suite
 * separately proves the guard actually fires inside `seedWorld` and that nothing is written.
 *
 * Fixtures use ISO private-use codes (ZX) so nothing here names a real country, matching the
 * convention `country.e2e-spec.ts` established.
 */
const CLEAN: CountrySeed = {
  isoCode: 'ZX',
  nameTr: 'Test Ülkesi ZX',
  nameEn: 'Test Country ZX',
  slugTr: 'test-ulkesi-zx',
  slugEn: 'test-country-zx',
  continent: Continent.Asia,
  neighborIsoCodes: [],
};

describe('assertNoTurkiyeCountryRow', () => {
  it('accepts an ordinary batch, and an empty one', () => {
    expect(() => assertNoTurkiyeCountryRow([CLEAN])).not.toThrow();
    expect(() => assertNoTurkiyeCountryRow([])).not.toThrow();
  });

  it('REFUSES the alpha-2 identity, however it is cased or padded', () => {
    for (const isoCode of ['TR', 'tr', ' TR ']) {
      expect(() => assertNoTurkiyeCountryRow([{ ...CLEAN, isoCode }])).toThrow(/identifies as/);
    }
  });

  it('REFUSES the alpha-3 identity — the same row in the other ISO alphabet', () => {
    expect(() => assertNoTurkiyeCountryRow([{ ...CLEAN, isoCodeAlpha3: 'TUR' }])).toThrow(
      /identifies as/,
    );
  });

  it('REFUSES the routing keys — the slug IS the duplicate page', () => {
    // The vector that actually produces `/dunya/turkiye`. A row could carry any ISO code at all
    // and still generate the colliding path, so the slugs are checked independently of identity.
    expect(() => assertNoTurkiyeCountryRow([{ ...CLEAN, slugTr: 'turkiye' }])).toThrow(/slugTr/);
    expect(() => assertNoTurkiyeCountryRow([{ ...CLEAN, slugEn: 'turkey' }])).toThrow(/slugEn/);
    expect(() => assertNoTurkiyeCountryRow([{ ...CLEAN, slugEn: 'TURKIYE' }])).toThrow(/slugEn/);
  });

  it('names the offending row in the message, so the fix is obvious', () => {
    expect(() => assertNoTurkiyeCountryRow([CLEAN, { ...CLEAN, isoCode: 'TR' }])).toThrow(
      /isoCode "TR"/,
    );
  });

  it('leaves display names alone — they are neither identity nor routing', () => {
    // Deliberate scope: a row NAMED Türkiye but carrying another country's ISO code and slug is a
    // fact-check failure, not the IA collision this guard exists for. Widening the guard would put
    // a content check inside a routing rule.
    expect(() =>
      assertNoTurkiyeCountryRow([{ ...CLEAN, nameTr: 'Türkiye', nameEn: 'Türkiye' }]),
    ).not.toThrow();
  });

  it('the COMMITTED corpus carries no Türkiye row', () => {
    // The structural invariant over the real seed. It is the assertion that would fire the day
    // someone appends TR to a continent file during a routine content wave.
    expect(() => assertNoTurkiyeCountryRow(SEED_COUNTRIES)).not.toThrow();
  });
});
