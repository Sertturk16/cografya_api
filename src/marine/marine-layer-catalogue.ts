import type { MarineLayerDto } from './dto/marine-layer.dto';
import { MarineDirectionConvention, MarineLayerId, MarineSource, MarineUnit } from './marine.types';

/**
 * The static half of the layer catalogue served by `GET /api/marine/layers`.
 *
 * ## Why this is a hardcoded constant and not a table
 * Five rows, changed only by a code change, read on every request, never edited by a human
 * operator. A table would add a migration, a seed and a failure mode for zero benefit — the
 * repo's YAGNI default.
 *
 * ## What is NOT here, and why the endpoint still ships in M1
 * `horizonEndUtc`, `updateFrequency` and `catalogueUpdatedAtUtc` come from the provider's STAC
 * catalogue and are `null` until M3 wires that fetch. M1 makes NO provider call, by design —
 * so the endpoint is a pure, DB-free, always-fast read of this constant.
 *
 * That still delivers the thing the web repo is blocked on: `directionConvention`, `unit`,
 * `calmThreshold`, `stepHours` and the colour ramps are exactly the fields a renderer needs,
 * and all three null fields are nullable in the frozen contract regardless (a provider need
 * not publish them). M3 therefore fills values into an UNCHANGED shape — not a breaking change.
 *
 * ## Sources and conventions, per field
 * - `directionConvention` is `from` for both Faz-1 direction layers. Verified from PRIMARY
 *   sources, not assumed: CMEMS publishes `VMDR` as `sea_surface_wave_from_direction` (CF
 *   standard name), and ECMWF's parameter database states `mwd` (paramId 140230) as "degree
 *   true … zero means 'coming from the north'". Wind is the one that is now DERIVED rather than
 *   read: ECMWF publishes `10u`/`10v` vector components, so the bearing is our arithmetic and
 *   the three-layer regression suite in `src/marine/ecmwf/` is what defends it.
 * - `calmThreshold` sits on the MAGNITUDE layer and governs its paired direction layer.
 * - `primarySource` follows K6: CMEMS primary for the three ocean fields (regional 500 m –
 *   4.2 km models beat a global 25 km one near the coast), ECMWF for wind, which CMEMS — an
 *   ocean service — does not carry at all.
 * - `fallbackSource` is `ecmwf` for wave height and direction (measured: real values at all 30
 *   reference points, the Marmara included, where CMEMS has no wave field at all) and **null for
 *   temperature**: ECMWF Open Data publishes no `sst` in any stream (measured across
 *   oper/wave/enfo/aifs), so it cannot back CMEMS up there. `skt` exists and is a different
 *   parameter; publishing it as sea surface temperature would be an approximation.
 */

/**
 * Wind speed colour stops are anchored on BEAUFORT force boundaries in m/s, not on round
 * numbers. This is a geography education site: the breakpoints a reader will meet elsewhere
 * are Beaufort's, and m/s is the scale's defining unit.
 */
const BEAUFORT_STOPS_MS: readonly { value: number; hex: string }[] = [
  { value: 0, hex: '#f7fcf0' }, // 0 — calm
  { value: 1.6, hex: '#e0f3db' }, // 2 — light breeze
  { value: 3.4, hex: '#ccebc5' }, // 3 — gentle breeze
  { value: 5.5, hex: '#a8ddb5' }, // 4 — moderate breeze
  { value: 8.0, hex: '#7bccc4' }, // 5 — fresh breeze
  { value: 10.8, hex: '#4eb3d3' }, // 6 — strong breeze
  { value: 13.9, hex: '#2b8cbe' }, // 7 — near gale
  { value: 17.2, hex: '#08589e' }, // 8 — gale
];

/** Series step, hours. One value for every Faz-1 layer (SPEC-ADDENDUM §7.2). */
const SERIES_STEP_HOURS = 3;

export const MARINE_LAYER_CATALOGUE: readonly MarineLayerDto[] = [
  {
    id: MarineLayerId.SeaSurfaceTemperature,
    labelTr: 'Deniz suyu sıcaklığı',
    labelEn: 'Sea surface temperature',
    unit: MarineUnit.Celsius,
    directionConvention: null,
    calmThreshold: null,
    primarySource: MarineSource.Cmems,
    // NULL, not `ecmwf`: ECMWF Open Data publishes no sea-surface-temperature field at all.
    // Measured across every stream (oper / wave / enfo / aifs-single) on a live cycle — `sst`
    // (paramId 34) appears in none of them. There is therefore no fallback for this layer, and
    // the ECMWF series' `seaSurfaceTemperature` array is null for its whole length.
    fallbackSource: null,
    stepHours: SERIES_STEP_HOURS,
    horizonEndUtc: null,
    updateFrequency: null,
    catalogueUpdatedAtUtc: null,
    colorStops: [
      { value: 6, hex: '#2166ac' },
      { value: 12, hex: '#67a9cf' },
      { value: 17, hex: '#d1e5f0' },
      { value: 21, hex: '#fddbc7' },
      { value: 25, hex: '#ef8a62' },
      { value: 30, hex: '#b2182b' },
    ],
    attributionId: 'cmems',
  },
  {
    id: MarineLayerId.WaveHeight,
    labelTr: 'Belirgin dalga yüksekliği',
    labelEn: 'Significant wave height',
    unit: MarineUnit.Meter,
    directionConvention: null,
    // 0.10 m: below this the sea is flat enough that a direction arrow would be noise.
    calmThreshold: 0.1,
    primarySource: MarineSource.Cmems,
    // The Marmara has no CMEMS wave field at all — permanently, not transiently.
    fallbackSource: MarineSource.Ecmwf,
    stepHours: SERIES_STEP_HOURS,
    horizonEndUtc: null,
    updateFrequency: null,
    catalogueUpdatedAtUtc: null,
    colorStops: [
      { value: 0, hex: '#edf8fb' },
      { value: 0.5, hex: '#b3cde3' },
      { value: 1, hex: '#8c96c6' },
      { value: 2, hex: '#8856a7' },
      { value: 4, hex: '#810f7c' },
    ],
    attributionId: 'cmems',
  },
  {
    id: MarineLayerId.WaveDirection,
    labelTr: 'Dalga yönü',
    labelEn: 'Wave direction',
    unit: MarineUnit.DegreeTrue,
    directionConvention: MarineDirectionConvention.From,
    calmThreshold: null,
    primarySource: MarineSource.Cmems,
    fallbackSource: MarineSource.Ecmwf,
    stepHours: SERIES_STEP_HOURS,
    horizonEndUtc: null,
    updateFrequency: null,
    catalogueUpdatedAtUtc: null,
    // A bearing has no magnitude ramp; an empty list is the honest statement, not an omission.
    colorStops: [],
    attributionId: 'cmems',
  },
  {
    id: MarineLayerId.WindSpeed10m,
    labelTr: '10 m rüzgâr hızı',
    labelEn: 'Wind speed at 10 m',
    unit: MarineUnit.MeterPerSecond,
    directionConvention: null,
    // 0.5 m/s ≈ Beaufort 0/1 boundary: below it the wind direction is meaningless.
    calmThreshold: 0.5,
    // CMEMS is an OCEAN service and carries no wind field anywhere — there is no fallback.
    primarySource: MarineSource.Ecmwf,
    fallbackSource: null,
    stepHours: SERIES_STEP_HOURS,
    horizonEndUtc: null,
    updateFrequency: null,
    catalogueUpdatedAtUtc: null,
    colorStops: [...BEAUFORT_STOPS_MS],
    attributionId: 'ecmwf',
  },
  {
    id: MarineLayerId.WindDirection10m,
    labelTr: '10 m rüzgâr yönü',
    labelEn: 'Wind direction at 10 m',
    unit: MarineUnit.DegreeTrue,
    directionConvention: MarineDirectionConvention.From,
    calmThreshold: null,
    primarySource: MarineSource.Ecmwf,
    fallbackSource: null,
    stepHours: SERIES_STEP_HOURS,
    horizonEndUtc: null,
    updateFrequency: null,
    catalogueUpdatedAtUtc: null,
    colorStops: [],
    attributionId: 'ecmwf',
  },
];
