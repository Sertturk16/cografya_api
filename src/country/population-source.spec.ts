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

describe('resolvePopulationSourceName', () => {
  it('returns the row override when populationSourceNameTr is set', () => {
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

  it('always returns TR and EN together (never one null and the other set)', () => {
    for (const row of [WITH_OVERRIDE, WITHOUT_OVERRIDE, NO_POPULATION]) {
      const resolved = resolvePopulationSourceName(row);
      expect(resolved.tr === null).toBe(resolved.en === null);
    }
  });
});
