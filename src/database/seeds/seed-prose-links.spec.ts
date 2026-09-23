import { describe, expect, it } from '@jest/globals';
import { SEED_COUNTRIES } from './country.seed-data';
import { SEED_PROVINCES } from './province.seed-data';
import { SEED_REGIONS } from './region.seed-data';

/**
 * Seed prose carries inline markdown links (`[Ankara](/turkiye/ankara)`) that the web renders
 * as locale-aware `<Link>`s. Nothing else checks their targets, so a retired route prefix or a
 * misspelt slug ships as a live 404. Every link must point at a province page that exists.
 */
const LINK = /\]\((\/[^)]*)\)/g;

function linkTargets(value: unknown): string[] {
  return [...JSON.stringify(value).matchAll(LINK)].map((m) => m[1] ?? '');
}

describe('seed prose links', () => {
  const provincePaths = new Set(SEED_PROVINCES.map((p) => `/turkiye/${p.slugTr}`));

  it.each([
    ['regions', SEED_REGIONS],
    ['provinces', SEED_PROVINCES],
    ['countries', SEED_COUNTRIES],
  ] as const)('every link in the %s corpus targets an existing province page', (_, corpus) => {
    const broken = linkTargets(corpus).filter((href) => !provincePaths.has(href));
    expect(broken).toEqual([]);
  });
});
