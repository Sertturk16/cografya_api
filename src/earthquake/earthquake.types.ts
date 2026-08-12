/**
 * Shared earthquake vocabulary — the closed sets the entities, the DTOs, the (E2) ingest and
 * the OpenAPI contract all read from.
 *
 * The contract ships in `openapi/openapi.json` in PR E1 (the "contract PR", SPEC §16) so the web
 * repo can codegen and build against a mock while E2 lands the ingest and E3 the public
 * endpoints. Everything here is FROZEN at E1: a change to any value below is a BREAKING contract
 * change and goes to Atlas (playbook §4) — including ADDING a member, because a new member can
 * break an exhaustive `switch` in the consumer. SPEC §15 names the two highest-risk sets: this
 * file holds both ({@link MagnitudeType}, {@link EarthquakeBindingKind}).
 *
 * One file on purpose, like `marine.types.ts` and `air-quality.types.ts`: a set duplicated
 * between an entity and a DTO is exactly how a token ends up spelled two ways.
 *
 * **Nothing here is future-tense.** There is no prediction, probability, risk-score, alert-level
 * or "expected" token in this leg and there never will be: DEC 2026-07-30k and `QUESTIONS.md`
 * D-6 make the early-warning implication a RULING, not a UI preference (SPEC §9.2).
 */

/**
 * The provider a row came from — part of the natural key `(provider, provider_event_id)`.
 *
 * AFAD is the SOLE Faz-1 source and Kandilli is out of scope (DEC 2026-07-30k). The column
 * exists anyway because a second source would otherwise have no place to live except a table
 * rename: the discriminator is cheap now and structural later. It is deliberately NOT published
 * in any DTO — the reader is told the source through the attribution, not through a token.
 */
export const EARTHQUAKE_PROVIDER_AFAD = 'afad';

/** @see EARTHQUAKE_PROVIDER_AFAD */
export type EarthquakeProvider = typeof EARTHQUAKE_PROVIDER_AFAD;

/**
 * How the magnitude was computed — the NORMALISED token we publish.
 *
 * `GLOSSARY.md` §4 `büyüklük türü` / magnitude type. The same earthquake yields different
 * numbers under different methods, which is why `QUESTIONS.md` D-5 requires the type to be
 * stored AND shown rather than silently dropped.
 *
 * The provider's own casing is INCONSISTENT — `ML` (625), `MW` (5) and `Md` (the 1999 row) were
 * all measured on 2026-08-11 (SPEC §3.9), while its documentation lists `ML Ms mb md Mw Ml MS
 * Mwp`. Normalisation is therefore case-insensitive and the raw string is kept beside the token
 * (`magnitude_type_raw` / `magnitudeTypeRaw`), so our normalisation can never be a lossy
 * one-way door.
 *
 * **`Other` is part of the contract, not an escape hatch** (SPEC §5.3). Mapping one-to-one onto
 * a closed set would drop an entire ingest tour into `schema_error` the day AFAD publishes a
 * type we have not seen — i.e. the provider adding a method would darken our page. A row that
 * lands on `Other` is logged at warning level and still published.
 */
export enum MagnitudeType {
  /** Local ("Richter-class") magnitude. 625 of 630 measured events. */
  Ml = 'ML',
  /** Moment magnitude. */
  Mw = 'Mw',
  /** Surface-wave magnitude. */
  Ms = 'Ms',
  /** Body-wave magnitude. Lower-case by convention, and deliberately kept so. */
  Mb = 'mb',
  /** Duration magnitude. */
  Md = 'Md',
  /** Moment magnitude from P-waves. */
  Mwp = 'Mwp',
  /** A type outside the set above, published rather than rejected. See the class note. */
  Other = 'other',
}

/**
 * HOW an event relates to the province it is filed under — a mandatory, non-nullable token.
 *
 * This exists because of a measured provider behaviour, not a hypothetical one: AFAD's
 * `province` field is **the nearest TURKISH province, not the province the event happened in**
 * (SPEC §3.5). All 15 of the 630 measured events outside Türkiye still carried a full
 * `province` — an Iranian event as `Ağrı`, an Azerbaijani one 137 km away as `Iğdır`. Publishing
 * the latter on the Iğdır page as "an earthquake in Iğdır" is a FACTUAL error and is exactly
 * what `QUESTIONS.md` D-1 forbids.
 *
 * So the contract carries the plate code AND this token, and the web repo builds the sentence
 * from both. The API never emits a sentence of the form "an earthquake occurred in X"
 * (SPEC §5.4). The field is non-nullable so a consumer cannot ignore it by accident.
 */
export enum EarthquakeBindingKind {
  /** Inside Türkiye: `country === 'Türkiye'` and an unbracketed `location`. */
  Inside = 'inside',
  /** Offshore or on a lake/reservoir near the province — a province CONTEXT, not a location. */
  OffshoreNear = 'offshore_near',
  /** In another country; the province name is cited only for proximity. */
  AcrossBorder = 'across_border',
}

/**
 * Whether the served snapshot can be trusted, and how far.
 *
 * Structural only — the API carries no reader-facing sentence about freshness. D-F ruled that
 * the reader is told an ABSOLUTE timestamp plus the data's age, never a standing promise like
 * "updated every 5 minutes": a fixed promise turns into a lie the moment the provider goes
 * quiet, and `CONTENT-STYLE.md` §22 separately bars leaking internal state. The web repo picks
 * the wording from this token plus `dataUpdatedAtUtc` / `latestEventAtUtc`.
 */
export enum EarthquakeDataStatus {
  /** A recent successful ingest backs this response. */
  Ok = 'ok',
  /** The store is populated but the last successful contact is older than the staleness budget. */
  Stale = 'stale',
  /** No usable ingest at all (cold store). The response is still 200 with an empty list. */
  Unavailable = 'unavailable',
}

/**
 * Which of the two ingest cadences produced a run (SPEC §7.2) — stored, never published.
 *
 * Two cadences rather than one because the revision window is measured in MINUTES for small
 * events and in DAYS for large ones: Pazarcık M7.7 was revised 8.5 hours later and Elbistan M7.6
 * three days later (SPEC §3.8). A single short polling window would miss precisely the rows that
 * are read the most.
 */
export enum EarthquakeIngestJobKind {
  /** The frequent, narrow-window tour that picks up new events. */
  Recent = 'recent',
  /** The infrequent, wide-window tour that catches late revisions. */
  Reconcile = 'reconcile',
}
