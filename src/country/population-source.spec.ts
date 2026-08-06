import { describe, expect, it } from '@jest/globals';
import {
  DEFAULT_POPULATION_SOURCE_NAME,
  resolvePopulationSourceName,
  type PopulationSourceRow,
} from './population-source';

/**
 * Pure unit tests — no database, no real country. Every fixture below is synthetic
 * (CONVENTIONS §4: tests check structure, never fact-check a country/source pairing).
 */
const WITH_OVERRIDE: PopulationSourceRow = {
  population: 1_000,
  populationSourceNameTr: 'Test Kurumu',
  populationSourceNameEn: 'Test Institute',
};

const WITHOUT_OVERRIDE: PopulationSourceRow = {
  population: 1_000,
  populationSourceNameTr: null,
  populationSourceNameEn: null,
};

const NO_POPULATION: PopulationSourceRow = {
  population: null,
  populationSourceNameTr: null,
  populationSourceNameEn: null,
};

/**
 * Malformed pairs — the row-level guard (rule 10a) refuses these on the write path, but this
 * resolver must defend itself too (PR #98 review, I1): a row reaching it did not necessarily
 * pass through the guard. Also the fixture set that makes the "always returns TR and EN
 * together" test below actually able to fail (CR98-M3) — none of `WITH_OVERRIDE` /
 * `WITHOUT_OVERRIDE` / `NO_POPULATION` can ever produce a mismatched pair, so that assertion
 * was vacuous without these.
 */
const TR_SET_EN_NULL: PopulationSourceRow = {
  population: 1_000,
  populationSourceNameTr: 'Test Kurumu',
  populationSourceNameEn: null,
};

const TR_NULL_EN_SET: PopulationSourceRow = {
  population: 1_000,
  populationSourceNameTr: null,
  populationSourceNameEn: 'Test Institute',
};

const BOTH_WHITESPACE: PopulationSourceRow = {
  population: 1_000,
  populationSourceNameTr: '   ',
  populationSourceNameEn: '   ',
};

describe('resolvePopulationSourceName', () => {
  it('returns the row override when both locales are set', () => {
    expect(resolvePopulationSourceName(WITH_OVERRIDE)).toEqual({
      tr: 'Test Kurumu',
      en: 'Test Institute',
    });
  });

  it('returns the corpus default when the row carries no override', () => {
    expect(resolvePopulationSourceName(WITHOUT_OVERRIDE)).toEqual(DEFAULT_POPULATION_SOURCE_NAME);
  });

  it('returns { tr: null, en: null } whenever population is null, even with an override set', () => {
    expect(resolvePopulationSourceName(NO_POPULATION)).toEqual({ tr: null, en: null });
    expect(
      resolvePopulationSourceName({
        ...NO_POPULATION,
        populationSourceNameTr: 'Should Not Surface',
        populationSourceNameEn: 'Should Not Surface',
      }),
    ).toEqual({ tr: null, en: null });
  });

  it('falls back to the corpus default when only ONE locale carries an override (malformed pair)', () => {
    // The resolver must not trust `populationSourceNameTr !== null` alone (the pre-fix defect):
    // that admitted TR-set/EN-null rows publishing `en: null` beside a non-null `population`
    // (breaking the DTO's "null IFF population is null" promise), and silently discarded a real
    // EN-set institution name on TR-null/EN-set rows.
    expect(resolvePopulationSourceName(TR_SET_EN_NULL)).toEqual(DEFAULT_POPULATION_SOURCE_NAME);
    expect(resolvePopulationSourceName(TR_NULL_EN_SET)).toEqual(DEFAULT_POPULATION_SOURCE_NAME);
  });

  it('falls back to the corpus default when both locales are whitespace-only', () => {
    // Reachable through the sanctioned seed path today (rule 10a reads two whitespace strings
    // as symmetric, so it does not fire) — the resolver is the last line of defence against
    // publishing `"   "` as the credit line.
    expect(resolvePopulationSourceName(BOTH_WHITESPACE)).toEqual(DEFAULT_POPULATION_SOURCE_NAME);
  });

  it('always returns TR and EN together (never one null and the other set)', () => {
    for (const row of [
      WITH_OVERRIDE,
      WITHOUT_OVERRIDE,
      NO_POPULATION,
      TR_SET_EN_NULL,
      TR_NULL_EN_SET,
      BOTH_WHITESPACE,
    ]) {
      const resolved = resolvePopulationSourceName(row);
      expect(resolved.tr === null).toBe(resolved.en === null);
    }
  });
});
