/**
 * The ECMWF Open Data vocabulary — the closed sets the index parser, the GRIB adapter, the grid
 * arithmetic and the probe tool all read from.
 *
 * ## Why the numbers here are measured, not documented
 * Every constant below was read off a live cycle (2026-07-30 12z) with ecCodes and cross-checked
 * against the decoder, and the measurement is recorded in
 * `Owner's Inbox/yeni-m3-ecmwf-spec/olcumler.md`. Two of them contradict what the SPEC assumed
 * from documentation, and both would have been silently wrong rather than loudly broken:
 *
 * 1. **The longitude axis starts at 180°, not 0°.** A column index derived from a `0 → 359.75`
 *    axis lands exactly 720 columns — 180° — away: the middle of the Pacific instead of the
 *    Turkish coast. The cell is not empty there, so no test fails and no null appears.
 * 2. **The wave fields carry a bitmap** (`bitmapPresent = 1`, 372 612 masked cells), the wind
 *    fields do not. A decoder that handles CCSDS but not the bitmap produces a full-length array
 *    of plausible numbers with the land mask silently filled in.
 *
 * Neither fact is asserted from this file alone: `grib2-envelope.ts` re-reads them from every
 * message and refuses one that disagrees (§ fail-closed). These constants are the EXPECTATION,
 * the envelope reader is the CHECK.
 */

/** The four Faz-1 parameters, as ECMWF's `.index` files spell them in `param`. */
export const ECMWF_PARAMS = ['10u', '10v', 'swh', 'mwd'] as const;

export type EcmwfParam = (typeof ECMWF_PARAMS)[number];

/** The two ECMWF Open Data streams the Faz-1 parameters live in. */
export const ECMWF_STREAMS = ['oper', 'wave'] as const;

export type EcmwfStream = (typeof ECMWF_STREAMS)[number];

/**
 * GRIB2 parameter identification per Faz-1 parameter — discipline / category / number.
 *
 * This is the interlock that makes a u/v (or swh/mwd) mix-up impossible rather than unlikely.
 * The mapping from bytes to meaning is done ONLY through the `.index` file's `param` field plus
 * the byte offset (measured surprise S8: the decoder reports NOAA abbreviations, so `mwd` comes
 * back as `WWSDIR` and matching on the decoder's own names would be matching on a different
 * vocabulary). That mapping is a claim about which bytes we asked for — and this table is what
 * turns it into a claim the MESSAGE ITSELF has to agree with: `grib2-envelope.ts` reads these
 * three numbers out of sections 0 and 4 and the adapter refuses a message whose identification
 * does not match the parameter the index said it would be.
 *
 * Values read from the live cycle with `grib_ls -p discipline,parameterCategory,parameterNumber`
 * and committed in `test/fixtures/ecmwf/eccodes-reference.json`.
 */
export const ECMWF_PARAM_IDENTIFICATION: Readonly<
  Record<EcmwfParam, { discipline: number; category: number; number: number }>
> = {
  // Discipline 0 = meteorological, category 2 = momentum.
  '10u': { discipline: 0, category: 2, number: 2 },
  '10v': { discipline: 0, category: 2, number: 3 },
  // Discipline 10 = oceanographic, category 0 = waves.
  swh: { discipline: 10, category: 0, number: 3 },
  mwd: { discipline: 10, category: 0, number: 14 },
};

/** Grid spacing of the 0.25° global product, degrees. */
export const ECMWF_GRID_STEP_DEGREES = 0.25;

/** Columns per row (`Ni`): 360 / 0.25. */
export const ECMWF_GRID_COLUMNS = 1440;

/** Rows (`Nj`): 180 / 0.25 + 1 — both poles are grid rows. */
export const ECMWF_GRID_ROWS = 721;

/** Latitude of the first grid row. The axis runs NORTH → SOUTH. */
export const ECMWF_GRID_FIRST_LATITUDE = 90;

/**
 * Longitude of the first grid column — **180, not 0** (measured surprise S1).
 *
 * The axis is `180, 180.25, …, 359.75, 0, 0.25, …, 179.75`, i.e. `[-180, 180)` expressed in
 * `[0, 360)` coordinates. See the file docblock for what assuming otherwise costs.
 */
export const ECMWF_GRID_FIRST_LONGITUDE = 180;

/**
 * GRIB2 scanning mode 0: west → east within a row, north → south between rows, no alternation.
 * The plain row-major order the index arithmetic in `ecmwf-grid.ts` assumes.
 */
export const ECMWF_GRID_SCANNING_MODE = 0;

/** Grid definition template 3.0 — regular latitude/longitude. Anything else is refused. */
export const ECMWF_GRID_DEFINITION_TEMPLATE = 0;

/** Product definition template 4.0 — analysis or forecast at a horizontal level. */
export const ECMWF_PRODUCT_DEFINITION_TEMPLATE = 0;

/**
 * Data representation template 5.42 — CCSDS/AEC, used by every ECMWF GRIB2 grid field since IFS
 * Cycle 48r1 and confirmed live on all four Faz-1 parameters.
 *
 * Pinned rather than "whatever the decoder accepts": a provider switching packing is exactly the
 * moment we want a loud refusal and an ecCodes migration decision (DEC 2026-07-31d condition 5),
 * not a best-effort decode.
 */
export const ECMWF_DATA_REPRESENTATION_TEMPLATE = 42;

/** Forecast horizon, hours (owner ruling O1 → DEC 2026-07-31: 5 days, not 7). */
export const ECMWF_FORECAST_HOURS = 120;

/**
 * Series step, hours. Uniform across the whole 5-day horizon, which is what keeps the frozen
 * `MarineSeriesDto.stepHours` a single honest number (SPEC §4.3).
 */
export const ECMWF_STEP_HOURS = 3;

/** Every forecast step of one cycle, in hours: 0, 3, … 120 → 41 steps. */
export const ECMWF_STEPS: readonly number[] = Array.from(
  { length: ECMWF_FORECAST_HOURS / ECMWF_STEP_HOURS + 1 },
  (_unused, index) => index * ECMWF_STEP_HOURS,
);

/**
 * The provider's model cadence, in the `MarineLayerDto.updateFrequency` prose format the M1
 * contract exemplified ("twice-daily: 00:00 UTC; 12:00 UTC"). A statement about ECMWF's
 * publication schedule (F2 §4, measured), not about our ingest interval.
 */
export const ECMWF_UPDATE_FREQUENCY = 'four-times-daily: 00:00; 06:00; 12:00; 18:00 UTC';

/**
 * Cycles kept in Postgres — SPEC §9.1's retention rule. Shared by the ingest's pruning and by
 * both read paths' candidate window (the cycle-precedence policy may only choose among cycles
 * retention is guaranteed to keep).
 */
export const ECMWF_RETAINED_CYCLES = 3;
