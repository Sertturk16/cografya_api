import type { CountrySeed } from './country.seed-data';

/**
 * Türkiye is NOT a country row. It is the site's own hub.
 *
 * **The product ruling** (recorded at PR #23 M5, `CONVENTIONS.md` "Dünya haritası"): the world
 * map's Türkiye shape is clickable and routes to the EXISTING `/turkiye` provinces hub —
 * `/dunya/turkiye` MUST NEVER EXIST, and TR must never be seeded as a country row.
 *
 * **Why it needs a guard rather than a comment.** A TR row would not fail anything. It would
 * insert cleanly (no constraint objects to it), serve a valid `/api/countries/turkiye` detail
 * payload, and the web repo would then statically generate `/dunya/turkiye` from it — a second,
 * thinner page competing with the real hub for exactly the query the hub exists to win. Nothing
 * in the pipeline would report an error; the only symptom is a duplicate page in the sitemap,
 * which is precisely the class of defect nobody notices until Google has.
 *
 * **The vectors this checks are IDENTITY and ROUTING keys, and only those:**
 *   - `isoCode` — the seed's unique key, the row's identity (`TR`, case-insensitively);
 *   - `isoCodeAlpha3` — the same identity in the other ISO 3166-1 alphabet (`TUR`);
 *   - `slugTr` / `slugEn` — the `/dunya/{slug}` routing keys, i.e. the literal page path. A row
 *     whose slug is `turkiye` (or `turkey`) IS the duplicate page, whatever it calls itself.
 *
 * The display NAMES (`nameTr`/`nameEn`) are deliberately NOT vectors. They are not identity and
 * not routing: a row named "Türkiye" carrying some other country's ISO code and slug is a
 * fact-check failure, not the IA collision this rule is about, and folding it in here would put
 * a content check in a routing guard. Keep the two concerns apart.
 */

/** ISO 3166-1 alpha-2 code of Türkiye — the row that must not exist. */
const TURKIYE_ALPHA2 = 'TR';
/** ISO 3166-1 alpha-3 code of Türkiye. */
const TURKIYE_ALPHA3 = 'TUR';
/** Slugs that would render as `/dunya/{slug}` and collide with the `/turkiye` hub. */
const TURKIYE_SLUGS: ReadonlySet<string> = new Set(['turkiye', 'turkey']);

export class TurkiyeCountryRowError extends Error {
  constructor(message: string) {
    super(`[seed:world] ${message}`);
    this.name = 'TurkiyeCountryRowError';
  }
}

/** Every reason a single seed row reads as Türkiye. Empty means the row is fine. */
function turkiyeVectors(seed: CountrySeed): string[] {
  const reasons: string[] = [];
  if (seed.isoCode.trim().toUpperCase() === TURKIYE_ALPHA2) {
    reasons.push(`isoCode ${JSON.stringify(seed.isoCode)}`);
  }
  if ((seed.isoCodeAlpha3 ?? '').trim().toUpperCase() === TURKIYE_ALPHA3) {
    reasons.push(`isoCodeAlpha3 ${JSON.stringify(seed.isoCodeAlpha3)}`);
  }
  for (const [field, slug] of [
    ['slugTr', seed.slugTr],
    ['slugEn', seed.slugEn],
  ] as const) {
    if (TURKIYE_SLUGS.has(slug.trim().toLowerCase())) {
      reasons.push(`${field} ${JSON.stringify(slug)}`);
    }
  }
  return reasons;
}

/**
 * Refuse any batch that would seed Türkiye as a country.
 *
 * Throws on the FIRST offending row rather than counting them: one is already a product-rule
 * violation, and the message has to name the row so the fix is obvious.
 *
 * Called from `seedWorld` — i.e. it sits on the WRITE path, not only over the committed corpus.
 * That placement is deliberate: `seedWorld` accepts an arbitrary list (the e2e suite and any
 * future partial re-seed pass their own), so a check that only ever ran over `SEED_COUNTRIES`
 * would guard the one caller that is already reviewed line by line and none of the others. The
 * corpus itself is additionally pinned by this module's unit spec, which needs no database and
 * therefore fails in the fast `Test (unit)` job rather than waiting for Testcontainers.
 */
export function assertNoTurkiyeCountryRow(countries: readonly CountrySeed[]): void {
  for (const seed of countries) {
    const reasons = turkiyeVectors(seed);
    if (reasons.length === 0) continue;

    throw new TurkiyeCountryRowError(
      `a country row identifies as Türkiye (${reasons.join(', ')}) — this is refused by product ` +
        `ruling (PR #23 M5). Türkiye is the site's own /turkiye provinces hub, and the world map ` +
        `links its shape there; a country row would statically generate a duplicate ` +
        `/dunya/turkiye page that competes with the hub, with no error anywhere in the ` +
        `pipeline. Remove the row — do not rename its slug to route around this check.`,
    );
  }
}
