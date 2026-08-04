/**
 * Structured payload shapes for the `Province` jsonb columns + the shared contract.
 *
 * These are the ONE definition of each jsonb shape: the entity types its jsonb
 * columns with the interfaces here, and the response DTOs `implements` the same
 * interfaces (so the stored shape and the published contract cannot drift — a
 * change to an interface breaks compilation until both the column and the DTO
 * follow). The DTO classes exist separately only because `@nestjs/swagger` needs
 * a decorated class to emit the nested OpenAPI schema; the interfaces here are the
 * source of truth for the field set.
 */

/**
 * Hidrografya feature kind. ASCII values (like `GeographicRegion`) so the
 * discriminator is safe in generated web types and free of diacritic edge cases;
 * the Turkish display label ("Baraj" / "Nehir" / "Göl") is a presentation concern
 * the web repo maps, exactly as it maps the region enum → Turkish label.
 */
export enum HydrographyFeatureType {
  Baraj = 'baraj',
  Nehir = 'nehir',
  Gol = 'gol',
}

/**
 * One named hydrographic feature of a province (a dam, river or lake). Authored
 * content — sourced per the DSİ/İSKİ authorities in NOVA's briefs, never invented.
 */
export interface HydrographyFeature {
  /** Öz ad (e.g. "Ömerli Barajı", "Sakarya Nehri"). */
  name: string;
  /** Feature kind (dam / river / lake). */
  type: HydrographyFeatureType;
}

/**
 * A single, TÜİK-anchored economic indicator for a province. Deliberately a lone
 * structured stat — NOT free prose — so the "Ekonomik Coğrafya" section cannot
 * drift into unsourced marketing language (CONVENTIONS §4; NOVA content-research
 * §1.4). The whole object is null until a verified statistic fills it.
 */
export interface EconomyIndicator {
  /** What the stat measures (e.g. "GSYH'de Türkiye payı"). */
  label: string;
  /** The value, as a string — a share, a rank or a product name (heterogeneous). */
  value: string;
  /** Reference year of the statistic. */
  year: number;
  /** Authoritative source (e.g. "TÜİK Bölgesel GSYH"). */
  source: string;
}

/**
 * The ONE source identifier a climate series may carry.
 *
 * Deliberately a single-member string-literal type, NOT a TS enum and NOT a Postgres enum. The
 * shape survived the source swap it was once justified by the ABSENCE of: the series moved from
 * MGM's `k=A` table to ERA5-Land monthly means (→ DEC 2026-07-30l, DEC 2026-08-01o), and the swap
 * cost exactly one constant plus one import run — no `ALTER TYPE`, no enum drop/recreate, no
 * migration at all. That is the trade the owner accepted at DEC 2026-07-18h, and it paid.
 *
 * **This token names the SERIES, not everything climatic on a province.** The Köppen class
 * (`climate_koppen` / `climate_class_tr` / `climate_note_tr`) remains MGM's published 2023
 * classification, carried as an ATTRIBUTED quotation with its own caveat text (→ DEC 2026-08-04a,
 * option K1). A page therefore legitimately shows an ERA5-Land series beside an MGM class; the two
 * are different claims with different provenance, and neither may be relabelled as the other.
 */
export const CLIMATE_SOURCE_ERA5_LAND_MONTHLY = 'era5_land_monthly';
export type ClimateSource = typeof CLIMATE_SOURCE_ERA5_LAND_MONTHLY;

/** Number of months in a climate series. The series length is derived from THIS, never
 * from the length of whatever the parser happened to find (PLAN.md risk #2). */
export const CLIMATE_MONTH_COUNT = 12;

/**
 * One month of a province's climate normals — the CORE PAIR, and nothing else.
 *
 * `month` is 1-12. Both measures are **non-nullable `number`s**, which is a deliberate
 * narrowing of the previous MGM-era shape (10 nullable measures, of which 8 no longer exist:
 * mean max/min, sunshine, rainy days and the four monthly record fields were ruled out of scope
 * at DEC 2026-08-01o and are NOT re-introduced as "fills in later" nullables).
 *
 * **Why not nullable "just in case".** The all-or-nothing rule always applied at the SERIES
 * level: a province missing either measure in any month was left entirely unpublished. ERA5-Land
 * is a uniform global reanalysis grid, so completeness is structural rather than hopeful — there
 * is no "this station does not report" class at all (SPEC §5.3), and the load phase refuses to
 * write anything unless all 81 × 12 × 2 values are present. A field that can never legitimately
 * be null but is typed nullable makes the contract lie and forces every consumer to write a dead
 * branch. The honest guard lives where it belongs: the `jsonb` boundary
 * (`computeClimateDerived`'s `typeof` check) still tolerates a corrupt stored document at
 * runtime, because a TypeScript type is an assertion about a `jsonb` column, never a guarantee.
 *
 * Values are RAW numbers, never pre-formatted strings: formatting is the web repo's
 * `next-intl` `getFormatter()` concern, and a number cannot carry a locale bug across the
 * contract.
 */
export interface ClimateMonthlyNormal {
  /** 1 = Ocak … 12 = Aralık. */
  month: number;
  /** 30 yıllık aylık ortalama sıcaklık (°C). Çekirdek çift — see the interface note. */
  tempMeanC: number;
  /** 30 yıllık aylık toplam yağış ortalaması (mm). Çekirdek çift — see the interface note. */
  precipitationMm: number;
}

/**
 * A province's full climate normals — the shape stored in `provinces.climate_normals`
 * (`jsonb`) and mirrored by `ClimateDto` on the public contract.
 *
 * `sourceUrl` is the ERA5-Land dataset landing page and is therefore the SAME string for all 81
 * provinces. That is a real change from the MGM shape, where the URL was per-province because
 * MGM's key is not the Turkish name (Mersin → `ICEL`). It stays a stored field rather than
 * becoming a web-side constant so the served payload remains self-describing: a client holding
 * one province document can always name the source it came from without consulting a second
 * table.
 *
 * `periodStartYear`/`periodEndYear` are MANDATORY and are 1991/2020 for every province — the WMO
 * normal window the dataset was requested for, not a value parsed per province. Under MGM they
 * genuinely differed per station (Mersin 1929, İstanbul 1950 — trap T2) and inventing a single
 * fixed period would have been false; under ERA5-Land a single window is simply what the data
 * IS. They stay stored (rather than becoming a constant) because the window will move to
 * 2001-2030 after 2031, and the day it does, a re-run of the load phase is the entire migration.
 *
 * NOT stored here: the annual mean/total. Every annual figure we show is OUR derivation and may
 * not be attributed to C3S/ECMWF. Derivations are computed in `climate-derivations.ts` at
 * serialization time, never persisted, so they cannot go stale against the months they are
 * derived from.
 */
export interface ClimateNormals {
  source: ClimateSource;
  /** The ERA5-Land dataset page this series was derived from — identical across all provinces. */
  sourceUrl: string;
  /** Ölçüm periyodu — the WMO normal window the dataset was requested for (1991-2020). */
  periodStartYear: number;
  periodEndYear: number;
  /** Exactly `CLIMATE_MONTH_COUNT` entries, months 1-12 in ascending order. */
  months: ClimateMonthlyNormal[];
}

/**
 * Seasonal share of the annual precipitation, as WHOLE-INTEGER percentages that sum to
 * EXACTLY 100.
 *
 * The four values are constrained to total 100 by construction (`climate-derivations.ts`
 * adds the rounding residue to the largest share). This is a *derivation*, not a formatting
 * choice, so it is single-sourced in the api: every consumer — the visible summary, the
 * metadata description, the JSON-LD — reads the same four integers and cannot disagree about
 * whether they add up (PLAN.md risk 7). The competitor's one genuine contribution is this
 * seasonal breakdown; computing it ourselves, once, is how we match it without a rounding drift.
 *
 * Northern-hemisphere meteorological seasons (the standard convention, and the one the
 * competitor's breakdown assumes): winter = Dec/Jan/Feb, spring = Mar/Apr/May,
 * summer = Jun/Jul/Aug, autumn = Sep/Oct/Nov.
 */
export interface SeasonalPrecipitation {
  winterPct: number;
  springPct: number;
  summerPct: number;
  autumnPct: number;
}

/**
 * Values DERIVED from a province's `months` series — never stored, computed at serialization
 * time in `climate-derivations.ts` (the `computePopulationDensity` precedent, exported for
 * direct unit testing).
 *
 * These are OURS, not the provider's: C3S publishes a gridded reanalysis, not a per-province
 * annual mean or a seasonal breakdown, so nothing here may be attributed to C3S/ECMWF — the
 * required CC-BY attribution covers the SERIES these were computed from, never the computation.
 * Computing once and serving the result means the chart, the table summary, the metadata and the
 * JSON-LD can never round the same figure two different ways (PLAN.md risk 7).
 *
 * RAW numbers, never pre-formatted strings — decimal places, thousands separators and units
 * are the web repo's `next-intl` `getFormatter()` job. The api fixes the *value* (and its
 * canonical precision); the web fixes its *presentation*.
 *
 * Month fields are 1-12 indices into `months`, not names — the Turkish month label is a web
 * presentation concern. A tie (two months sharing the extreme) resolves to the EARLIEST month,
 * deterministically.
 */
export interface ClimateDerived {
  /** Yıllık ortalama sıcaklık (°C) — mean of the 12 monthly means, 1 decimal. */
  annualMeanTempC: number;
  /** Yıllık toplam yağış (mm) — sum of the 12 monthly totals, 1 decimal. */
  annualPrecipitationMm: number;
  /** En sıcak ay — month (1-12) with the highest `tempMeanC`. */
  hottestMonth: number;
  /** En soğuk ay — month (1-12) with the lowest `tempMeanC`. */
  coldestMonth: number;
  /** En yağışlı ay — month (1-12) with the highest `precipitationMm`. */
  wettestMonth: number;
  /** En kurak ay — month (1-12) with the lowest `precipitationMm`. */
  driestMonth: number;
  /** Yıllık sıcaklık farkı (°C) — hottest month's mean minus coldest month's mean, 1 decimal. */
  annualTempRangeC: number;
  /** Mevsimsel yağış yüzdeleri — whole integers summing to exactly 100. */
  seasonalPrecipitation: SeasonalPrecipitation;
}

/**
 * The climate payload the public contract serves: the full stored `ClimateNormals` series
 * PLUS the `derived` block. `ClimateDto` mirrors this exactly (so the served shape and this
 * interface cannot drift), and `ProvinceService.toDetail` builds it — or emits `null` when the
 * province has no publishable series (or, defensively, one whose core pair is not derivable).
 */
export interface Climate extends ClimateNormals {
  derived: ClimateDerived;
}
