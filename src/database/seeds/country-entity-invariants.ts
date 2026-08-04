import { Continent } from '../../common/continent.enum';
import { CountryEntityType } from '../../common/country-entity-type.enum';
import type { CountrySeed } from './country.seed-data';

/**
 * The structural product rules the `countries` corpus must obey — the successor to
 * `turkiye-exclusion.ts`.
 *
 * A NOTE ON THE HISTORY, because no Git command will reconstruct it for you: this file was
 * produced with `git mv` from `turkiye-exclusion.ts`, but both it and its spec were then
 * rewritten far enough that similarity detection no longer sees a rename. The delivered diff
 * reads as create + delete, and `git log --follow` on THIS path stops at the commit that
 * created it — verified, not assumed. To read the predecessor's history, ask for the old path
 * by name:
 *
 *     git log --oneline -- src/database/seeds/turkiye-exclusion.ts
 *
 * Treat "renamed" as a statement about intent, not about what tooling will confirm.
 *
 * ## What changed, and why this file exists at all
 *
 * The old rule was "Türkiye is NEVER a country row" (PR #23 M5). The owner has since ruled the
 * opposite (DEC 2026-08-01j / DEC 2026-08-01q): `/dunya/turkiye` becomes a REAL profile page,
 * one of three typed rows (GL `territory`, AQ `special`, TR `country`) landing in the dalga-1
 * territory wave. This is a referenced rule change, not drift — and the guard is not deleted,
 * because the thing it actually protected is still true: **`/dunya/turkiye` must resolve to the
 * Türkiye row and to nothing else.** What used to be "no TR row" is now "the `turkiye` slug
 * belongs to the TR row alone".
 *
 * ## One leg of the old guard is GONE, deliberately: the alpha-3 identity check
 *
 * The old version also refused any row carrying `isoCodeAlpha3: 'TUR'`. Under the new model
 * that check would be actively WRONG — the Türkiye row legitimately carries `TUR`, and this
 * guard cannot tell "the real TR row" from "an impostor" by alpha-3 alone, because it is not a
 * routing key and generates no page. What it protected against (a second row claiming
 * Türkiye's secondary identifier) is now covered where it belongs and more strictly: the
 * `iso_code_alpha3` column is UNIQUE, so a duplicate claim fails LOUDLY at insert time. The
 * ordering case is covered too — a bogus row that took `TUR` first makes the real TR row's
 * insert fail, inside the seed's single transaction, rolling the whole batch back. This is
 * recorded rather than left as an unexplained deletion.
 *
 * ## Why guards rather than database constraints
 *
 * None of these rules fails anything in Postgres. A `special` row carrying `population: 0`
 * inserts cleanly and serves a valid payload; the only symptom is a page publishing
 * "Antarktika'nın nüfusu: 0" — a claim nobody meant to make, in the class of defect nobody
 * notices until it is indexed. A CHECK constraint could express one or two of these; it cannot
 * express the slug-ownership rule, and splitting one product rule across two enforcement
 * mechanisms is how the halves drift. So all of it lives here, on the seed write path.
 *
 * ## Two scopes, deliberately separated
 *
 *  - {@link assertCountryEntityInvariants} — ROW-level rules (1-5, 7a). True of any row in
 *    isolation, therefore safe on the WRITE path: `seedWorld` accepts arbitrary batches (the
 *    e2e suite and any future partial re-seed pass their own), so this runs over whatever is
 *    actually about to be written, not only over the reviewed corpus.
 *  - {@link assertCountryCorpusInvariants} — CORPUS-level rules (6, 7b). "Exactly one TR row"
 *    and "the corpus holds at least one territory and one special row" are statements about the
 *    WHOLE published set; asserting them on the write path would reject every legitimate
 *    partial batch, including every e2e fixture run. They belong in the unit spec over
 *    `SEED_COUNTRIES`, which needs no database and fails fast in `Test (unit)`.
 *
 * **The corpus assertion against the real `SEED_COUNTRIES` is deliberately NOT wired yet.**
 * The three rows it describes arrive in the seed PR (PR-B); asserting them here would open this
 * PR red for a reason that has nothing to do with this PR's code. PR-B opens that line (Atlas
 * ruling S3, 2026-08-02). Until then the function is fully unit-tested against synthetic
 * corpora — so what lands with the rows is a proven check, not a new one.
 */

/** ISO 3166-1 alpha-2 code of Türkiye — the site's own country, and the only owner of its slug. */
const TURKIYE_ALPHA2 = 'TR';
/** The slugs that render as `/dunya/{slug}` and would collide with the Türkiye profile. */
const TURKIYE_SLUGS: ReadonlySet<string> = new Set(['turkiye', 'turkey']);
/** Türkiye's own TR slug, as the corpus rule expects to find it. */
const TURKIYE_SLUG_TR = 'turkiye';

export class CountrySeedInvariantError extends Error {
  constructor(message: string) {
    super(`[seed:world] ${message}`);
    this.name = 'CountrySeedInvariantError';
  }
}

/**
 * The entity type a seed row resolves to.
 *
 * `entityType` is OPTIONAL in `CountrySeed` on purpose — making it required would force an edit
 * on all 196 existing rows for no information gain, and making it nullable would let `null`
 * reach a NOT NULL column. So "absent" means `country`, and this is the ONE place that rule is
 * written down: both the seeder (`normalizeSeed`) and this guard call it, because two
 * hand-written copies of the same default are two defaults waiting to diverge.
 */
export function resolveEntityType(seed: CountrySeed): CountryEntityType {
  return seed.entityType ?? CountryEntityType.Country;
}

/**
 * "No usable value" — `null`, `undefined`, or a string with nothing but whitespace in it.
 * Use for rules of the form *"this MUST be filled in"*.
 */
function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}

/**
 * "Genuinely absent" — `null` or `undefined`, and nothing else.
 *
 * DISTINCT FROM `isBlank` ON PURPOSE, and the two are not interchangeable. A rule of the form
 * *"this MUST be absent"* has to reject `'   '`: whitespace is not absence. It reaches the
 * column as three spaces, and the consumer that was promised NULL renders three spaces instead
 * of taking its fallback branch — so the guard would have certified a row it was written to
 * refuse. Using `isBlank` for both directions is how that hole opened.
 */
function isAbsent(value: string | null | undefined): boolean {
  return value === null || value === undefined;
}

/** Names a row the way a human finds it in the seed files. */
function label(seed: CountrySeed): string {
  return `[${seed.isoCode}] ${seed.nameTr}`;
}

/**
 * ROW-LEVEL invariants — see the module header for the scope split.
 *
 * Throws on the FIRST offending row rather than collecting them: one violation is already a
 * product-rule breach, and the message has to name the row so the fix is obvious. Every message
 * states which row and which rule; none of them suggests a way around the check.
 */
export function assertCountryEntityInvariants(countries: readonly CountrySeed[]): void {
  for (const seed of countries) {
    const entityType = resolveEntityType(seed);
    const isCountry = entityType === CountryEntityType.Country;

    // 1 — SLUG OWNERSHIP. The `/dunya/turkiye` (and `/dunya/turkey`) path belongs to the Türkiye
    // row alone. Any other row carrying that slug IS the duplicate page, whatever it calls
    // itself — nothing in the pipeline objects, and the only symptom is a second, thinner page
    // competing for exactly the query the profile exists to win.
    if (seed.isoCode.trim().toUpperCase() !== TURKIYE_ALPHA2) {
      for (const [field, slug] of [
        ['slugTr', seed.slugTr],
        ['slugEn', seed.slugEn],
      ] as const) {
        if (TURKIYE_SLUGS.has(slug.trim().toLowerCase())) {
          throw new CountrySeedInvariantError(
            `${label(seed)} claims Türkiye's routing key (${field} ${JSON.stringify(slug)}), but ` +
              `that slug belongs to the isoCode "TR" row alone — it is the path of the ` +
              `/dunya/turkiye profile (DEC 2026-08-01j). A second row on that path generates a ` +
              `duplicate page with no error anywhere in the pipeline. Give this row its own slug.`,
          );
        }
      }
    }

    // 2 — TYPE AND CARD LABEL AGREE. The status label is owner-approved card copy for
    // non-country entities (DEC 2026-08-01m/n/p). A country carrying one would publish a
    // subtitle nobody approved; a non-country missing one falls back to its continent name,
    // which DEC 2026-08-01m explicitly rejected.
    if (isCountry) {
      // `isAbsent`, NOT `isBlank`: a whitespace-only label is not "no label" — it would be
      // stored verbatim and rendered as blank card copy instead of taking the country branch.
      if (!isAbsent(seed.statusLabelTr) || !isAbsent(seed.statusLabelEn)) {
        throw new CountrySeedInvariantError(
          `${label(seed)} is entityType "country" but carries a status label — status labels are ` +
            `the approved card subtitle for NON-country entities only (DEC 2026-08-01m/n/p). ` +
            `Remove the property; an empty or whitespace string is not the same as absent.`,
        );
      }
    } else if (isBlank(seed.statusLabelTr) || isBlank(seed.statusLabelEn)) {
      throw new CountrySeedInvariantError(
        `${label(seed)} is entityType "${entityType}" and needs BOTH statusLabelTr and ` +
          `statusLabelEn (owner-approved copy, DEC 2026-08-01m/n/p). Without them the card ` +
          `subtitle falls back to the continent name, which the ruling rejected.`,
      );
    }

    // 3 — "NOT APPLICABLE" IS NOT ZERO. Antarktika has no permanent population; publishing 0
    // asserts "zero people live here", a different and false claim. Absent, never zero.
    if (
      entityType === CountryEntityType.Special &&
      seed.population !== null &&
      seed.population !== undefined
    ) {
      throw new CountrySeedInvariantError(
        `${label(seed)} is entityType "special" and must leave population absent — the concept ` +
          `does not apply, and 0 would publish "zero people live here" as a fact ` +
          `(received ${JSON.stringify(seed.population)}).`,
      );
    }

    // 4 — ANTARKTIKA IS NOT A COUNTRY. Enforced in ONE direction only: a `special` row on
    // another continent is perfectly legal (dalga-2 has candidates), so the converse is not
    // asserted.
    if (seed.continent === Continent.Antarctica && entityType !== CountryEntityType.Special) {
      throw new CountrySeedInvariantError(
        `${label(seed)} sits on continent ANTARKTIKA but is entityType "${entityType}" — the ` +
          `Antarctic continent carries no sovereign state, so its row is entityType "special" ` +
          `(DEC 2026-08-01q).`,
      );
    }

    // 5 — "INDEPENDENCE" DOES NOT APPLY TO A DEPENDENT TERRITORY. Closed structurally rather
    // than editorially: a non-country row cannot carry the field, so the "Bağımsızlık" heading
    // can never reach a page where it makes no sense. The equivalent framing has its own home
    // in `governanceNoteTr` (SPEC §3.5-a).
    // `isAbsent` again: `'   '` is a stored value, and a stored value here is what puts the
    // "Bağımsızlık" heading on a page where the concept does not apply.
    if (!isCountry && !isAbsent(seed.independenceNoteTr)) {
      throw new CountrySeedInvariantError(
        `${label(seed)} is entityType "${entityType}" and must leave independenceNoteTr absent — ` +
          `"independence" does not apply to a dependent or special-status entity. Its ` +
          `governance/status framing belongs in governanceNoteTr.`,
      );
    }

    // 7a — A NON-COUNTRY ROW IS STILL A PAGE. Both localized slugs must be real, or the web repo
    // cannot generate `/dunya/{slug}` for it in one of the two locales.
    if (!isCountry && (isBlank(seed.slugTr) || isBlank(seed.slugEn))) {
      throw new CountrySeedInvariantError(
        `${label(seed)} is entityType "${entityType}" but is missing a localized slug ` +
          `(slugTr ${JSON.stringify(seed.slugTr)}, slugEn ${JSON.stringify(seed.slugEn)}) — both ` +
          `locales need a routing key or the page cannot be generated.`,
      );
    }
  }
}

/**
 * CORPUS-LEVEL invariants — statements about the published set as a whole, so they are NOT on
 * the write path (see the module header). Called from the unit spec.
 *
 *  - 6 — exactly one `TR` row, typed `country`, on the `turkiye` slug.
 *  - 7b — the corpus actually contains the typed rows the model was built for.
 */
export function assertCountryCorpusInvariants(countries: readonly CountrySeed[]): void {
  // 6 — EXACTLY ONE TÜRKİYE. Two TR rows would be a duplicate page; zero would mean the profile
  // silently vanished from a content wave. Both are invisible without this check.
  const turkiye = countries.filter((seed) => seed.isoCode.trim().toUpperCase() === TURKIYE_ALPHA2);
  if (turkiye.length !== 1) {
    throw new CountrySeedInvariantError(
      `the corpus must contain EXACTLY ONE isoCode "TR" row (the /dunya/turkiye profile, ` +
        `DEC 2026-08-01j) — found ${turkiye.length}.`,
    );
  }
  const row = turkiye[0];
  if (row === undefined) {
    // Unreachable: the length check above already proved there is exactly one. Written out
    // rather than asserted away, because `noUncheckedIndexedAccess` is on for a reason.
    throw new CountrySeedInvariantError('the corpus TR row disappeared between two reads.');
  }
  const turkiyeType = resolveEntityType(row);
  if (turkiyeType !== CountryEntityType.Country) {
    throw new CountrySeedInvariantError(
      `the Türkiye row must be entityType "country" — found "${turkiyeType}".`,
    );
  }
  if (row.slugTr.trim().toLowerCase() !== TURKIYE_SLUG_TR) {
    throw new CountrySeedInvariantError(
      `the Türkiye row must keep slugTr "${TURKIYE_SLUG_TR}" — the /turkiye hub links to it and ` +
        `eight neighbour pages resolve it. Found ${JSON.stringify(row.slugTr)}.`,
    );
  }

  // 7b — THE TYPED ROWS EXIST. A corpus with zero territory or zero special rows means the typed
  // model is carrying no weight: either a content wave dropped its rows, or a refactor reset the
  // types back to the default. Counted, never named — no geographic fact is pinned here.
  for (const wanted of [CountryEntityType.Territory, CountryEntityType.Special]) {
    const count = countries.filter((seed) => resolveEntityType(seed) === wanted).length;
    if (count === 0) {
      throw new CountrySeedInvariantError(
        `the corpus contains no entityType "${wanted}" row — the dalga-1 wave publishes at least ` +
          `one of each, so zero means rows were dropped or their type was reset.`,
      );
    }
  }
}
