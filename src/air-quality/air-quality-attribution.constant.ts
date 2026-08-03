import type { AirQualityAttributionDto } from './dto/air-quality-attribution.dto';

/**
 * The CAMS licence notice this leg must publish — DATA, not prose (SPEC §13.2).
 *
 * ## Why a code constant and not a seeded table (the M5 precedent, deliberately reused)
 * A missing attribution row is not a degraded widget, it is a **licence breach**. As a compiled
 * constant the breach is structurally impossible: the strings exist at compile time, they are
 * read in the diff, and the spec beside this file byte-pins them. The rows change only when a
 * licence changes — i.e. with a code change plus a fresh NOVA verification plus a
 * `data-provenance.md` entry. No operator ever edits them by hand. Consequence: A2b ships no
 * migration and no seed for attribution.
 *
 * ## Provenance, and the one-letter correction this file lands
 * NOVA read the primary licence texts first-hand (`Owner's Inbox/atif-dogrulama/brief.md` §3.2,
 * 2026-08-02) and Atlas ruled on them (DEC 2026-08-02c-1): the CAMS strings are APPROVED as they
 * stood, with exactly one correction — the licensor's own template writes a **lowercase**
 * `information`. A1's frozen DTO example carried `Information`; that capital is corrected here,
 * in `openapi/openapi.json` and in the fixture README, and pinned by a byte-for-byte test.
 * The binding basis is CC-BY-4.0 §3(a) plus the licensor's template (the licence actually
 * attached to the dataset is `cc-by` revision 1, three lines long) — not the "Licence to use
 * Copernicus Products" v1.2 / rev. 12 the A1 draft cited. Rev-12 names THAT document and nothing
 * else: the ADS **Terms of Use** are a separate document at v1.2 (March 2024), and it is the ADS
 * ToS — not the Products licence — whose art. 5 the no-endorsement paragraph below rests on
 * (review #84 cf-3, which found the two conflated here).
 *
 * `src/database/marine/probe-marine-cmems.ts`'s "Marine Service Information" is CMEMS's OWN
 * template, not this defect: it is quoted verbatim from the Copernicus Marine licence annex and
 * is deliberately out of A2b's scope.
 *
 * ## No endorsement, either direction (`CONVENTIONS.md` §7, from ADS ToS art. 5)
 * These strings state the SOURCE of the data. Nothing published from this module may read as
 * "Copernicus onaylı", "resmî AB verisi" or any other claim that a provider or the EU endorses
 * this platform. The spec beside this file runs the SHARED denylist of known endorsement
 * phrasings (`src/common/attribution/endorsement-guard.ts`, one copy for both the marine and air
 * legs) over every served string — which is not the same as proving non-endorsement, and the
 * earlier wording
 * here ("enforces that with a structural guard") claimed more than the guard delivers (review #84
 * cf-1). It catches the phrasings we have been warned about; a novel one still needs a human
 * reading the diff.
 *
 * ## The strings are LICENCE TEXT, so the tests pin them literally
 * The house rule is "tests assert structure, never facts". These two sentences are the recorded
 * exception (the W2a/M5 precedent): they are not a claim about the world, they ARE the artifact
 * under test — one changed letter breaks a licence condition. The exception is named in the
 * spec's own docblock so it can never be cargo-culted into a data test.
 */

/** Provider name, as the licensor writes it. */
export const CAMS_PROVIDER_NAME = 'Copernicus Atmosphere Monitoring Service (CAMS)';

/** The product these values come from. */
export const CAMS_PRODUCT_NAME = 'CAMS European air quality forecasts';

export const CAMS_DATASET_URL =
  'https://ads.atmosphere.copernicus.eu/datasets/cams-europe-air-quality-forecasts';

/** Measured on the dataset itself: the attached licence is `cc-by`, revision 1. */
export const CAMS_LICENCE_NAME = 'Creative Commons Attribution 4.0 International (CC-BY-4.0)';

export const CAMS_LICENCE_URL = 'https://creativecommons.org/licenses/by/4.0/';

/**
 * The required attribution line, minus its year — LOWERCASE `information` (DEC 2026-08-02c-1).
 *
 * Split out so the byte-pin test can assert the invariant half once, and the year branch
 * separately, without a template literal hiding a typo inside an interpolation.
 */
export const CAMS_ATTRIBUTION_TEXT_PREFIX =
  'Contains modified Copernicus Atmosphere Monitoring Service information';

/**
 * The required attribution line for one data year.
 *
 * ## Which year, and why the cold path still publishes one
 * The year is the year of the model RUN behind the response (its UTC year). `attributionText` is
 * non-nullable in the frozen A1 contract, so unlike ECMWF's copyright line it cannot be omitted
 * on the cold path; Atlas ruled (A2b plan Q8) that a run-less response uses the current UTC year.
 * That is defensible precisely because a cold response publishes NO Copernicus material — the
 * sentence has no material to qualify, so the year cannot misdescribe anything.
 */
export function buildCamsAttributionText(dataYear: number): string {
  return `${CAMS_ATTRIBUTION_TEXT_PREFIX} ${String(dataYear)}`;
}

/** The required disclaimer. Carries no year, so it is identical on every response. */
export const CAMS_DISCLAIMER_TEXT =
  'Neither the European Commission nor ECMWF is responsible for any use that may be made of ' +
  'the Copernicus information or data it contains.';

/**
 * i18n KEYS for the editorial notices the web repo authors (SPEC §11.4 — the API ships keys,
 * never texts).
 *
 * A1 froze the FIELD and shipped it empty; A2b publishes the first real keys (Atlas ruling Q2:
 * the OpenAPI source owns the names, the web pairs against them at the air-web PR). The three
 * chosen keys are exactly the three honest-presentation duties SPEC §13.1 puts on the renderer:
 *
 * 1. these numbers are MODEL OUTPUT, never a station reading (the analysis half included);
 * 2. the value belongs to a ~0.1° (~11 km) grid cell, so street-level differences are below the
 *    resolution by construction;
 * 3. the category names are OUR translation of the EEA's English tokens.
 *
 * A fourth candidate — a dedicated `noEndorsement` notice — was deliberately NOT added: the
 * `CONVENTIONS.md` §7 rule binds what the web may write, and does not require its own notice
 * slot. Adding a key nobody renders would be a contract promise with no consumer.
 *
 * Adding a key is additive; REMOVING or renaming one is a breaking contract change (Atlas).
 */
export const CAMS_NOTICE_KEYS: readonly string[] = [
  'airQuality.notice.modelOutput',
  'airQuality.notice.gridResolution',
  'airQuality.notice.categoryTranslation',
];

/**
 * The `attribution` object for one response.
 *
 * Published on EVERY response, cold included: the notice attaches to the published SECTION, not
 * to whether a particular value resolved (the M5 reasoning, DEC 2026-08-02g §3). A notice that
 * blinks in and out with provider health is exactly what a "shall be attached" clause forbids.
 *
 * @param dataYear UTC year of the model run behind this response, or the current UTC year when
 *   the response carries no run at all (see {@link buildCamsAttributionText}).
 */
export function buildCamsAttribution(dataYear: number): AirQualityAttributionDto {
  return {
    providerName: CAMS_PROVIDER_NAME,
    productName: CAMS_PRODUCT_NAME,
    datasetUrl: CAMS_DATASET_URL,
    licenceName: CAMS_LICENCE_NAME,
    licenceUrl: CAMS_LICENCE_URL,
    attributionText: buildCamsAttributionText(dataYear),
    disclaimerText: CAMS_DISCLAIMER_TEXT,
    // A copy per response: the DTO is handed to the serializer, and a shared frozen array would
    // make any future mutation by a consumer a cross-request bug.
    noticeKeys: [...CAMS_NOTICE_KEYS],
  };
}
