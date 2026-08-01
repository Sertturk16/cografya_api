import {
  AirQualityAveragingPeriod,
  AirQualityCategory,
  AirQualityIndexSystem,
  AirQualityPollutant,
} from '../air-quality.types';

/**
 * A band index. EAQI defines exactly six; the type keeps arithmetic from inventing a seventh.
 */
export type EaqiBand = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * The band-boundary rule, as a machine-readable token published on
 * `GET /api/air-quality/index-system`.
 *
 * `(lo, hi]` — the UPPER bound is inclusive, the lower exclusive, the last band unbounded.
 * The EEA report defines bands by their "proposed upper limits" (last band `> 140`), so
 * PM2.5 = 15.0 µg/m³ is band 2 (`fair`), NOT band 3. The reflexive `[lo, hi)` reading is
 * WRONG by exactly one band at every boundary, in the pessimistic direction — which is why
 * the rule is a published token and a pinned test rather than a comment (SPEC §8.3).
 */
export const EAQI_BOUNDARY_RULE = 'lower_exclusive_upper_inclusive' as const;
export type EaqiBoundaryRule = typeof EAQI_BOUNDARY_RULE;

/** Category token for each band, index 0 ↔ band 1. */
export const EAQI_CATEGORY_BY_BAND: readonly AirQualityCategory[] = [
  AirQualityCategory.Good,
  AirQualityCategory.Fair,
  AirQualityCategory.Moderate,
  AirQualityCategory.Poor,
  AirQualityCategory.VeryPoor,
  AirQualityCategory.ExtremelyPoor,
];

/**
 * The EAQI band table — 2024 revision, versioned constant.
 *
 * ## Provenance (facts, transcribed verbatim — R3 is "silently wrong category")
 * Source: EEA / ETC HE Report 2024/17, Table 5.2 — "Final agreed updated EEA European air
 * quality index" — cross-checked against the live `airindex.eea.europa.eu` site; the two agree
 * exactly (olcumler.md §7). Binding rulings: DEC 2026-07-30w (EAQI, never the TR official HKİ)
 * and DEC 2026-08-01c (the 2024 revision; ALL five pollutants hourly — no running mean).
 *
 * ## Shape
 * Only the five UPPER bounds are stored per pollutant (bands leave no gaps; band 6 has no
 * upper bound). All numbers are µg/m³ over HOURLY values. The boundary rule is
 * {@link EAQI_BOUNDARY_RULE}.
 *
 * ## This constant is the SINGLE copy
 * `GET /api/air-quality/index-system` publishes this table by DERIVING its payload from this
 * object — a structural test asserts the served numbers are these numbers, so a second
 * hand-maintained copy cannot drift (A1 plan §3, acceptance criterion 10).
 */
export const EAQI_BANDS_EEA_2024 = {
  indexSystem: AirQualityIndexSystem.EaqiEea2024,
  boundaryRule: EAQI_BOUNDARY_RULE,
  averagingPeriod: AirQualityAveragingPeriod.Hourly,
  /** Upper bounds (µg/m³) for bands 1..5; band 6 is `> last`. */
  upperBoundsUgM3: {
    [AirQualityPollutant.Pm2_5]: [5, 15, 50, 90, 140],
    [AirQualityPollutant.Pm10]: [15, 45, 120, 195, 270],
    [AirQualityPollutant.No2]: [10, 25, 60, 100, 150],
    [AirQualityPollutant.O3]: [60, 100, 120, 160, 180],
    [AirQualityPollutant.So2]: [20, 40, 125, 190, 275],
  },
  /**
   * Dominant-pollutant tie-break order (SPEC §8.1, binding — without it the dominant
   * pollutant is nondeterministic when two pollutants share the worst band). PM2.5 first:
   * its primary standing in the health-effects literature and EAQI's own PM2.5-anchored
   * derivation.
   */
  dominantTieBreakOrder: [
    AirQualityPollutant.Pm2_5,
    AirQualityPollutant.Pm10,
    AirQualityPollutant.No2,
    AirQualityPollutant.O3,
    AirQualityPollutant.So2,
  ],
} as const satisfies {
  indexSystem: AirQualityIndexSystem;
  boundaryRule: EaqiBoundaryRule;
  averagingPeriod: AirQualityAveragingPeriod;
  upperBoundsUgM3: Readonly<
    Record<AirQualityPollutant, readonly [number, number, number, number, number]>
  >;
  dominantTieBreakOrder: readonly AirQualityPollutant[];
};
