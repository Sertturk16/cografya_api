/**
 * Shared air-quality vocabulary — the closed sets the DTOs, the EAQI module, the CAMS decode
 * path and the OpenAPI contract all read from.
 *
 * The contract ships in `openapi/openapi.json` in PR A1 (the "contract PR") so the web repo can
 * codegen and build against a mock while A2 lands the scheduled ingest and the province
 * endpoints. Everything here is FROZEN at A1: a change to any value below is a BREAKING
 * contract change and goes to Atlas (playbook §4) — including ADDING an enum member, because a
 * new member can break an exhaustive `switch` in the consumer (SPEC §8.5's stated policy).
 *
 * One file on purpose, like `marine.types.ts`: an enum duplicated between a DTO and the decode
 * path is exactly how a pollutant token ends up spelled two ways.
 */

/**
 * Why a value is (or is not) present.
 *
 * A DELIBERATE COPY of `MarineStatus`, not a shared import (DEC 2026-07-31b / SPEC §6.4, Atlas
 * A-3): these are four-member string vocabularies, not behaviour. Sharing would bind two
 * independent OpenAPI surfaces to one type, so a later marine-only member (or air-only member)
 * would widen the OTHER leg's contract for nothing. The divergence risk a copy carries is
 * intentional here; the meanings below are this leg's own.
 *
 * - `ok` — a value is present.
 * - `no_data` — the model covers this cell but this step's value is missing (`_FillValue`).
 * - `not_supported` — structural: the point is outside the CAMS domain, or the model carried no
 *   value for this pollutant across the ENTIRE run. Empty for all 81 provinces today
 *   (measured: 0 missing of 6 620 250 values) — kept so a future district tier or a domain-edge
 *   point can never degrade silently.
 * - `unavailable` — no usable run (cold start, or every ceiling breached).
 */
export enum AirQualityStatus {
  Ok = 'ok',
  NoData = 'no_data',
  NotSupported = 'not_supported',
  Unavailable = 'unavailable',
}

/**
 * How old the served value is. A deliberate copy of `MarineFreshness` (same ruling as
 * {@link AirQualityStatus}). Always `null` when `status !== 'ok'`.
 */
export enum AirQualityFreshness {
  Fresh = 'fresh',
  Stale = 'stale',
}

/**
 * The five EAQI pollutants — OUR canonical tokens.
 *
 * These are the THIRD spelling of each pollutant, next to the ADS request name
 * (`particulate_matter_2.5um`) and the NetCDF file's variable name (`pm2p5_conc`). The three
 * spellings are reconciled in exactly one place — `cams/cams-variables.ts` — and locked by a
 * unit test; nothing else may translate between them (probe-olcumleri.md §4.1).
 *
 * Declaration order is the CANONICAL order everywhere a pollutant list appears, and it equals
 * the dominant-pollutant tie-break order (SPEC §8.1): PM2.5 > PM10 > NO₂ > O₃ > SO₂.
 */
export enum AirQualityPollutant {
  Pm2_5 = 'pm2_5',
  Pm10 = 'pm10',
  No2 = 'no2',
  O3 = 'o3',
  So2 = 'so2',
}

/** Every pollutant, in the canonical (= tie-break) order. */
export const ALL_AIR_QUALITY_POLLUTANTS: readonly AirQualityPollutant[] = [
  AirQualityPollutant.Pm2_5,
  AirQualityPollutant.Pm10,
  AirQualityPollutant.No2,
  AirQualityPollutant.O3,
  AirQualityPollutant.So2,
];

/**
 * EAQI category TOKENS, band 1..6 in order. Machine tokens, never user-facing text: the TR/EN
 * names, the "our translation" label and any health advice are i18n keys on the web side
 * (SPEC §11.4). No colour is published anywhere — DEC 2026-07-30w.
 */
export enum AirQualityCategory {
  Good = 'good',
  Fair = 'fair',
  Moderate = 'moderate',
  Poor = 'poor',
  VeryPoor = 'very_poor',
  ExtremelyPoor = 'extremely_poor',
}

/**
 * Which index methodology produced a band/category. Single member in Faz-1 (Atlas A-8 closed by
 * the approved A1 plan): the EEA European Air Quality Index, 2024 revision (ETC HE Report
 * 2024/17 Table 5.2 — all five pollutants hourly). Scheme: `{index}-{authority}-{revision}`.
 * A revision of the band table adds a NEW member; an existing member never changes meaning.
 */
export enum AirQualityIndexSystem {
  EaqiEea2024 = 'eaqi-eea-2024',
}

/** Which provider the concentrations came from. Single member in Faz-1. */
export enum AirQualitySource {
  CamsEuropeAq = 'cams-europe-aq',
}

/**
 * Canonical machine unit for a published concentration. The provider's file string is
 * `"µg/m3"` (U+00B5, measured at the byte level); passing raw symbol strings through would push
 * string matching onto the web repo, exactly what `MarineUnit` exists to prevent.
 */
export enum AirQualityUnit {
  MicrogramPerCubicMeter = 'ug_m3',
}

/**
 * The averaging period a sub-index is computed over. Single member: EAQI-2024 uses HOURLY
 * values for all five pollutants (DEC 2026-08-01c) — the 2017 index's 24 h running mean for PM
 * is gone, and so is any `running_24h` member. Re-adding one would be a breaking change by the
 * enum-widening policy above.
 */
export enum AirQualityAveragingPeriod {
  Hourly = 'hourly',
}
