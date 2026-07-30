/**
 * Shared marine vocabulary — the closed sets the entity, the DTOs, the import tool and the
 * OpenAPI contract all read from.
 *
 * Every set here is FROZEN at M1 (SPEC-ADDENDUM §8.2): the contract ships in
 * `openapi/openapi.json` in this PR so the web repo can codegen and start against a mock
 * while M2–M4 build the runtime. A change to any value below between M1 and M5 is a
 * BREAKING contract change and goes to Atlas (repo playbook §4), even though nothing is
 * deployed yet.
 *
 * These live in one file on purpose: an enum duplicated between the entity and the DTO is
 * exactly how a `sea_basin` value ends up spelled two ways.
 */

/**
 * The four seas a reference point can belong to.
 *
 * **This is the POINT's basin, never the province's** (SPEC-ADDENDUM §4.2). İstanbul has one
 * `black_sea` row and one `marmara` row; deriving the basin from the province would send the
 * Marmara point at the Black Sea model and publish a number from the wrong sea. The value is
 * also the CMEMS dataset routing key — Marmara temperature comes from a 500 m sub-model that
 * the Black Sea product's own bounding box does not advertise (SPEC v1 §3.3).
 *
 * String values are the DB enum labels; `MARINE_SEA_BASIN_DB_ENUM` names the Postgres type
 * (the `GeographicRegion` precedent).
 */
export enum SeaBasin {
  Aegean = 'aegean',
  Mediterranean = 'mediterranean',
  Marmara = 'marmara',
  BlackSea = 'black_sea',
}

/** Name of the Postgres enum type backing {@link SeaBasin}. */
export const MARINE_SEA_BASIN_DB_ENUM = 'marine_sea_basin';

/**
 * Canonical units (SPEC-ADDENDUM §7.4 / B3).
 *
 * MACHINE names, not symbols. Measured provider strings for the SAME quantity were `m` /
 * `degree` / `degrees_C` (CMEMS) and `m` / `°` / `°C` / `km/h` (Open-Meteo) — three spellings
 * for one unit. Passing those through would push string-matching onto the web repo. `°C` and
 * `m/s` are a DISPLAY concern and belong to Vera's i18n.
 *
 * Wind is `meter_per_second` because models produce m/s, the Beaufort scale is defined in m/s
 * (natural for a geography site), and m/s → km/h is a lossless ×3.6 while the reverse loses
 * precision. The DISPLAYED unit is an editorial call and is NOT bound by this (AÇIK-2).
 */
export enum MarineUnit {
  Meter = 'm',
  Celsius = 'celsius',
  DegreeTrue = 'degree_true',
  MeterPerSecond = 'meter_per_second',
}

/**
 * Why a value is (or is not) present (SPEC-ADDENDUM §7.7 / B6).
 *
 * Four values, not three. `no_data` and `not_supported` are genuinely different facts and
 * cannot render the same way: "the model covers this spot but has no value right now (land
 * mask / gap)" versus "this model does not carry this layer here AT ALL". The second is a
 * permanent product truth — CMEMS has no wave field in the Marmara, ever — and it is also the
 * reason the runtime SKIPS that call entirely (SPEC-ADDENDUM §2.2), which is where the
 * saving comes from.
 */
export enum MarineStatus {
  Ok = 'ok',
  NoData = 'no_data',
  NotSupported = 'not_supported',
  Unavailable = 'unavailable',
}

/**
 * How old the cached value is (SPEC-ADDENDUM §6.1 / A5-a).
 *
 * Deliberately SEPARATE from {@link MarineStatus}: a value can be `ok` AND `stale` at the same
 * time, and that combination is normal and frequent (the provider has been quiet for 20
 * minutes but we hold a valid 40-minute-old number). Folding freshness into `status` would
 * force us to either lie about one of the two or drop a usable value.
 *
 * Always `null` when `status !== 'ok'`.
 */
export enum MarineFreshness {
  Fresh = 'fresh',
  Stale = 'stale',
}

/** Which provider a single value came from. Carried per FIELD — silent mixing is banned (K6). */
export enum MarineSource {
  Cmems = 'cmems',
  OpenMeteo = 'open-meteo',
}

/**
 * The five Faz-1 layers (SPEC-ADDENDUM §7.2, `MarineLayerDto.id`).
 *
 * The ids double as the `MarineValueDto` field names on the conditions/overview payloads, so
 * the layer catalogue can be joined to a value client-side without a mapping table.
 */
export enum MarineLayerId {
  SeaSurfaceTemperature = 'sea_surface_temperature',
  WaveHeight = 'wave_height',
  WaveDirection = 'wave_direction',
  WindSpeed10m = 'wind_speed_10m',
  WindDirection10m = 'wind_direction_10m',
}

/**
 * What a direction degree MEANS for a given layer (SPEC-ADDENDUM §5.3 / A4).
 *
 * Published machine-readably in the layer catalogue rather than repeated on every value: 31
 * points × 2 direction fields would carry the same constant string 62 times per response.
 *
 * The convention is per FIELD, not global, because the providers themselves are: Open-Meteo
 * documents wave direction as "the direction the waves come from" and ocean-current direction
 * as "where the current is heading towards" — two opposite conventions inside ONE API. Faz-1
 * performs ZERO degree conversion (all three Faz-1 direction layers are natively `from`), so a
 * conversion bug is structurally impossible here; Faz-2's currents are where it flips.
 */
export enum MarineDirectionConvention {
  /** Degrees the flow is coming FROM (meteorological). Wave + wind, Faz-1. */
  From = 'from',
  /** Degrees the flow is heading TOWARDS. Ocean currents, Faz-2. */
  Towards = 'towards',
}

/**
 * All direction degrees on this API are measured from TRUE north, CLOCKWISE, in [0, 360).
 *
 * Stated once, here, and quoted verbatim into every direction field's OpenAPI description —
 * a wrongly-drawn arrow is the textbook "silently wrong while every test is green" defect
 * (SPEC-ADDENDUM §5.5).
 */
export const MARINE_DIRECTION_REFERENCE =
  'True north, clockwise, 0–360. Per-field from/towards meaning is published in ' +
  'GET /api/marine/layers → directionConvention.';
