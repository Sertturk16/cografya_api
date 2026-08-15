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
   * different answers. So the rule is checked against the seeded corpus rather than a sample — and
   * it keeps being checked, so a future seed wave cannot introduce a slug this pattern would
   * reject without turning this test red first.
   *
   * ## What this corpus is, and what it is NOT
   * It is the PROVINCE and COUNTRY seeds. It is deliberately not called "every slug the platform
   * publishes", because two populations sit outside it and a comment claiming otherwise would be
   * false the moment either grew:
   *
   * - **`SEED_BOOKS`** (`src/database/seeds/books.seed-data.ts`, arriving with B2). Add it to the
   *   spread below once this branch sits on a `dev` that carries it — its slugs are the longest in
   *   the repo and are exactly the kind this ceiling should be measured against.
   * - **The marine point slugs** in `data/marine/marine-points-probe.json`, which are import
   *   artifacts rather than seed modules and cannot be imported here.
   *
   * Both were checked by hand against this pattern when the note was written and both pass, so
   * nothing is broken today — the gap is in what this test can SEE, not in what it found.
   */
  it('accepts EVERY province and country slug in the committed seeds, both languages', () => {
    const seeded = [
      ...SEED_PROVINCES.flatMap((province) => [province.slugTr, province.slugEn]),
      ...SEED_COUNTRIES.flatMap((country) => [country.slugTr, country.slugEn]),
    ];

    // Guards the guard, in the two ways it can go wrong. The expected length is DERIVED from the
    // two imports, so a spread that silently dropped one population — or one language — fails
    // here, where the round `> 500` it replaces had enough slack to pass. And each import is
    // separately required to be non-empty, so one resolving to `[]` reads as a failure rather
    // than as "nothing was rejected". Neither number is written down, so neither can rot.
    expect(seeded).toHaveLength((SEED_PROVINCES.length + SEED_COUNTRIES.length) * 2);
    expect(SEED_PROVINCES).not.toHaveLength(0);
    expect(SEED_COUNTRIES).not.toHaveLength(0);

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
