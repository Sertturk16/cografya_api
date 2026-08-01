import { describe, expect, it } from '@jest/globals';
import { ALL_AIR_QUALITY_POLLUTANTS } from './air-quality.types';
import {
  AIR_QUALITY_INDEX_SYSTEM,
  buildAirQualityIndexSystemDto,
} from './air-quality-index-system.catalogue';
import { EAQI_BANDS_EEA_2024, EAQI_CATEGORY_BY_BAND } from './eaqi/eaqi.constants';

/**
 * Acceptance criterion 10: the served index-system payload is DERIVED from
 * `EAQI_BANDS_EEA_2024` — no second hand copy of the band table anywhere. Deep-equality
 * against the constant, per field, so a "helpful" inline number in the catalogue builder
 * fails here.
 */
describe('AIR_QUALITY_INDEX_SYSTEM', () => {
  it('derives every published number from EAQI_BANDS_EEA_2024 (single-copy rule)', () => {
    expect(AIR_QUALITY_INDEX_SYSTEM.indexSystem).toBe(EAQI_BANDS_EEA_2024.indexSystem);
    expect(AIR_QUALITY_INDEX_SYSTEM.boundaryRule).toBe(EAQI_BANDS_EEA_2024.boundaryRule);
    expect(AIR_QUALITY_INDEX_SYSTEM.tieBreakOrder).toEqual([
      ...EAQI_BANDS_EEA_2024.dominantTieBreakOrder,
    ]);
    expect(AIR_QUALITY_INDEX_SYSTEM.categories).toEqual(
      EAQI_CATEGORY_BY_BAND.map((category, index) => ({ band: index + 1, category })),
    );
    expect(AIR_QUALITY_INDEX_SYSTEM.pollutants).toEqual(
      ALL_AIR_QUALITY_POLLUTANTS.map((pollutant) => ({
        pollutant,
        averagingPeriod: EAQI_BANDS_EEA_2024.averagingPeriod,
        upperBoundsUgM3: [...EAQI_BANDS_EEA_2024.upperBoundsUgM3[pollutant]],
      })),
    );
  });

  it('covers all six bands and all five pollutants', () => {
    expect(AIR_QUALITY_INDEX_SYSTEM.categories).toHaveLength(6);
    expect(AIR_QUALITY_INDEX_SYSTEM.pollutants).toHaveLength(5);
    for (const pollutant of AIR_QUALITY_INDEX_SYSTEM.pollutants) {
      expect(pollutant.upperBoundsUgM3).toHaveLength(5); // band 6 unbounded
      // Bounds strictly increase — a shuffled row would grade nonsense.
      const sorted = [...pollutant.upperBoundsUgM3].sort((a, b) => a - b);
      expect(pollutant.upperBoundsUgM3).toEqual(sorted);
    }
  });

  it('builds a fresh, equal payload on demand (the exported instance is just memoisation)', () => {
    expect(buildAirQualityIndexSystemDto()).toEqual(AIR_QUALITY_INDEX_SYSTEM);
  });
});
