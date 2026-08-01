import { ApiProperty } from '@nestjs/swagger';
import {
  AirQualityAveragingPeriod,
  AirQualityCategory,
  AirQualityPollutant,
  AirQualityStatus,
  AirQualityUnit,
} from '../air-quality.types';

/**
 * One pollutant's RAW concentration + its EAQI sub-index, for one instant.
 *
 * Raw concentrations are published alongside the index by ruling (DEC 2026-07-30w): the index
 * is OUR derivation and must stay auditable against the number it came from.
 *
 * **NOT SERVED BY ANY A1 ENDPOINT.** The full contract is frozen and published in A1 (the
 * "contract PR", via `@ApiExtraModels`) so the web repo can codegen and build against a mock;
 * the endpoints that return it land in A2. Safe to freeze because every field mirrors a
 * MEASURED provider reality (units, `_FillValue`, grid geometry). Any change before A2 ships
 * is a BREAKING contract change and goes to Atlas.
 */
export class AirQualityPollutantValueDto {
  @ApiProperty({ enum: AirQualityPollutant, example: AirQualityPollutant.Pm2_5 })
  pollutant!: AirQualityPollutant;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 8.4,
    description:
      'Raw model concentration in µg/m³, or null when this step/pollutant is missing. ' +
      'Model output on a ~0.1° grid — never a station reading. Missing values are null, ' +
      'never a sentinel: the provider marks absence with an in-band fill value that the ' +
      'server classifies away before publication.',
  })
  value!: number | null;

  @ApiProperty({
    enum: AirQualityUnit,
    description: 'Canonical machine unit token. The display symbol (µg/m³) is a web i18n concern.',
  })
  unit!: AirQualityUnit;

  @ApiProperty({
    enum: AirQualityAveragingPeriod,
    description:
      'EAQI-2024 rates ALL five pollutants on hourly values (no 24 h running mean), so this ' +
      'enum has a single member. A future methodology change arrives as a new indexSystem ' +
      'member, not a silent reinterpretation of this field.',
  })
  averagingPeriod!: AirQualityAveragingPeriod;

  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 6,
    example: 2,
    description: 'EAQI sub-index band for this pollutant alone; null when value is null.',
  })
  subIndexBand!: number | null;

  @ApiProperty({ enum: AirQualityCategory, nullable: true, example: AirQualityCategory.Fair })
  subIndexCategory!: AirQualityCategory | null;

  @ApiProperty({
    enum: AirQualityStatus,
    description:
      'Per-pollutant status: the same cell can carry PM2.5 and miss SO₂ — pollutants are ' +
      'classified independently, never averaged or borrowed from a neighbour cell.',
  })
  status!: AirQualityStatus;
}
