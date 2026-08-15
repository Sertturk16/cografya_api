import { describe, expect, it } from '@jest/globals';
import { validateSync } from 'class-validator';
import { SEED_COUNTRIES } from '../../database/seeds/country.seed-data';
import { SEED_PROVINCES } from '../../database/seeds/province.seed-data';
import { PlateCodeParams, SlugParams } from './route-params.dto';

function slugErrors(slug: string): string[] {
  const params = new SlugParams();
  params.slug = slug;
  return validateSync(params).flatMap((error) => Object.values(error.constraints ?? {}));
}

function plateCodeErrors(plateCode: string): string[] {
  const params = new PlateCodeParams();
  params.plateCode = plateCode;
  return validateSync(params).flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('SlugParams', () => {
  it('accepts the shapes the seed produces', () => {
    expect(slugErrors('istanbul')).toEqual([]);
    expect(slugErrors('kahramanmaras')).toEqual([]);
    expect(slugErrors('bosnia-and-herzegovina')).toEqual([]);
    expect(slugErrors('turkish-republic-of-northern-cyprus')).toEqual([]);
    expect(slugErrors('cote-d-ivoire')).toEqual([]);
    expect(slugErrors('g7')).toEqual([]);
  });

  /**
   * The test this DTO exists for.
   *
   * A pattern tighter than the data does not make the API stricter, it makes a wrong PAGE: a real
   * slug that fails validation returns 400 where 404 belongs, and a crawler treats those as two
   * different answers. So the rule is checked against every slug the platform actually publishes,
   * not against a sample — and it keeps being checked, so a future seed wave cannot introduce a
   * slug this pattern would reject without turning this test red first.
   */
  it('accepts EVERY slug in the committed seeds — both languages, provinces and countries', () => {
    const seeded = [
      ...SEED_PROVINCES.flatMap((province) => [province.slugTr, province.slugEn]),
      ...SEED_COUNTRIES.flatMap((country) => [country.slugTr, country.slugEn]),
    ];

    // Guards the guard: if an import ever resolves to an empty corpus, "nothing failed" would be
    // a false green rather than a result.
    expect(seeded.length).toBeGreaterThan(500);

    const rejected = seeded.filter((slug) => slugErrors(slug).length > 0);
    expect(rejected).toEqual([]);
  });

  it('rejects the shapes a slug column can never hold', () => {
    // Not security — TypeORM parameterises the query either way (the survey says so explicitly).
    // This is boundary discipline: §3.2 forbids handing an unvalidated client string straight to
    // a lookup.
    expect(slugErrors('Istanbul')).not.toEqual([]);
    expect(slugErrors('is_tanbul')).not.toEqual([]);
    expect(slugErrors('-istanbul')).not.toEqual([]);
    expect(slugErrors('istanbul-')).not.toEqual([]);
    expect(slugErrors('istan--bul')).not.toEqual([]);
    expect(slugErrors('çorum')).not.toEqual([]);
    expect(slugErrors('istanbul/../etc')).not.toEqual([]);
    expect(slugErrors('')).not.toEqual([]);
  });

  it('bounds the lookup key well above the longest real slug', () => {
    expect(slugErrors('a'.repeat(120))).toEqual([]);
    expect(slugErrors('a'.repeat(121))).not.toEqual([]);
  });

  it('names the rule in its message, so a 400 body says what was wrong', () => {
    expect(slugErrors('NOT A SLUG')).toContain('slug must be a lowercase kebab-case identifier');
  });
});

describe('PlateCodeParams', () => {
  it('accepts EVERY plate code in the committed seeds', () => {
    const seeded = SEED_PROVINCES.map((province) => province.plateCode);
    expect(seeded.length).toBeGreaterThan(80);
    expect(seeded.filter((plateCode) => plateCodeErrors(plateCode).length > 0)).toEqual([]);
  });

  it('accepts the padded low codes and refuses their unpadded spelling', () => {
    // `6` is not a lenient spelling of `06`: the column is two characters precisely so the lexical
    // `ORDER BY plate_code` stays correct, so the unpadded form is a different key entirely.
    expect(plateCodeErrors('06')).toEqual([]);
    expect(plateCodeErrors('81')).toEqual([]);
    expect(plateCodeErrors('6')).not.toEqual([]);
    expect(plateCodeErrors('006')).not.toEqual([]);
    expect(plateCodeErrors('ab')).not.toEqual([]);
    expect(plateCodeErrors('')).not.toEqual([]);
  });

  it('keeps the message the two existing copies already publish', () => {
    expect(plateCodeErrors('999')).toContain('plateCode must be exactly two digits (zero-padded)');
  });
});
