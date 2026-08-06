import { describe, expect, it } from '@jest/globals';
import { Continent } from '../../common/continent.enum';
import { CountryEntityType } from '../../common/country-entity-type.enum';
import { SEED_COUNTRIES, type CountrySeed } from './country.seed-data';
import {
  assertCountryCorpusInvariants,
  assertCountryEntityInvariants,
  resolveEntityType,
} from './country-entity-invariants';

/**
 * These product rules have no database expression: every violation inserts cleanly and serves a
 * valid payload. So the rules are guards, and this is the test that keeps the guards honest.
 *
 * Pure — no Postgres — so it runs in the fast `Test (unit)` job (ENGINEERING §8). The e2e suite
 * separately proves the row-level guard fires inside `seedWorld` and that nothing is written.
 *
 * Fixtures use ISO private-use codes (ZX/ZY/ZZ) so nothing here names a real country, and no
 * value below is a geographic fact — tests measure structure, never content. Each fixture owns
 * a DISTINCT isoCode + slug pair, because corpus invariant 8 requires all three to be unique
 * and a shared identity would make every multi-fixture corpus structurally invalid.
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

/**
 * A well-formed non-country row: type + BOTH approved labels, the consistent triple.
 *
 * It carries a `population` because corpus invariant 9 requires every NON-`special` row to
 * publish one, and this fixture is the territory in most synthetic corpora below. The value is
 * arbitrary and asserts nothing — a structural placeholder, not a fact (→ CONVENTIONS §2).
 * Row-level rule 3 only forbids a population on `special` rows, so this is equally well formed
 * for the row-level cases that also use it.
 */
const CLEAN_TERRITORY: CountrySeed = {
  ...CLEAN,
  isoCode: 'ZY',
  nameTr: 'Test Bölgesi ZY',
  nameEn: 'Test Territory ZY',
  slugTr: 'test-bolgesi-zy',
  slugEn: 'test-territory-zy',
  entityType: CountryEntityType.Territory,
  statusLabelTr: 'Test Özerk Bölgesi',
  statusLabelEn: 'Test Autonomous Territory',
  population: 1_000,
};

/**
 * A well-formed `special` row: no population, and (here) the Antarctic continent.
 *
 * It carries its OWN identity triple rather than inheriting ZY's. Spreading `CLEAN_TERRITORY`
 * used to leave both fixtures sharing one isoCode and both slugs — harmless while nothing
 * asserted uniqueness, but it modelled two distinct entities as one, and every corpus test
 * combining them was quietly built on a corpus the database would have rejected. Invariant 8
 * surfaced it.
 */
const CLEAN_SPECIAL: CountrySeed = {
  ...CLEAN_TERRITORY,
  isoCode: 'ZZ',
  nameTr: 'Test Özel Bölgesi ZZ',
  nameEn: 'Test Special Area ZZ',
  slugTr: 'test-ozel-bolgesi-zz',
  slugEn: 'test-special-area-zz',
  entityType: CountryEntityType.Special,
  continent: Continent.Antarctica,
  // EXPLICIT, not merely inherited-as-absent. This fixture spreads `CLEAN_TERRITORY`, which now
  // carries a population (corpus invariant 9 requires one on every non-special row) — so
  // "no population here" has to be STATED or the spread silently makes this row violate
  // row-rule 3. Leaving it implicit is what broke six cases the first time (PR #95 review round).
  population: undefined,
};

describe('resolveEntityType', () => {
  // The single source of the default. If this ever disagrees with `normalizeSeed`, the guard
  // and the seeder would judge the same row differently — which is why there is one function.
  it('defaults an unmarked row to country, and echoes an explicit type', () => {
    expect(resolveEntityType(CLEAN)).toBe(CountryEntityType.Country);
    expect(resolveEntityType(CLEAN_TERRITORY)).toBe(CountryEntityType.Territory);
    expect(resolveEntityType(CLEAN_SPECIAL)).toBe(CountryEntityType.Special);
  });
});

describe('assertCountryEntityInvariants — accepts what is well formed', () => {
  it('accepts an ordinary batch, a typed batch, and an empty one', () => {
    expect(() =>
      assertCountryEntityInvariants([CLEAN, CLEAN_TERRITORY, CLEAN_SPECIAL]),
    ).not.toThrow();
    expect(() => assertCountryEntityInvariants([])).not.toThrow();
  });
});

describe('invariant 1 — the turkiye slug belongs to the TR row alone', () => {
  it('REFUSES a non-TR row carrying either Türkiye routing key, however cased or padded', () => {
    // The vector that actually produces a duplicate `/dunya/turkiye`. A row could carry any ISO
    // code at all and still generate the colliding path, so slugs are checked independently of
    // identity.
    expect(() => assertCountryEntityInvariants([{ ...CLEAN, slugTr: 'turkiye' }])).toThrow(
      /slugTr/u,
    );
    expect(() => assertCountryEntityInvariants([{ ...CLEAN, slugEn: 'turkey' }])).toThrow(
      /slugEn/u,
    );
    expect(() => assertCountryEntityInvariants([{ ...CLEAN, slugEn: ' TURKIYE ' }])).toThrow(
      /routing key/u,
    );
  });

  it('ACCEPTS the Türkiye row itself on its own slug — the rule that was inverted', () => {
    // The old guard refused this row outright (PR #23 M5). DEC 2026-08-01j reversed it: the row
    // is the /dunya/turkiye profile. This case is the whole point of the rewrite.
    expect(() =>
      assertCountryEntityInvariants([
        { ...CLEAN, isoCode: 'TR', slugTr: 'turkiye', slugEn: 'turkey' },
      ]),
    ).not.toThrow();
    // …and case/padding on the ISO code does not lose that ownership.
    expect(() =>
      assertCountryEntityInvariants([{ ...CLEAN, isoCode: ' tr ', slugTr: 'turkiye' }]),
    ).not.toThrow();
  });

  it('names the offending row so the fix is obvious', () => {
    expect(() =>
      assertCountryEntityInvariants([CLEAN, { ...CLEAN, isoCode: 'ZY', slugTr: 'turkiye' }]),
    ).toThrow(/\[ZY\]/u);
  });

  it('leaves display names alone — they are neither identity nor routing', () => {
    // Deliberate scope: a row NAMED Türkiye but carrying another ISO code and slug is a
    // fact-check failure, not the IA collision this guard exists for. Widening it would put a
    // content check inside a routing rule.
    expect(() =>
      assertCountryEntityInvariants([{ ...CLEAN, nameTr: 'Türkiye', nameEn: 'Türkiye' }]),
    ).not.toThrow();
  });
});

describe('invariant 2 — entity type and card status label agree', () => {
  it('REFUSES a country row that carries a status label', () => {
    expect(() =>
      assertCountryEntityInvariants([{ ...CLEAN, statusLabelTr: 'Bir Etiket' }]),
    ).toThrow(/status label/u);
    expect(() => assertCountryEntityInvariants([{ ...CLEAN, statusLabelEn: 'A Label' }])).toThrow(
      /status label/u,
    );
  });

  it('REFUSES a non-country row missing either label', () => {
    const withoutEn: CountrySeed = { ...CLEAN_TERRITORY };
    delete withoutEn.statusLabelEn;
    expect(() => assertCountryEntityInvariants([withoutEn])).toThrow(/statusLabelEn/u);
    expect(() =>
      assertCountryEntityInvariants([{ ...CLEAN_TERRITORY, statusLabelTr: '   ' }]),
    ).toThrow(/statusLabelTr/u);
  });

  it('REFUSES a WHITESPACE-ONLY label on a country row — blank is not absent', () => {
    // The rule is "must be NULL", and `'   '` is not NULL: it reaches the column verbatim and
    // renders as blank card copy instead of letting the consumer take its country branch. An
    // earlier revision used the same blank-tolerant helper for both directions and let this
    // through.
    expect(() => assertCountryEntityInvariants([{ ...CLEAN, statusLabelTr: '   ' }])).toThrow(
      /whitespace string is not the same as absent/u,
    );
    expect(() => assertCountryEntityInvariants([{ ...CLEAN, statusLabelEn: '' }])).toThrow(
      /status label/u,
    );
  });

  it('ACCEPTS a country with no labels and a non-country with both', () => {
    expect(() => assertCountryEntityInvariants([CLEAN])).not.toThrow();
    expect(() =>
      assertCountryEntityInvariants([{ ...CLEAN, statusLabelTr: null, statusLabelEn: null }]),
    ).not.toThrow();
    expect(() => assertCountryEntityInvariants([CLEAN_TERRITORY])).not.toThrow();
  });
});

describe('the retired alpha-3 identity leg', () => {
  // The old guard refused `isoCodeAlpha3: 'TUR'` outright. That check is gone ON PURPOSE (see
  // the module header): TR now legitimately carries TUR, alpha-3 is not a routing key, and a
  // duplicate claim is refused loudly by the column's UNIQUE constraint. Pinned so the removal
  // reads as a decision rather than an oversight, and so re-adding it fails here first.
  it('no longer refuses a row on its alpha-3 code alone', () => {
    expect(() => assertCountryEntityInvariants([{ ...CLEAN, isoCodeAlpha3: 'TUR' }])).not.toThrow();
  });
});

describe('invariant 3 — a special row has no population, and 0 is not "none"', () => {
  it('REFUSES population 0 — the case the rule exists for', () => {
    // "The concept does not apply" and "zero people live here" are different claims, and only
    // one of them is true. A plain nullability check would let 0 through.
    expect(() => assertCountryEntityInvariants([{ ...CLEAN_SPECIAL, population: 0 }])).toThrow(
      /population absent/u,
    );
  });

  it('REFUSES a real population on a special row too', () => {
    expect(() => assertCountryEntityInvariants([{ ...CLEAN_SPECIAL, population: 1234 }])).toThrow(
      /population absent/u,
    );
  });

  it('ACCEPTS an absent or explicitly null population, and leaves other types alone', () => {
    expect(() => assertCountryEntityInvariants([CLEAN_SPECIAL])).not.toThrow();
    expect(() =>
      assertCountryEntityInvariants([{ ...CLEAN_SPECIAL, population: null }]),
    ).not.toThrow();
    // A country or territory may of course have a population of any value.
    expect(() =>
      assertCountryEntityInvariants([{ ...CLEAN_TERRITORY, population: 0 }]),
    ).not.toThrow();
  });
});

describe('invariant 4 — the Antarctic continent implies a special row', () => {
  it('REFUSES a country or territory on continent ANTARKTIKA', () => {
    expect(() =>
      assertCountryEntityInvariants([{ ...CLEAN, continent: Continent.Antarctica }]),
    ).toThrow(/ANTARKTIKA/u);
    expect(() =>
      assertCountryEntityInvariants([{ ...CLEAN_TERRITORY, continent: Continent.Antarctica }]),
    ).toThrow(/ANTARKTIKA/u);
  });

  it('ACCEPTS a special row there — and a special row anywhere else (one direction only)', () => {
    expect(() => assertCountryEntityInvariants([CLEAN_SPECIAL])).not.toThrow();
    // The converse is deliberately NOT enforced: dalga-2 has special-status candidates on
    // ordinary continents, so "special ⇒ Antarctica" would be wrong.
    expect(() =>
      assertCountryEntityInvariants([{ ...CLEAN_SPECIAL, continent: Continent.Africa }]),
    ).not.toThrow();
  });
});

describe('invariant 5 — independence does not apply to a non-country row', () => {
  it('REFUSES an independence note on a territory or a special row', () => {
    expect(() =>
      assertCountryEntityInvariants([{ ...CLEAN_TERRITORY, independenceNoteTr: 'bir tarih' }]),
    ).toThrow(/independenceNoteTr/u);
    expect(() =>
      assertCountryEntityInvariants([{ ...CLEAN_SPECIAL, independenceNoteTr: 'bir tarih' }]),
    ).toThrow(/independenceNoteTr/u);
  });

  it('ACCEPTS an absent or null note there, and any note on a country row', () => {
    expect(() => assertCountryEntityInvariants([CLEAN_TERRITORY])).not.toThrow();
    expect(() =>
      assertCountryEntityInvariants([{ ...CLEAN_TERRITORY, independenceNoteTr: null }]),
    ).not.toThrow();
    expect(() =>
      assertCountryEntityInvariants([{ ...CLEAN, independenceNoteTr: 'bir tarih' }]),
    ).not.toThrow();
  });
});

describe('invariant 7a — a non-country row still needs both localized slugs', () => {
  it('REFUSES a blank slug in either locale', () => {
    expect(() => assertCountryEntityInvariants([{ ...CLEAN_TERRITORY, slugTr: '' }])).toThrow(
      /localized slug/u,
    );
    expect(() => assertCountryEntityInvariants([{ ...CLEAN_TERRITORY, slugEn: '   ' }])).toThrow(
      /localized slug/u,
    );
  });

  it('ACCEPTS a non-country row with both slugs present', () => {
    expect(() => assertCountryEntityInvariants([CLEAN_TERRITORY, CLEAN_SPECIAL])).not.toThrow();
  });
});

describe('invariant 10a — population source name is both-or-neither', () => {
  it('REFUSES a row that sets only the TR or only the EN source name', () => {
    expect(() =>
      assertCountryEntityInvariants([{ ...CLEAN, populationSourceNameTr: 'Test Kurumu' }]),
    ).toThrow(/only ONE locale/u);
    expect(() =>
      assertCountryEntityInvariants([{ ...CLEAN, populationSourceNameEn: 'Test Institute' }]),
    ).toThrow(/only ONE locale/u);
  });

  it('REFUSES a whitespace-only value paired with a REAL value — blank does not count as filled', () => {
    // Without `isBlank` (a plain existence check) this pairing would read as "both set" and slip
    // through; `isBlank` correctly reads the whitespace side as unfilled, so the pair mismatches.
    expect(() =>
      assertCountryEntityInvariants([
        { ...CLEAN, populationSourceNameTr: '   ', populationSourceNameEn: 'Test Institute' },
      ]),
    ).toThrow(/only ONE locale/u);
  });

  it('ACCEPTS a row with both locales set, or neither', () => {
    expect(() => assertCountryEntityInvariants([CLEAN])).not.toThrow();
    expect(() =>
      assertCountryEntityInvariants([
        {
          ...CLEAN,
          population: 1_000,
          populationSourceNameTr: 'Test Kurumu',
          populationSourceNameEn: 'Test Institute',
        },
      ]),
    ).not.toThrow();
  });
});

describe('invariant 10b — no population source name without a population', () => {
  it('REFUSES a source name pair on a row with no population', () => {
    expect(() =>
      assertCountryEntityInvariants([
        {
          ...CLEAN_SPECIAL,
          populationSourceNameTr: 'Test Kurumu',
          populationSourceNameEn: 'Test Institute',
        },
      ]),
    ).toThrow(/leaves population absent/u);
  });

  it('ACCEPTS a source name pair on a row that publishes a population', () => {
    expect(() =>
      assertCountryEntityInvariants([
        {
          ...CLEAN,
          population: 1_000,
          populationSourceNameTr: 'Test Kurumu',
          populationSourceNameEn: 'Test Institute',
        },
      ]),
    ).not.toThrow();
  });

  it('REFUSES a WHITESPACE-ONLY source name beside an absent population — blank is not absent', () => {
    // PR #98 review, CR98-M2: this rule must use `isAbsent`, not `isBlank`. A `'   '` value is a
    // real stored string that would reach the resolver looking like a set override; only
    // `isAbsent` catches it here. Before the fix this row passed BOTH row-level rules silently
    // (10a: both sides equally "blank" by `isBlank`'s own reading, so no asymmetry; 10b: a
    // whitespace value read as "not set") — the resolver's own defence (I1) is a second,
    // independent line, not a substitute for this one.
    expect(() =>
      assertCountryEntityInvariants([
        { ...CLEAN_SPECIAL, populationSourceNameTr: '   ', populationSourceNameEn: '   ' },
      ]),
    ).toThrow(/leaves population absent/u);
  });
});

describe('assertCountryCorpusInvariants — invariants 6, 7b, 8, 9 and 10c', () => {
  // These are statements about the WHOLE published set, so they are tested over synthetic
  // corpora rather than being placed on the write path, where every legitimate partial batch
  // would trip them. See the module header for the scope split.
  //
  // `TR` carries a population for the same reason `CLEAN_TERRITORY` does: invariant 9 applies to
  // every non-`special` row, so a corpus fixture without one would trip a rule these cases are
  // not about. It ALSO carries a populationSourceNameTr/En pair — a structural placeholder, no
  // institution↔country fact asserted (CONVENTIONS §4) — purely so `FULL` satisfies invariant
  // 10c and every unrelated `not.toThrow()` case below (6/7b/8/9) is not tripped by a corpus that
  // happens to carry zero overrides.
  const TR: CountrySeed = {
    ...CLEAN,
    isoCode: 'TR',
    slugTr: 'turkiye',
    slugEn: 'turkey',
    population: 1_000,
    populationSourceNameTr: 'Test Kurumu',
    populationSourceNameEn: 'Test Institute',
  };
  const FULL: readonly CountrySeed[] = [TR, CLEAN_TERRITORY, CLEAN_SPECIAL];

  it('6 — ACCEPTS exactly one TR row, typed country, on the turkiye slug', () => {
    expect(() => assertCountryCorpusInvariants(FULL)).not.toThrow();
  });

  it('6 — REFUSES zero TR rows and two TR rows alike', () => {
    expect(() => assertCountryCorpusInvariants([CLEAN_TERRITORY, CLEAN_SPECIAL])).toThrow(
      /EXACTLY ONE/u,
    );
    expect(() => assertCountryCorpusInvariants([...FULL, { ...TR, slugTr: 'turkiye-2' }])).toThrow(
      /EXACTLY ONE/u,
    );
  });

  it('6 — REFUSES a TR row that is mistyped or has lost its slug', () => {
    const mistyped: CountrySeed = {
      ...TR,
      entityType: CountryEntityType.Territory,
      statusLabelTr: 'Bir Etiket',
      statusLabelEn: 'A Label',
    };
    expect(() => assertCountryCorpusInvariants([mistyped, CLEAN_TERRITORY, CLEAN_SPECIAL])).toThrow(
      /must be entityType "country"/u,
    );
    expect(() =>
      assertCountryCorpusInvariants([
        { ...TR, slugTr: 'turkiye-profili' },
        CLEAN_TERRITORY,
        CLEAN_SPECIAL,
      ]),
    ).toThrow(/slugTr "turkiye"/u);
  });

  it('6 — REFUSES a TR row whose slugEn drifted off the routing key', () => {
    // The hostile fixture is the EXACT tidy-up the row's own note warns about: `nameEn` is
    // "Türkiye", so harmonising the slug to match looks like a correction. It is not — ruling S8
    // decided name and slug separately, `/en/dunya/turkey` is live, and the eight neighbour rows'
    // EN cross-links resolve through it.
    //
    // This case exists because without it the pin was invisible to CI: the `TR` fixture already
    // carries `slugEn: 'turkey'`, so every other invariant-6 test passes whether or not the pin
    // exists — deleting the guard would have left the whole suite green. That is the same
    // "green while broken" argument the pin itself was added for (TA90-I1), so leaving the guard
    // unprotected would have reproduced the defect one level up.
    expect(() =>
      assertCountryCorpusInvariants([{ ...TR, slugEn: 'turkiye' }, CLEAN_TERRITORY, CLEAN_SPECIAL]),
    ).toThrow(/slugEn "turkey"/u);
    // Case folding is intended: an uppercase slug is the same routing key, not a violation.
    expect(() =>
      assertCountryCorpusInvariants([{ ...TR, slugEn: 'TURKEY' }, CLEAN_TERRITORY, CLEAN_SPECIAL]),
    ).not.toThrow();
  });

  it('7b — REFUSES a corpus with no territory row, or no special row', () => {
    expect(() => assertCountryCorpusInvariants([TR, CLEAN_SPECIAL])).toThrow(/"territory"/u);
    expect(() => assertCountryCorpusInvariants([TR, CLEAN_TERRITORY])).toThrow(/"special"/u);
  });

  it('7b — ACCEPTS a corpus that carries at least one of each', () => {
    expect(() => assertCountryCorpusInvariants(FULL)).not.toThrow();
  });

  it('8 — REFUSES a repeated isoCode, slugTr or slugEn, naming the colliding value', () => {
    // All four are UNIQUE columns, so an EXACT repeat would fail the INSERT. The point of
    // catching it here is the message: Postgres reports the constraint, this reports the value
    // and the rule.
    //
    // The trim + case-folded comparison makes this guard DELIBERATELY STRICTER than the database,
    // and the last case below proves it: `seedWorld`/`normalizeSeed` do NOT normalise (no trim,
    // no case-fold anywhere in `seed-world.ts`) and the Postgres unique indexes are whitespace-
    // and case-sensitive, so `'  zy  '` beside `'ZY'` would actually INSERT cleanly. It should
    // still be refused — two rows differing only by invisible whitespace are the same entity to
    // every human and to every URL, and the seed is hand-edited. Strictness is the safe
    // direction here; the guard is not claiming to mirror the DB.
    expect(() =>
      assertCountryCorpusInvariants([
        ...FULL,
        { ...CLEAN_TERRITORY, slugTr: 'başka', slugEn: 'x' },
      ]),
    ).toThrow(/repeats isoCode value\(s\) ZY/u);
    expect(() =>
      assertCountryCorpusInvariants([...FULL, { ...CLEAN_TERRITORY, isoCode: 'ZQ', slugEn: 'x' }]),
    ).toThrow(/repeats slugTr value\(s\) test-bolgesi-zy/u);
    expect(() =>
      assertCountryCorpusInvariants([...FULL, { ...CLEAN_TERRITORY, isoCode: 'ZQ', slugTr: 'y' }]),
    ).toThrow(/repeats slugEn value\(s\) test-territory-zy/u);
    expect(() =>
      assertCountryCorpusInvariants([...FULL, { ...CLEAN_TERRITORY, isoCode: '  zy  ' }]),
    ).toThrow(/repeats isoCode value\(s\) ZY/u);
  });

  it('8 — ACCEPTS a corpus whose three key sets are each collision-free', () => {
    expect(() => assertCountryCorpusInvariants(FULL)).not.toThrow();
  });

  it('9 — REFUSES a non-special row that publishes no population, naming every such row', () => {
    // The regression this rule exists for: five Orta Afrika rows sat at `population: null` for a
    // whole content wave and the only symptom was five pages quietly not drawing a "Nüfus" card.
    // Both absence shapes must be caught — an explicit `null` and an omitted property.
    expect(() =>
      assertCountryCorpusInvariants([{ ...TR, population: null }, CLEAN_TERRITORY, CLEAN_SPECIAL]),
    ).toThrow(/non-special row\(s\) publish no population/u);
    expect(() =>
      assertCountryCorpusInvariants([
        TR,
        { ...CLEAN_TERRITORY, population: undefined },
        CLEAN_SPECIAL,
      ]),
    ).toThrow(/\[ZY\] Test Bölgesi ZY/u);
  });

  it('9 — ACCEPTS the special row leaving population absent (rule 3 REQUIRES that)', () => {
    // The two rules are converses and must not contradict each other: rule 3 forbids a
    // population on `CLEAN_SPECIAL`, so rule 9 has to exempt exactly that row — otherwise the
    // corpus would be unable to satisfy both at once and Antarktika could never be seeded.
    expect(() => assertCountryEntityInvariants([CLEAN_SPECIAL])).not.toThrow();
    expect(() => assertCountryCorpusInvariants(FULL)).not.toThrow();
  });

  it('10c — REFUSES a corpus where no row carries a populationSourceNameTr/En pair', () => {
    // PR #98 review, CR98-M4 (author's call: taken). Row-rules 10a/10b only constrain a row
    // that already carries the pair, so a corpus that deletes all five real override rows
    // would otherwise pass everything — this is the fact-free (CONVENTIONS §4) check that
    // catches that regression, mirroring how 7b catches a corpus that dropped every typed row.
    const noOverrideTR: CountrySeed = { ...TR };
    delete noOverrideTR.populationSourceNameTr;
    delete noOverrideTR.populationSourceNameEn;
    expect(() =>
      assertCountryCorpusInvariants([noOverrideTR, CLEAN_TERRITORY, CLEAN_SPECIAL]),
    ).toThrow(/no row carrying a populationSourceNameTr\/En pair/u);
  });

  it('10c — ACCEPTS a corpus where at least one row carries the pair', () => {
    expect(() => assertCountryCorpusInvariants(FULL)).not.toThrow();
  });
});

describe('the committed corpus', () => {
  it('satisfies every ROW-level invariant', () => {
    // The structural assertion over the real seed: it is what fires the day a routine content
    // wave appends a row that steals the Türkiye slug, mistypes a label pair, or publishes a
    // population of 0 for a special-status entity.
    expect(() => assertCountryEntityInvariants(SEED_COUNTRIES)).not.toThrow();
  });

  it('satisfies every CORPUS-level invariant — the S3 gap is now CLOSED', () => {
    // THIS ASSERTION IS INVERTED FROM PR-A, ON PURPOSE (Atlas ruling S3, 2026-08-02).
    // PR-A shipped `assertCountryCorpusInvariants` fully unit-tested against synthetic corpora
    // but deliberately NOT bound to the real one, because the rows it describes did not exist
    // yet; it pinned that gap with `toThrow(/found 0\./u)` so the hole could not go silent.
    // PR-B lands the rows (GL `territory`, AQ `special`, TR `country`), so the same call must
    // now SUCCEED. What arrives here is a PROVEN check finally pointed at production data —
    // not a new check written to match whatever the seed happens to contain.
    //
    // What this covers that the row-level pass above cannot: invariant 6 (EXACTLY ONE `TR`
    // row, `country`-typed, holding the `turkiye` slug) and invariant 7b (the corpus carries
    // at least one `territory` AND at least one `special` row). Both are properties of the
    // WHOLE corpus, so no per-row guard can see them — a second Türkiye row appended by a
    // future wave, or a refactor that resets `entityType` back to its default, is invisible
    // until something asserts here.
    //
    // Deliberately NO hardcoded row count (Atlas ruling, PR-B plan §7.1): `SEED_COUNTRIES`
    // grows every wave, and a pinned 199 would rot on the next one and train the next
    // engineer to edit the test instead of reading it. The e2e's phase 1 already proves the
    // whole set inserts cleanly, dynamically, against `SEED_COUNTRIES.length`.
    expect(() => assertCountryCorpusInvariants(SEED_COUNTRIES)).not.toThrow();
  });
});
