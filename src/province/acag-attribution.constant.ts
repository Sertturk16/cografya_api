import type { Pm25AttributionDto } from './dto/pm25-attribution.dto';

/**
 * The ACAG licence notice this line must publish — DATA, not prose.
 *
 * ## Why a code constant and not a seeded table (the CAMS/M5 precedent, deliberately reused)
 * A missing attribution row is not a degraded widget, it is a **licence breach**. As a compiled
 * constant the breach is structurally impossible: the strings exist at compile time, they are read
 * in the diff, and the spec beside this file byte-pins them. They change only when a licence
 * changes — i.e. a code change plus a fresh NOVA verification plus a `provenance/datasets.md`
 * entry. No operator ever edits them by hand, and no migration or seed carries them.
 *
 * ## Provenance: every element below was established FIRST-HAND, and one of them is derived
 * NOVA rebuilt the attribution elements for V6.GL.03 against the provider's own page
 * (`provenance/datasets.md`, "ATIF ÖĞELERİ — V6.GL.03", 2026-08-19). The measurement that matters:
 * the V6.GL.03 page carries **no RDFa attribution markup at all** (`cc:attributionURL` → 0,
 * `cc:attributionName` → 0, `dct:title` → 0; positive control "licensed under" → 1). So unlike
 * V6.GL.02.04 — where the provider itself published a machine-readable title and URL — nothing
 * here can be copied from a chooser blob, and each element is sourced individually:
 *
 * - {@link ACAG_WORK_TITLE} — PROVIDER, verbatim, from the licence sentence itself.
 * - {@link ACAG_DATASET_URL} — PROVIDER: the page's own `og:url`.
 * - {@link ACAG_LICENCE_URL} — PROVIDER: the `<a href>` inside that licence sentence.
 * - {@link ACAG_PROVIDER_NAME} — **DERIVED, not on the version page.** "Atmospheric Composition
 *   Analysis Group" appears 0 times at satpm.org/v6-gl-03 (positive control "Washington
 *   University" → 1). The verbatim institution name comes from ACAG's own site title, and the
 *   link between the two sites is the provider's own navigation menu.
 * - {@link ACAG_REFERENCE_CITATION} — PROVIDER, verbatim, from the page's "Reference:" block.
 *
 * ## ⚠️ THE SUBSCRIPTS ARE PART OF THE QUOTE
 * The provider writes PM₂.₅ with Unicode subscripts (U+2082, U+2085). Flattening them to ASCII
 * "PM2.5" makes the quote no longer verbatim, which is exactly what a licence condition forbids.
 * The spec beside this file asserts the code points, not just the visible text — a reviewer
 * cannot see the difference by eye, so a machine has to.
 *
 * ## No endorsement, either direction (`CONVENTIONS.md` §7)
 * These strings state the SOURCE of the data. Nothing published from this line may read as
 * "ACAG onaylı", "Washington Üniversitesi iş birliğiyle" or any other claim that the provider
 * endorses this platform. The spec runs the SHARED denylist
 * (`src/common/attribution/endorsement-guard.ts`) over every served string — which is not the
 * same as proving non-endorsement: it catches the phrasings we have been warned about, and a
 * novel one still needs a human reading the diff.
 *
 * ## The strings are LICENCE TEXT, so the tests pin them literally
 * The house rule is "tests assert structure, never facts". These sentences are the recorded
 * exception (the W2a/M5/CAMS precedent): they are not a claim about the world, they ARE the
 * artifact under test — one changed letter breaks a licence condition.
 */

/**
 * The institution, as it writes its own name. Derived from ACAG's site title rather than the
 * version page (see the docblock) — the one element here that is not on satpm.org.
 */
export const ACAG_PROVIDER_NAME =
  'Atmospheric Composition Analysis Group, Washington University in St. Louis';

/**
 * The work title, PROVIDER-VERBATIM from the licence sentence: "SatPM₂.₅ V6.GL.03 are licensed
 * under CC BY 4.0".
 *
 * Note the V6.GL.02.04 sentence said "SatPM2.5 **data** V6.GL.02.04 are licensed…" — the word
 * "data" is absent in this version, and the page's own `<title>` uses a third form ("SatPM
 * V6.GL.03", no subscripts). The licence sentence wins because it is the sentence that names the
 * licensed work.
 */
export const ACAG_WORK_TITLE = 'SatPM₂.₅ V6.GL.03';

/**
 * The dataset version this line publishes. Pinned by DEC 2026-08-19f.
 *
 * **THIS IS THE SINGLE SOURCE of the version identity for the whole line** (review CODE123-I1 /
 * SFH123-I1). It was previously declared three times — here, as `ACAG_PINNED_DATASET_VERSION` in
 * the assertions, and implicitly inside the S3 key prefix and file-name builders — with nothing
 * binding them. The failure that mattered was not theoretical: on the next annual refresh an
 * operator bumps whatever the download needs in `src/database/acag/`, every assertion passes
 * (A-06 compares the two artifacts against the same bumped constant, so it cannot see this file),
 * and all 81 indexable pages then serve new numbers under a CC BY block naming the OLD licensed
 * work, beside a provider caveat quoted verbatim for a version whose wording the ledger records
 * as different. The import line now imports this constant, derives its file-name token from it,
 * and the LOAD GATE refuses an artifact whose version/URL disagree with it.
 */
export const ACAG_DATASET_VERSION = 'V6.GL.03';

/**
 * The provider's version landing page — its own `og:url`.
 *
 * Also single-sourced: the fetch phase writes it into the manifest and the load phase publishes
 * it as `pm25Annual.sourceUrl`, so both sides of the served object now trace to this line.
 */
export const ACAG_DATASET_URL = 'https://www.satpm.org/v6-gl-03';

/**
 * The licence name — a COMPOSITION, not a single verbatim quote, and the one string in this file
 * that is (review CODE123-M3).
 *
 * Both halves are the licensor's own naming, joined in the conventional way:
 * - `Creative Commons Attribution 4.0 International` is the licence's full name as the AWS
 *   Registry of Open Data record for this dataset states it (`provenance/datasets.md`, ACAG row,
 *   "İKİNCİ BİRİNCİL TEYİT" segment);
 * - `CC BY 4.0` is the short form the provider's own licence sentence uses ("…are licensed under
 *   CC BY 4.0", same ledger row, "ATIF ÖĞELERİ — V6.GL.03").
 *
 * The joined form appears in neither source, so it is labelled here rather than presented as a
 * quotation. It names the licence; it is not part of the attribution the licence *requires*
 * (that is {@link ACAG_WORK_TITLE} + {@link ACAG_LICENCE_URL} + the citation).
 */
export const ACAG_LICENCE_NAME = 'Creative Commons Attribution 4.0 International (CC BY 4.0)';

/** The exact href the provider's licence sentence links to, chooser query string included. */
export const ACAG_LICENCE_URL = 'https://creativecommons.org/licenses/by/4.0/?ref=chooser-v1';

/**
 * The provider's own reference format, VERBATIM: authors separated by full stops, title unquoted.
 *
 * Deliberately NOT the format in the ledger's older "ATIF YÜKÜMLÜLÜĞÜ" segment (commas between
 * authors, title in quotes). That segment predates this version and also covers NO₂; where the
 * two disagree, the provider's own V6.GL.03 block binds (ledger, "ATIF ÖĞELERİ — V6.GL.03").
 */
export const ACAG_REFERENCE_CITATION =
  'Shen, S. Li, C. van Donkelaar, A. Jacobs, N. Wang, C. Martin, R. V.: Enhancing Global ' +
  'Estimation of Fine Particulate Matter Concentrations by Including Geophysical a Priori ' +
  'Information in Deep Learning. (2024) ACS ES&T Air. DOI: 10.1021/acsestair.3c00054';

export const ACAG_REFERENCE_URL = 'https://pubs.acs.org/doi/full/10.1021/acsestair.3c00054';

/**
 * The provider's OWN caveat about its resolution — MANDATORY on every published figure.
 *
 * Verbatim from the V6.GL.03 page (the version we publish). The V6.GL.02.04-era wording differs in
 * three places ("due to influence by" → "due to the influence of", an added comma, and two extra
 * sentences); publishing the older wording beside V6.GL.03 numbers would be a misquote. NOVA
 * measured both, with a positive control, before this string was written.
 *
 * Why it ships at all: the grid is 1 km, but the provider says plainly that not every 1 km square
 * is independently resolved. Hiding that would repeat exactly the disclosure failure the
 * MGM→ERA5-Land migration established discipline against.
 */
export const ACAG_METHOD_NOTICE_TEXT =
  'Note that these estimates are primarily intended to aid in large-scale studies. Annual and ' +
  'coarse-resolution averages correspond to a simple mean of within-grid values. Gridded ' +
  'datasets are provided to allow users to agglomerate data as best meets their particular ' +
  'needs. High-resolution (0.01° × 0.01°) datasets are gridded at the finest ' +
  'resolution of the information sources that were incorporated, but are unlikely to fully ' +
  'resolve PM₂.₅ gradients at the gridded resolution due to the influence of ' +
  'information sources at coarser resolution.';

/**
 * i18n KEYS for the editorial notices the WEB repo authors (the api ships keys, never texts).
 *
 * The four are the honest-presentation duties this payload puts on the renderer:
 * 1. these numbers are satellite-derived + model + ground-calibrated, never a station reading;
 * 2. the value belongs to one ~1 km cell, and the provider's own caveat travels with it;
 * 3. the value is read at the PROVINCE CENTRE — it is not a provincial average (the single most
 *    likely misreading, and the one the owner's ruling makes structural);
 * 4. it is an ANNUAL MEAN, not "today's air".
 *
 * Adding a key is additive; REMOVING or renaming one is a breaking contract change (Atlas).
 */
export const ACAG_NOTICE_KEYS: readonly string[] = [
  'airPollution.notice.satelliteDerived',
  'airPollution.notice.gridResolution',
  'airPollution.notice.provinceCentrePoint',
  'airPollution.notice.annualMean',
];

/**
 * The `attribution` object for one province payload.
 *
 * Published whenever the section is published — the notice attaches to the SECTION, not to a
 * particular value. A copy of the key array per call: the DTO is handed to the serializer, and a
 * shared frozen array would make any future mutation by a consumer a cross-request bug.
 */
export function buildAcagAttribution(): Pm25AttributionDto {
  return {
    providerName: ACAG_PROVIDER_NAME,
    workTitle: ACAG_WORK_TITLE,
    datasetVersion: ACAG_DATASET_VERSION,
    datasetUrl: ACAG_DATASET_URL,
    licenceName: ACAG_LICENCE_NAME,
    licenceUrl: ACAG_LICENCE_URL,
    referenceCitation: ACAG_REFERENCE_CITATION,
    referenceUrl: ACAG_REFERENCE_URL,
    methodNoticeText: ACAG_METHOD_NOTICE_TEXT,
    noticeKeys: [...ACAG_NOTICE_KEYS],
  };
}
