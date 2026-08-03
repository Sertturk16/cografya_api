import type { MarineAttributionDto } from './dto/marine-attribution.dto';

/**
 * The two licence notices the marine value endpoints must publish, and the pure function that
 * resolves ECMWF's year-dependent copyright line.
 *
 * ## Why this is a code constant and NOT a table (deliberate SPEC deviation, Atlas-approved)
 * SPEC-ADDENDUM §7.14 says the attribution rows are "seeded". This module deviates on purpose
 * (M5 plan §2, Atlas ruling DEC 2026-08-02h S1) and follows the `MARINE_LAYER_CATALOGUE`
 * precedent instead. The decisive argument is the FAILURE MODE, not the row count:
 *
 * - A missing or empty attribution row is not a broken widget — it is a **licence breach**. If
 *   the rows lived in Postgres, a database that was never seeded (or was seeded and later
 *   truncated) would serve real ECMWF- and CMEMS-derived values with NO notice attached, 200 OK,
 *   and nothing would surface it. The `marine_points` guard exists precisely because that class
 *   of silent empty-table deploy is real here.
 * - As a compiled constant the breach is structurally impossible: the rows exist at compile
 *   time, they are read in the diff, and `marine-attribution-catalogue.spec.ts` byte-pins them.
 * - The rows change only when a licence changes — i.e. with a code change plus a fresh NOVA
 *   verification plus a `data-provenance.md` entry. No operator ever edits them by hand.
 *
 * Consequence: M5 ships **no migration and no seed**.
 *
 * ## The strings are the LICENCE, not copy (→ DEC 2026-08-02c, NOVA `atif-dogrulama/brief.md`)
 * ECMWF's terms say the wording "shall be attached", quote it, and — unlike the Copernicus
 * framework — offer NO "or any similar notice" escape. So `requiredNoticeEn` and `disclaimerEn`
 * are published verbatim, in English, in both locales. Shortening, restyling, reordering or
 * translating any of it is a breach. That is why the spec byte-pins them: the house rule
 * "tests assert structure, never facts" is deliberately excepted here, because these strings
 * are not a claim about the world — they ARE the artifact under test (M5 plan §10, W2a
 * precedent DEC 2026-08-02g §1).
 *
 * `explanationTr` is the informational Turkish rendering. It stands ALONGSIDE the English
 * notice and can never replace it; the field name says so, and the DTO description repeats it.
 *
 * ## No endorsement, either direction (`CONVENTIONS.md` §7, from ADS ToS art. 5)
 * These rows state the SOURCE of the data. Nothing here may read as "ECMWF onaylı", "resmî
 * Copernicus verisi" or any other claim that a provider or the EU endorses this platform. The
 * spec beside this file runs the SHARED denylist of known endorsement phrasings
 * (`src/common/attribution/endorsement-guard.ts`, one copy for both the marine and air legs)
 * over every served string — which is not the same as proving non-endorsement. The earlier
 * wording here ("enforces that with a structural guard") claimed more than the guard delivers:
 * it catches the phrasings we have been warned about; a novel one still needs a human reading
 * the diff. (Review #84 cf-1 corrected the air-quality twin of this sentence and #85 I2 caught
 * that this copy had been left behind.)
 *
 * ## Provenance of every string below
 * - ECMWF (`requiredNoticeEn`, `disclaimerEn`, `explanationTr`): NOVA brief §3.1, read
 *   first-hand from `https://apps.ecmwf.int/datasets/licences/general/` on 2026-08-02. The
 *   notice deliberately merges the licence's list (A) copyright line with its list (B) service
 *   sentence — the conservative reading, since the licence does not say which list binds a
 *   service built on the data (NOVA §1.2). Its PUNCTUATION follows the licence itself rather
 *   than the brief's §3.1 composition step: the licence writes `Source www.ecmwf.int` with no
 *   colon, and closes the licence statement with a period before the CC URL. The brief's own
 *   verbatim transcription (§1.2) has both; the composed §3.1 string drifted, and §4.1 plus
 *   DEC 2026-08-02c say the English sentence stays *birebir* (review #83 I2a). The Turkish
 *   rendering keeps `Kaynak:` — brief §4.3 sanctions that, because the Turkish text is
 *   informational and is not the notice that discharges the obligation.
 * - CMEMS (`requiredNoticeEn`): quoted from the `ATTRIBUTION_REQUIREMENT` constant in
 *   `src/database/marine/probe-marine-cmems.ts`, which the M4a probe recorded from the licence
 *   annex (page fetched HTTP 200, body SHA-256 pinned in `data/marine/marine-cmems-probe.json`).
 *   Read the provenance precisely: the probe's `quoteVerified` flag covers the four
 *   COMMERCIAL-USE fragments only. `ATTRIBUTION_REQUIREMENT` is a hardcoded constant that the
 *   probe writes into every record WITHOUT re-checking it against the fetched page, so it is
 *   not a verification badge for this notice (review #83 I2c).
 *   The clause obliges us to credit the originator AND cite the DOIs "in the following manner:
 *   '<template>'" — one construction, whose halves the licensor's own template operationalises.
 *   We publish that template, so the "originator" half is discharged by the same sentence; its
 *   trailing "; insert DOIs links here" is dropped because the DOIs are deliberately NOT served
 *   (see `doi` below).
 * - CMEMS `licenceName` / `licenceUrl`: the same probe artifact (`licencePageTitle` /
 *   `licencePageUrl`, HTTP 200 + SHA-256 recorded). The STAC `license` field says
 *   `proprietary`, which is why the URL is mandatory rather than decorative.
 * - CMEMS `explanationTr`: the Turkish half of `cografya_web`'s `sourceCmemsNoticeIntro`
 *   (web PR #36), with the English service name restored INSIDE the sentence. Brief §4.3 scopes
 *   its rule to *"TR metinde"* — the English proper name must appear in the Turkish text — and
 *   the web sentence carried it in a leading clause this standalone row does not have. Without
 *   it the row credits "Avrupa Birliği Copernicus Deniz Hizmeti", an institution that does not
 *   exist under that name (review #83 I2b).
 * - Parity with `cografya_web` (checked 2026-08-02 against `messages/{tr,en}.json`): every
 *   string matched the web's copy when this module was written. Two deliberately do NOT match
 *   it any more — the ECMWF English notice (I2a) and the CMEMS `explanationTr` (I2b). Both
 *   corrections land here first; Atlas coordinates the matching web change. This module becomes
 *   the single source at W2d; until then each side is byte-pinned by its own tests, so the
 *   divergence cannot spread silently.
 */

/** The `attributionId` values `MARINE_LAYER_CATALOGUE` points at. Kept narrow internally. */
export type MarineAttributionProviderId = 'ecmwf' | 'cmems';

/**
 * ECMWF's mandatory service sentence, plus source, licence and modification notice.
 *
 * Carries NO year, so it is published on every response — including the cold one where no
 * cycle has been ingested and there is therefore no data year to state.
 *
 * Punctuated as the licence punctuates it: `Source www.ecmwf.int` (element 2 carries no colon)
 * and a period, not a comma, closing element 3 before the CC URL. See the provenance block
 * above — this is the *birebir* obligation, and the two characters are not ours to restyle.
 */
const ECMWF_SERVICE_NOTICE_EN =
  'This service is based on data and products of the European Centre for Medium-Range ' +
  'Weather Forecasts (ECMWF). Source www.ecmwf.int. This ECMWF data is published under a ' +
  'Creative Commons Attribution 4.0 International (CC BY 4.0). ' +
  'https://creativecommons.org/licenses/by/4.0/. Modified: values are sampled from the ' +
  'source grid to selected points; no other modification.';

/**
 * ECMWF's required notice for a given data year.
 *
 * `dataYear === null` **omits the copyright line rather than faking one**. The licence asks for
 * `© [year]`, where the year is the year the DATA belongs to (NOVA §5, "Yıl semantiği"); with
 * no ingested cycle there is no such year, and inventing the wall-clock year would be a false
 * statement about the material. The mandatory service sentence carries no year and always
 * ships, so the response is never unattributed. This is the same branch `cografya_web` renders
 * today (`marine-attribution.tsx`).
 */
export function buildEcmwfRequiredNotice(dataYear: number | null): string {
  if (dataYear === null) return ECMWF_SERVICE_NOTICE_EN;
  return (
    `Copyright © ${String(dataYear)} European Centre for Medium-Range Weather Forecasts ` +
    `(ECMWF). ${ECMWF_SERVICE_NOTICE_EN}`
  );
}

/** CMEMS's whole obligation, in one sentence. No year: it attaches to the SERVICE, not a run. */
const CMEMS_REQUIRED_NOTICE_EN = 'Generated using E.U. Copernicus Marine Service Information';

/**
 * One row's licence-fixed half — everything the copyright year does not touch.
 *
 * `doi` and `productTitle` are typed as the literal `null` on purpose: they are not "unset yet",
 * they are decided (see the DTO field descriptions), and the literal type means adding a value
 * later is a conscious type change rather than an edit nobody notices.
 */
interface MarineAttributionSource {
  readonly providerId: MarineAttributionProviderId;
  readonly providerName: string;
  readonly licenceName: string;
  readonly licenceUrl: string;
  /**
   * Builds the verbatim required notice from the response's own data year. A function rather
   * than a string because ECMWF's notice carries a copyright year and CMEMS's does not — the
   * asymmetry belongs to the provider, so it lives per row instead of as a branch at the
   * call site.
   */
  readonly buildRequiredNoticeEn: (dataYear: number | null) => string;
  /** ECMWF requires one; the Copernicus Marine licence does not impose one. */
  readonly disclaimerEn: string | null;
  readonly explanationTr: string;
  readonly doi: null;
  readonly productTitle: null;
}

/**
 * The catalogue. Exactly two rows, and BOTH are served on every value response — see
 * {@link buildMarineAttributions}.
 */
export const MARINE_ATTRIBUTIONS: readonly MarineAttributionSource[] = [
  {
    providerId: 'ecmwf',
    providerName: 'European Centre for Medium-Range Weather Forecasts (ECMWF)',
    licenceName: 'Creative Commons Attribution 4.0 International (CC BY 4.0)',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    buildRequiredNoticeEn: buildEcmwfRequiredNotice,
    disclaimerEn:
      'ECMWF does not accept any liability whatsoever for any error or omission in the data, ' +
      'their availability, or for any loss or damage arising from their use.',
    explanationTr:
      "Bu servis, Avrupa Orta Vadeli Hava Tahminleri Merkezi'nin (ECMWF) veri ve ürünlerine " +
      'dayanmaktadır. Kaynak: www.ecmwf.int. Veri, Creative Commons Attribution 4.0 ' +
      'International (CC BY 4.0) lisansıyla yayımlanmaktadır. Coğrafya tarafından yapılan ' +
      'değişiklik: değerler kaynak ızgaradan seçilen noktalara örneklenmiştir. ECMWF; ' +
      'verideki hata veya eksikliklerden, verinin erişilebilirliğinden ya da kullanımından ' +
      'doğabilecek hiçbir zarardan sorumluluk kabul etmez.',
    doi: null,
    productTitle: null,
  },
  {
    providerId: 'cmems',
    // The name the mandated notice itself uses, and the one `data-provenance.md` records
    // (Atlas ruling DEC 2026-08-02h S9) — not the shorter "Copernicus Marine Service".
    providerName: 'E.U. Copernicus Marine Service',
    licenceName: 'Copernicus Marine Service Commitments and Licence',
    licenceUrl: 'https://marine.copernicus.eu/user-corner/service-commitments-and-licence',
    buildRequiredNoticeEn: () => CMEMS_REQUIRED_NOTICE_EN,
    disclaimerEn: null,
    // The English service name stays INSIDE the Turkish sentence (brief §4.3, "TR metinde"),
    // exactly as the ECMWF row carries "(ECMWF)": it is the credited party's real name, and
    // the Turkish gloss alone would credit a body that does not exist under that name.
    explanationTr:
      'Avrupa Birliği Copernicus Deniz Hizmeti (E.U. Copernicus Marine Service) bilgileri ' +
      'kullanılarak üretilmiştir.',
    doi: null,
    productTitle: null,
  },
];

/**
 * The `attributions` array for one value response.
 *
 * ## Always BOTH rows, even when `dataAvailable` is false (M5 plan §5)
 * DEC 2026-08-02g §3 separates the "which provider supplied this number" credit — which the
 * per-field `source` already carries — from the LICENCE NOTICE, which is attached to the
 * published section as a whole. A cold response still renders the marine section, so it still
 * carries the notice. Narrowing the array to "providers that answered" would make the notice
 * blink in and out with provider health, which is exactly what "shall be attached" forbids.
 *
 * @param ecmwfDataYear UTC year of the newest ECMWF cycle behind THIS response, or `null` when
 *   the response publishes no ECMWF reading at all.
 */
export function buildMarineAttributions(ecmwfDataYear: number | null): MarineAttributionDto[] {
  return MARINE_ATTRIBUTIONS.map((source) => ({
    providerId: source.providerId,
    providerName: source.providerName,
    licenceName: source.licenceName,
    licenceUrl: source.licenceUrl,
    requiredNoticeEn: source.buildRequiredNoticeEn(ecmwfDataYear),
    disclaimerEn: source.disclaimerEn,
    explanationTr: source.explanationTr,
    doi: source.doi,
    productTitle: source.productTitle,
  }));
}
