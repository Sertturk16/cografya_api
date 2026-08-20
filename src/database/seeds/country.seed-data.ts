import { Continent } from '../../common/continent.enum';
import { CountryEntityType } from '../../common/country-entity-type.enum';
import { AFRICA_COUNTRIES } from './countries/africa.countries';
import { AMERICAS_COUNTRIES } from './countries/americas.countries';
import { ASIA_COUNTRIES } from './countries/asia.countries';
import { EUROPE_OCEANIA_COUNTRIES } from './countries/europe-oceania.countries';
import { SOVEREIGNTY_COUNTRIES } from './countries/sovereignty.countries';
import { TERRITORY_COUNTRIES } from './countries/territories.countries';
import { TURKIYE_COUNTRY } from './countries/turkiye.countries';

/**
 * Shape of one seeded country. The IDENTITY fields (isoCode, TR+EN name, both slugs,
 * continent) are required — they are known for every country up front from the
 * authoritative source. Every RESEARCH-DERIVED field is optional (`?: T | null`): the
 * base-data wave provides the numeric/identity core, and later fact-checked content
 * waves fill the narrative/detail fields per country (an unverified fact stays absent,
 * never invented — CLAUDE §5). An absent (undefined) optional field reads as "not
 * authored yet" and is normalised to null against the DB in `seed-world.ts`, so an
 * absent-in-seed vs null-in-DB pair is a no-op that keeps `updated_at` frozen on
 * re-seed (SEO lastmod honesty).
 *
 * `neighborIsoCodes` is required (not optional): an empty array is the correct,
 * explicit state for an island nation ("no land neighbour"), mirroring the entity's
 * NOT-NULL `'{}'` default — it is never "unknown".
 *
 * TWO OPTIONAL FIELDS HAVE NO `null` MEMBER, and the asymmetry is deliberate. Their DB
 * columns are NOT NULL with a default (`entity_type` → `'country'`, `area_is_approximate`
 * → `false`), so an explicit `null` would be a constraint violation waiting to happen —
 * `normalizeSeed` resolves both to their non-null default instead of to `null`. Making them
 * REQUIRED was the other option and was rejected: it would force a mechanical edit on all
 * 196 existing rows and bury the wave's real content in a diff nobody can review.
 */
export interface CountrySeed {
  /** ISO 3166-1 alpha-2 — UPPERCASE, exactly 2 letters (see entity seed discipline). */
  isoCode: string;
  nameTr: string;
  nameEn: string;
  slugTr: string;
  slugEn: string;
  continent: Continent;
  neighborIsoCodes: string[];
  /** Absent = `country` (see `resolveEntityType`, the single source of that default). */
  entityType?: CountryEntityType;
  /** Approved card subtitle; NULL on a `country` row, required on any other (guard 2). */
  statusLabelTr?: string | null;
  statusLabelEn?: string | null;
  /** Absent = the area figure is exact. See the entity for why this flag exists. */
  areaIsApproximate?: boolean;
  isoCodeAlpha3?: string | null;
  unSubregionTr?: string | null;
  population?: number | null;
  populationYear?: number | null;
  /**
   * Nüfus kaynağı override (TR/EN) — absent on ~193 of the corpus's 199 seeded rows (service
   * resolves the corpus default, "Dünya Bankası" / "the World Bank"); populated only on the
   * five rows whose `population` was NOT published by the World Bank (GL, CY, QN, TW, TR —
   * see the file header PROVENANCE block). ALWAYS both-or-neither (guard rule 10, leg 1) and
   * NEVER set on a row whose `population` is absent (guard rule 10, leg 2 — AQ).
   *
   * Values are transcribed from the actual records, not from `provenance/territories.md` —
   * that file is a short ROUTER with no institution names in it (see its own text). The real
   * records are `provenance/legacy/data-provenance-pre-split-2026-08-06.md` (GL L1661, TR
   * L1666, TW L1674) and `Owner's Inbox/dunya-haritasi-sovereignty/sovereignty-data-dictionary.md`
   * (CY L57, QN L80, TW L169) — see `closing-summary.md` §2 for the per-row table. "Never
   * invented" holds for the SOURCE FACTS (an institution's real name/figure is never
   * fabricated), not for every character of every value: CY's parenthetical Turkish gloss was
   * deliberately DROPPED (AK-9 — the institution does not publish a Turkish self-name), and
   * QN's "projeksiyon"/"projection" qualifier is COMPOSED into the stored value per AK-8 Q4,
   * not a verbatim quotation. QN's EN form USED TO carry a provenance marker at its own row,
   * on the basis that it was derived from our own `nameEn` rather than from the institution.
   * An independent fact-check disproved that basis on 2026-08-07 — the institution publishes
   * its own English name and uses the abbreviation in its own address line — so the marker
   * was removed (→ PR #102). Read the QN row in `sovereignty.countries.ts` before touching
   * that value: it carries the evidence and the one nuance that survives, namely that the
   * contiguous English form is our composition of two components the institution does
   * publish, rather than a verbatim quotation.
   * The marker's NAME is deliberately not spelled here, for the same reason it is not spelled
   * there: it is still live elsewhere in the corpus, and an auditor sweeping for values that
   * are still unverified must not be answered by a paragraph describing one that no longer is.
   */
  populationSourceNameTr?: string | null;
  populationSourceNameEn?: string | null;
  areaKm2?: number | null;
  capitalNameTr?: string | null;
  capitalNameEn?: string | null;
  capitalLatitude?: number | null;
  capitalLongitude?: number | null;
  officialLanguagesTr?: string[] | null;
  currencyNameTr?: string | null;
  currencyCode?: string | null;
  governmentFormTr?: string | null;
  independenceNoteTr?: string | null;
  introTr?: string | null;
  landformNoteTr?: string | null;
  climateNoteTr?: string | null;
  hydrographyNoteTr?: string | null;
  sovereigntyNoteTr?: string | null;
  settlementNoteTr?: string | null;
  economyNoteTr?: string | null;
  governanceNoteTr?: string | null;
}

/**
 * DÜNYA HARİTASI PILOT — provenance of the 8-country seed batch (Türkiye's land
 * neighbours). THE ROWS THEMSELVES NO LONGER LIVE IN THIS FILE: they were moved into
 * `./countries/asia.countries.ts` (GE, AM, AZ, IR, IQ, SY) and
 * `./countries/europe-oceania.countries.ts` (GR, BG) by FU-PILOT-RETIRE, each into the
 * position its own `continent` + `unSubregionTr` gives it, because a row declared outside
 * `countries/` is invisible to `pnpm seed:transcribe` and its prose can therefore never be
 * gated (`ENGINEERING.md` §8). The provenance stays HERE rather than moving or being
 * copied into both destinations: its second half is corpus-wide (it documents the five
 * non-World-Bank population rows, which live in three OTHER files) and
 * `src/country/population-source.ts` points at this file for exactly that half. One home,
 * no second copy to drift (Atlas ruling, FU-PILOT-RETIRE S-2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROVENANCE (traceability — CONVENTIONS §4: no sourceless facts)
 * ─────────────────────────────────────────────────────────────────────────────
 * SOURCE OF RECORD: NOVA's dünya-haritası pilot pack, status "SEED-READY" — an
 *   INDEPENDENT fact-check pass (a different actor from the drafter) verified every value,
 *   its corrections were folded back, and the owner calibrated the sourcing discipline the
 *   same day.
 *   • Structured fields: Owner's Inbox/dunya-haritasi-pilot/country-data-dictionary.md
 *   • Narrative prose:   Owner's Inbox/dunya-haritasi-pilot/country-deep-content-draft.md
 *   • Decision trail:    DECISIONS.md — two 2026-07-13 "World-map pilot" entries
 * Per-field Tier-1 / Tier-2 authorities:
 *   • Ad TR/EN + başkent TR/EN + ISO alpha-2/3  → T.C. Dışişleri Bakanlığı (MFA), 2026
 *   • Nüfus                                      → Dünya Bankası (World Bank) for the ordinary
 *       country rows — year DELIBERATELY NOT asserted at world scale (owner ruling, 2026-07-13).
 *       FIVE ROWS ARE NOT WORLD BANK, and this is by ruling, not by drift:
 *         - Grönland (GL)  56.740   → Grønlands Statistik, 1 Oca 2026 (DEC 2026-08-01l)
 *         - Kıbrıs (CY)    983.000  → CYSTAT's own year-end ESTIMATE (not a census), for the
 *                                     government-controlled area ONLY — deliberately NOT the
 *                                     World Bank whole-island 1,36 M (DEC 2026-07-13); the
 *                                     method word is part of the credit since DEC 2026-08-07b
 *         - KKTC (QN)      489.308  → TRNC 2024 year-end revised projection; the World Bank
 *                                     publishes no series for an unrecognised state
 *         - Tayvan (TW) 23.299.132  → absent from `SP.POP.TOTL` altogether
 *         - Türkiye (TR) 86.092.168 → TÜİK ADNKS 2025 (Bülten no. 53899); no World Bank
 *                                     `SP.POP.TOTL` vintage (2023/2024/2025) equals this figure
 *                                     (found 2026-08-06, kaynak-satırı micro §1.3 — the same
 *                                     defect class as the other four, previously unmeasured)
 *       Georgia USED to be a sixth (Geostat) and was retired on 2026-08-05 once the World Bank
 *       series caught up and began publishing that exact figure — see the GE row.
 *       API-SIDE ONLY, still OPEN on the rendered page: the kaynak-satırı micro (2026-08-06,
 *       AK-8/AK-9) gave every row above (plus every ordinary row) a
 *       `population_source_name_tr/en` pair the service resolves at read time
 *       (`resolvePopulationSourceName`, `src/country/population-source.ts`) — but nothing in
 *       THIS repo renders it: `cografya_web`'s `CountryDetail.sources` is a static string with
 *       no interpolation slot (PR #98 review, I3), so every page still credits "Kaynak: Dünya
 *       Bankası" for these five rows exactly as before. FENER47-I1 is NARROWED by this wave —
 *       the data the fix needs now exists and is contract-visible — NOT closed; it closes only
 *       once `cografya_web`'s matching PR consumes the field (board row `WEB-SOURCE-LINE`).
 *   • Yüzölçümü (km²)                            → Dünya Bankası (AG.LND.TOTL.K2, 2023)
 *   • Kıta + BM alt-bölgesi (M49)                → UNSD M49 standard
 *   • Komşu ülkeler, yönetim biçimi, para birimi, resmi dil, bağımsızlık, fiziki coğrafya
 *                                                → CIA Factbook / Britannica-class (Tier-2,
 *       multi-source cross-checked) — the same confidence tier as the province "komşu iller"
 *   • Bulgaristan Euro geçişi (2026-01-01)       → Avrupa Merkez Bankası (ECB)
 *
 * FIELD-MAPPING DECISIONS (this batch → the Country entity shape from PR #23):
 *   1. PROSE SPLIT. NOVA's draft merged relief + climate into one `landformClimateNoteTr`
 *      section (an explicitly NON-BINDING naming suggestion) and kept a THIRD
 *      `hydrographyNoteTr` section. The Country entity instead has SEPARATE `landformNoteTr`
 *      and `climateNoteTr` prose fields (owner-ruled climate = woven prose, no structured
 *      Köppen code). So each draft section is split at its clean paragraph boundary: the
 *      relief paragraph(s) → `landformNoteTr`, the final climate paragraph → `climateNoteTr`.
 *      NOVA's wording is transcribed verbatim (no rewriting) — only the cut is editorial.
 *   2. HYDROGRAPHY — SCHEMA + DATA NOW BOTH LANDED. NOVA authored a fact-checked
 *      `hydrographyNoteTr` (nehir/göl/deniz) section for all 8 countries. The Country entity
 *      carries a `hydrography_note_tr` column (added in the schema fast-follow →
 *      DEC 2026-07-13, mirroring the Province `hydrography_note_tr` field). The schema landed
 *      first (PR #25); this data-only follow-up PR populates the field for all 8 rows, kept
 *      separate from the schema change so each stays reviewable independently. The draft kept
 *      hydrography as its OWN section, so the prose transcribes verbatim into `hydrographyNoteTr`
 *      — it was never force-fitted into `landformNoteTr` (the house pattern keeps relief and
 *      hydrography in separate fields).
 *   3. populationYear = null for all 8 — the owner ruling declines to assert a reference
 *      year at world scale (province-grade TÜİK-year precision is above this batch's bar).
 *   4. independenceNoteTr filled for 7 of 8. BG/GE/AM/IQ/SY have a single, multi-source-
 *      consistent date. GR + AZ have MULTIPLE real candidate dates with no single objective
 *      answer, so — per DEC 2026-07-13's resolution rule — each is anchored on the country's
 *      OWN officially-designated Independence Day (GR 25 Mart; AZ 28 Mayıs) with the other
 *      historically-relevant dates woven into the same free-text prose as context (not a
 *      forced single value). Left NULL only for IR: the field is conceptually inapplicable
 *      to a continuous ancient state (no colonial/Soviet exit date) — an undecided fact
 *      stays absent, not invented (CLAUDE §5).
 *   5. governmentFormTr = null for Syria — a genuinely fluid, owner-open item (post-2024
 *      transitional government), explicitly out of scope of the fact-check round.
 *   6. areaKm2 stored as whole km² (entity is integer): Armenia 28.199,44 → 28199.
 *   7. neighborIsoCodes is EXCLAVE-INCLUSIVE: Azerbaijan's list includes TR (via the
 *      Nahçıvan exclave, ~17 km) and Armenia's two AZ border segments count AZ once — the
 *      derived `neighborCount` (service) reads array length, never a hardcoded number.
 *
 * DERIVED, NOT STORED HERE: neighborCount (service, from array length); centroid /
 *   bounding-box (from boundary GeoJSON at build time — see the entity header note).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * The full `db:seed:world` set, aggregated here so `seed-world.ts` and the e2e suite keep
 * a single import. Each continent lives in its own `./countries/*.countries.ts` module so
 * a continent wave is reviewable in isolation; add a wave = add one import + one spread.
 *
 * EVERY seeded row now comes from a `./countries/*.countries.ts` module. This file declares
 * none of its own — the 8-country pilot batch used to, and that is precisely why its prose
 * sat outside the transcription gate for a year (FU-PILOT-RETIRE). A new row goes into a
 * wave file, never here.
 */
export const SEED_COUNTRIES: readonly CountrySeed[] = [
  ...ASIA_COUNTRIES,
  ...AFRICA_COUNTRIES,
  ...AMERICAS_COUNTRIES,
  ...EUROPE_OCEANIA_COUNTRIES,
  ...SOVEREIGNTY_COUNTRIES,
  ...TERRITORY_COUNTRIES,
  ...TURKIYE_COUNTRY,
];
