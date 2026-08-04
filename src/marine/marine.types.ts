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
 * MACHINE names, not symbols. Passing provider strings through would push string-matching onto
 * the web repo — and there is no single string to pass: CMEMS states its own unit string per
 * field (`m` / `degree` / `degrees_C`), while ECMWF Open Data ships GRIB2, where the unit is
 * implied by the parameter and no unit string is carried at all. (The retired M1 Open-Meteo leg
 * spelled the same quantities differently again — `m` / `°` / `°C` / `km/h` — which is the
 * measurement this enum was born from.) `°C` and `m/s` are a DISPLAY concern and belong to
 * Vera's i18n.
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

/**
 * Which provider a single value came from. Carried per FIELD — silent mixing is banned (K6).
 *
 * ## `open-meteo` → `ecmwf` (M3a, a BREAKING contract change made at its cheapest moment)
 * M1 froze this enum with `open-meteo` as the non-CMEMS provider. DEC 2026-07-30k then put
 * Open-Meteo out of scope for the commercial platform, and DEC 2026-07-31 replaced it with
 * **ECMWF Open Data** (CC BY 4.0, commercial use permitted). The value changes rather than being
 * added alongside: there is no Faz-1 path left that can emit `open-meteo`, and keeping a value
 * the server can never produce would force the web repo to defend against it forever.
 *
 * This is breaking by the repo playbook's own rule (§4) and is flagged to Atlas as such. It is
 * landing now because today there is **no live consumer** — the M1 contract shipped so the web
 * repo could codegen against a mock, and nothing renders it yet. The same change after `/deniz`
 * ships would cost a coordinated two-repo release.
 *
 * The HISTORICAL M1 probe artifact still says `open-meteo`, and correctly so: it is the record of
 * a run that really did query Open-Meteo. It no longer reads this enum at all — see
 * `MarineArtifactSource` in `src/database/marine/marine-artifact.types.ts`.
 */
export enum MarineSource {
  Cmems = 'cmems',
  Ecmwf = 'ecmwf',
}

/**
 * The five Faz-1 layers (SPEC-ADDENDUM §7.2, `MarineLayerDto.id`).
 *
 * The ids are `snake_case`; the matching `MarineValueDto` properties on the conditions/overview
 * payloads are `camelCase` (`sea_surface_temperature` ↔ `seaSurfaceTemperature`). They
 * correspond one-to-one but they are NOT the same string, so a consumer joining the catalogue to
 * a value payload must convert the case rather than index by the id.
 *
 * (An earlier version of this comment — and, worse, the published OpenAPI description — claimed
 * the id "doubles as the field name". A web consumer following that indexes the payload by the
 * id and gets `undefined`. Corrected per review #72.)
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
 * The convention is per FIELD, not global, because the providers themselves are. ECMWF states
 * `mwd` as "degree true … zero means coming from the north" and, on the SAME page, warns that its
 * wave SPECTRUM fields use the opposite oceanographic convention — two conventions inside one
 * wave model. Faz-1 fetches no spectral field, so wave direction is published verbatim.
 *
 * **Wind is different from M1, and this is where the conversion risk now lives.** ECMWF publishes
 * wind as the vector components `10u`/`10v`, so the bearing is arithmetic WE perform
 * (`src/marine/ecmwf/ecmwf-wind.ts`). SPEC-ADDENDUM §5.3's "Faz-1 converts zero degrees" no
 * longer holds, which is why the arrow-unlock precondition published on
 * `MarineLayerDto.directionConvention` names a three-layer regression suite.
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
