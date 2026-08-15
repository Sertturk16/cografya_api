import { Length, Matches } from 'class-validator';

/**
 * The two route-parameter shapes every public endpoint here uses: a localized slug, and a plate
 * code.
 *
 * `ENGINEERING.md` §3.2 — "never trust a client-supplied type, length, enum, or id shape;
 * validate at the boundary" — and the error table the marine and air-quality endpoints already
 * implement: a MALFORMED parameter is a 400 from the global `ValidationPipe`, an
 * unknown-but-well-formed one is the handler's 404.
 *
 * ## The patterns are LOOSE on purpose, and that is an SEO decision
 * A pattern tighter than the data is not a stricter API, it is a wrong page: a valid slug that
 * fails validation returns a 400 where a 404 belongs, and those are two different pages for a
 * crawler. So each pattern mirrors what the seed can actually PRODUCE, never what a stricter
 * reading of the format would allow — the principle `MarinePointSlugParams` recorded first and
 * the reason it has never misfired on real data.
 *
 * That claim is not made from a count written here. `route-params.dto.spec.ts` re-runs it against
 * the committed seeds on every CI run, where it cannot rot: a seed wave introducing a slug this
 * pattern would reject turns that spec red before it can turn a page into a 400. A literal tally
 * in this comment would have been stale one merge later — the first version of it was, inside a
 * single merge. The length ceiling below is loose by roughly a factor of three against the longest
 * real slug, deliberately: it is a denial-of-service bound on the lookup key, not a claim about
 * naming.
 *
 * ## Binding these to a route is a CONTRACT change (`ENGINEERING.md` §4)
 * The swagger CLI plugin's `classValidatorShim` is on, so a bound DTO publishes its constraints.
 * The already-converted marine route proves it: `/api/marine/points/{slug}/conditions` publishes
 * `pattern`, `minLength` and `maxLength` on its path parameter, while `/api/provinces/{slug}` and
 * `/api/countries/{slug}` — still `@Param('slug') slug: string` — publish only `type: string`.
 *
 * So converting `province.controller.ts:55` and `country.controller.ts:55` does two things at
 * once, and BOTH must be flagged to Atlas for Vera before they land:
 *
 * 1. `openapi/openapi.json` gains `pattern`/`minLength`/`maxLength` on two path parameters —
 *    additive, but it is a published schema change and regenerating the artifact is mandatory.
 * 2. A malformed slug on those two routes stops being a 404 and becomes a 400. Those are two
 *    INDEXABLE route families, and a crawler treats the two answers differently.
 */

/**
 * `{slug}` — a TR or EN localized slug, lowercase kebab-case by seed construction.
 *
 * Kebab-case means groups of `[a-z0-9]` joined by single hyphens: no leading or trailing hyphen,
 * no doubled hyphen, no underscore, no uppercase, and no non-ASCII (the seed transliterates
 * Turkish characters before they reach a slug column — `çorum` is seeded as `corum`).
 */
export class SlugParams {
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be a lowercase kebab-case identifier',
  })
  @Length(1, 120)
  slug!: string;
}

/**
 * `{plateCode}` — exactly two digits, zero-padded, like `provinces.plate_code`.
 *
 * The zero padding is not cosmetic: the column is a two-character string precisely so the lexical
 * `ORDER BY plate_code` stays correct, so `6` is not a lenient spelling of `06`, it is a different
 * key that resolves to nothing.
 */
export class PlateCodeParams {
  @Matches(/^\d{2}$/, { message: 'plateCode must be exactly two digits (zero-padded)' })
  plateCode!: string;
}
