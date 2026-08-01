import { ApiProperty } from '@nestjs/swagger';
import {
  AirQualityAveragingPeriod,
  AirQualityCategory,
  AirQualityIndexSystem,
  AirQualityPollutant,
} from '../air-quality.types';
import { EAQI_BOUNDARY_RULE } from '../eaqi/eaqi.constants';

/** One band ↔ category-token row. */
export class AirQualityIndexSystemCategoryDto {
  @ApiProperty({ type: Number, minimum: 1, maximum: 6, example: 2 })
  band!: number;

  @ApiProperty({ enum: AirQualityCategory, example: AirQualityCategory.Fair })
  category!: AirQualityCategory;
}

/** One pollutant's band boundaries. */
export class AirQualityIndexSystemPollutantDto {
  @ApiProperty({ enum: AirQualityPollutant })
  pollutant!: AirQualityPollutant;

  @ApiProperty({ enum: AirQualityAveragingPeriod })
  averagingPeriod!: AirQualityAveragingPeriod;

  @ApiProperty({
    type: Number,
    isArray: true,
    example: [5, 15, 50, 90, 140],
    description:
      'Upper bounds (µg/m³) of bands 1..5; band 6 is unbounded above the last value. ' +
      'Interpreted under boundaryRule — the upper bound belongs to ITS band.',
  })
  upperBoundsUgM3!: number[];
}

/**
 * The full, machine-readable definition of the active index system — served by
 * `GET /api/air-quality/index-system` (the ONE endpoint A1 ships).
 *
 * The methodology must be auditable: the web repo renders bands/categories the server
 * computed, and this payload is the published proof of HOW. It is derived directly from the
 * server's own `EAQI_BANDS_EEA_2024` constant — the same object the EAQI arithmetic reads —
 * and a structural test asserts that derivation, so the published table can never drift from
 * the computing table.
 */
export class AirQualityIndexSystemDto {
  @ApiProperty({ enum: AirQualityIndexSystem })
  indexSystem!: AirQualityIndexSystem;

  @ApiProperty({
    enum: [EAQI_BOUNDARY_RULE],
    example: EAQI_BOUNDARY_RULE,
    description:
      'Band boundary rule, machine-readable: (lo, hi] — a value equal to an upper bound ' +
      'falls in THAT band (PM2.5 = 15.0 µg/m³ → band 2). The last band has no upper bound.',
  })
  boundaryRule!: typeof EAQI_BOUNDARY_RULE;

  @ApiProperty({ type: AirQualityIndexSystemCategoryDto, isArray: true })
  categories!: AirQualityIndexSystemCategoryDto[];

  @ApiProperty({ type: AirQualityIndexSystemPollutantDto, isArray: true })
  pollutants!: AirQualityIndexSystemPollutantDto[];

  @ApiProperty({
    enum: AirQualityPollutant,
    isArray: true,
    description:
      'Deterministic dominant-pollutant tie-break order when two pollutants share the worst ' +
      'band.',
  })
  tieBreakOrder!: AirQualityPollutant[];
}
