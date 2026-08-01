import {
  AirQualityCategory,
  AirQualityPollutant,
  ALL_AIR_QUALITY_POLLUTANTS,
} from '../air-quality.types';
import { EAQI_BANDS_EEA_2024, EAQI_CATEGORY_BY_BAND, type EaqiBand } from './eaqi.constants';

/**
 * Pure EAQI-2024 arithmetic. No I/O, no clock, no running-mean machinery — EAQI-2024 rates
 * every pollutant on the HOURLY value (DEC 2026-08-01c), so one step's index is a function of
 * that step's five numbers and nothing else.
 *
 * Null-classification happens BEFORE this module (`cams/cams-decode.ts` turns `_FillValue` and
 * negative raw values into `null`). This module receives `null` for "missing" and a
 * non-negative finite number for "present" — anything else is OUR bug and throws loudly,
 * because a −999 reaching a band lookup comes out as band 1 (`good`) and vanishes into the
 * worst-band rule with every test green (risk R4, the leg's #1 silent-failure class).
 */

/** One pollutant's sub-index. */
export interface EaqiSubIndex {
  band: EaqiBand;
  category: AirQualityCategory;
}

/** The computed index for one time step. */
export interface EaqiResult {
  /** `null` only when EVERY pollutant is missing. */
  band: EaqiBand | null;
  category: AirQualityCategory | null;
  dominantPollutant: AirQualityPollutant | null;
  /** Pollutants that were `null` this step — published, never hidden (SPEC §8.4). */
  missingPollutants: AirQualityPollutant[];
  /** Per-pollutant sub-index; `null` where the pollutant was missing. */
  subIndexes: Record<AirQualityPollutant, EaqiSubIndex | null>;
}

/** Category token for a band. */
export function categoryForBand(band: EaqiBand): AirQualityCategory {
  const category = EAQI_CATEGORY_BY_BAND[band - 1];
  if (category === undefined) {
    throw new RangeError(`EAQI band out of range: ${String(band)}`);
  }
  return category;
}

/**
 * Sub-index band for one hourly concentration, by the `(lo, hi]` rule: the band is the FIRST
 * whose upper bound is ≥ the value (upper bound INCLUSIVE — PM2.5 = 15.0 is band 2), band 6
 * when the value exceeds every bound.
 *
 * Throws on negative or non-finite input instead of classifying it: a negative concentration
 * is physically impossible and must have been nulled by the decode layer already. Banding it
 * would grade `_FillValue = −999` as `good` — the exact invisible failure R4 names.
 */
export function subIndexBand(pollutant: AirQualityPollutant, valueUgM3: number): EaqiBand {
  if (!Number.isFinite(valueUgM3) || valueUgM3 < 0) {
    throw new RangeError(
      `EAQI sub-index for "${pollutant}" was asked to band ${String(valueUgM3)} — ` +
        'negative/non-finite concentrations must be null-classified before EAQI runs.',
    );
  }
  const bounds = EAQI_BANDS_EEA_2024.upperBoundsUgM3[pollutant];
  for (let index = 0; index < bounds.length; index += 1) {
    const upperBound = bounds[index];
    if (upperBound !== undefined && valueUgM3 <= upperBound) {
      return (index + 1) as EaqiBand;
    }
  }
  return 6;
}

/**
 * The overall index for one step: the WORST sub-band of the pollutants that are present
 * (EAQI's own definition), the dominant pollutant chosen by the binding tie-break order, and
 * the missing pollutants published explicitly.
 *
 * A partial set still yields an index (SPEC §8.4: honesty is SAYING what is missing, not
 * hiding what is known); all-missing yields `null`s and an exhaustive `missingPollutants`.
 */
export function computeEaqi(
  values: Readonly<Record<AirQualityPollutant, number | null>>,
): EaqiResult {
  const subIndexes = {} as Record<AirQualityPollutant, EaqiSubIndex | null>;
  const missingPollutants: AirQualityPollutant[] = [];

  for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) {
    const value = values[pollutant];
    if (value === null) {
      subIndexes[pollutant] = null;
      missingPollutants.push(pollutant);
    } else {
      const band = subIndexBand(pollutant, value);
      subIndexes[pollutant] = { band, category: categoryForBand(band) };
    }
  }

  let worstBand: EaqiBand | null = null;
  for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) {
    const sub = subIndexes[pollutant];
    if (sub !== null && (worstBand === null || sub.band > worstBand)) {
      worstBand = sub.band;
    }
  }

  if (worstBand === null) {
    return {
      band: null,
      category: null,
      dominantPollutant: null,
      missingPollutants,
      subIndexes,
    };
  }

  let dominantPollutant: AirQualityPollutant | null = null;
  for (const pollutant of EAQI_BANDS_EEA_2024.dominantTieBreakOrder) {
    const sub = subIndexes[pollutant];
    if (sub !== null && sub.band === worstBand) {
      dominantPollutant = pollutant;
      break;
    }
  }

  return {
    band: worstBand,
    category: categoryForBand(worstBand),
    dominantPollutant,
    missingPollutants,
    subIndexes,
  };
}
