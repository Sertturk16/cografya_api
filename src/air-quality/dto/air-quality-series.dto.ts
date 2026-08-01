import { ApiProperty } from '@nestjs/swagger';
import { AirQualityCategory, AirQualityPollutant } from '../air-quality.types';

/**
 * Raw hourly concentration arrays, one per pollutant, step-aligned with the parent series'
 * `timesUtc`. A nested class (not an inline object) so the OpenAPI schema names the shape for
 * codegen.
 */
export class AirQualitySeriesConcentrationsDto {
  @ApiProperty({
    type: Number,
    isArray: true,
    nullable: true,
    description: 'µg/m³ per step; null per missing step.',
  })
  pm2_5!: (number | null)[];

  @ApiProperty({ type: Number, isArray: true, nullable: true })
  pm10!: (number | null)[];

  @ApiProperty({ type: Number, isArray: true, nullable: true })
  no2!: (number | null)[];

  @ApiProperty({ type: Number, isArray: true, nullable: true })
  o3!: (number | null)[];

  @ApiProperty({ type: Number, isArray: true, nullable: true })
  so2!: (number | null)[];
}

/**
 * The hourly series for one province: bands, categories, dominant pollutants and raw
 * concentrations, all step-aligned.
 *
 * **NOT SERVED BY ANY A1 ENDPOINT** — frozen contract, published for codegen; served by A2.
 *
 * ## There is deliberately NO `analysisEndUtc` field (Atlas checkpoint A-7, closed with the
 * approved A1 plan)
 * Faz-1 ingests only the daily FORECAST product. Every step of this series — including hours
 * that look "past" during the day — is model forecast output from the run base time onward;
 * the file contains no analysis/forecast boundary, so publishing one would label forecast
 * data as analysis (SPEC §11.3.1's honesty rule). A UI that wants to shade elapsed hours
 * derives it from `timesUtc` vs. the client clock — no server field required. If a product
 * decision (S2) later adds the analysis job, the field returns ADDITIVELY with an honest
 * definition.
 */
export class AirQualitySeriesDto {
  @ApiProperty({
    type: String,
    isArray: true,
    example: ['2026-08-01T00:00:00.000Z', '2026-08-01T01:00:00.000Z'],
    description:
      'Step instants (ISO-8601 UTC). INVARIANT: every other array in this object has exactly ' +
      'this length; a missing step is null in place, never dropped and never invented. Every ' +
      'step is model FORECAST output — the series starts at the model run base time and ' +
      'contains no earlier step.',
  })
  timesUtc!: string[];

  @ApiProperty({
    type: Number,
    example: 1,
    description: 'Hours between steps (always 1 in Faz-1).',
  })
  stepHours!: number;

  @ApiProperty({
    type: String,
    example: '2026-08-05T00:00:00.000Z',
    description: 'End of the published horizon (run base + 96 h in Faz-1).',
  })
  horizonEndUtc!: string;

  @ApiProperty({
    type: Number,
    isArray: true,
    nullable: true,
    minimum: 1,
    maximum: 6,
    description: 'Overall EAQI band per step; null where it cannot be computed.',
  })
  bands!: (number | null)[];

  @ApiProperty({ enum: AirQualityCategory, isArray: true, nullable: true })
  categories!: (AirQualityCategory | null)[];

  @ApiProperty({ enum: AirQualityPollutant, isArray: true, nullable: true })
  dominantPollutants!: (AirQualityPollutant | null)[];

  @ApiProperty({ type: AirQualitySeriesConcentrationsDto })
  concentrations!: AirQualitySeriesConcentrationsDto;
}
