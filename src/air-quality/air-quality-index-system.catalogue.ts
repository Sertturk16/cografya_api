import { ALL_AIR_QUALITY_POLLUTANTS } from './air-quality.types';
import { EAQI_BANDS_EEA_2024, EAQI_CATEGORY_BY_BAND } from './eaqi/eaqi.constants';
import { AirQualityIndexSystemDto } from './dto/air-quality-index-system.dto';

/**
 * The index-system catalogue — the payload of `GET /api/air-quality/index-system`.
 *
 * DERIVED from {@link EAQI_BANDS_EEA_2024}, the same constant the EAQI arithmetic computes
 * with. There is deliberately no second, hand-maintained copy of the band table: the spec
 * beside this file asserts the derivation (deep equality against the constant), so the
 * published methodology and the computing methodology cannot drift apart (plan §3 /
 * acceptance criterion 10).
 *
 * Built once at module load: the input is a frozen constant, so the payload is a constant.
 * Cold state serves it identically — code only, no store, no provider (COLD-BEHAVIOR §10).
 */
export function buildAirQualityIndexSystemDto(): AirQualityIndexSystemDto {
  const dto = new AirQualityIndexSystemDto();
  dto.indexSystem = EAQI_BANDS_EEA_2024.indexSystem;
  dto.boundaryRule = EAQI_BANDS_EEA_2024.boundaryRule;
  dto.categories = EAQI_CATEGORY_BY_BAND.map((category, index) => ({
    band: index + 1,
    category,
  }));
  dto.pollutants = ALL_AIR_QUALITY_POLLUTANTS.map((pollutant) => ({
    pollutant,
    averagingPeriod: EAQI_BANDS_EEA_2024.averagingPeriod,
    upperBoundsUgM3: [...EAQI_BANDS_EEA_2024.upperBoundsUgM3[pollutant]],
  }));
  dto.tieBreakOrder = [...EAQI_BANDS_EEA_2024.dominantTieBreakOrder];
  return dto;
}

/** The constant payload instance the controller serves. */
export const AIR_QUALITY_INDEX_SYSTEM = buildAirQualityIndexSystemDto();
