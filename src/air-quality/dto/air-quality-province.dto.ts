import { ApiProperty } from '@nestjs/swagger';
import { AirQualityAttributionDto } from './air-quality-attribution.dto';
import { AirQualityIndexDto } from './air-quality-index.dto';
import { AirQualitySeriesDto } from './air-quality-series.dto';

/**
 * Full detail payload for one province — `GET /api/air-quality/provinces/{plateCode}`.
 *
 * Frozen in A1 and SERVED from A2b: publishing the schema in the contract PR is exactly why
 * A2b's contract delta is additive (two paths plus one nullable series field).
 */
export class AirQualityProvinceDto {
  @ApiProperty({ type: String, example: '06', description: 'Zero-padded plate code.' })
  plateCode!: string;

  @ApiProperty({ type: String, example: 'ankara' })
  slugTr!: string;

  @ApiProperty({ type: String, example: 'ankara' })
  slugEn!: string;

  @ApiProperty({ type: String, example: 'Ankara' })
  nameTr!: string;

  @ApiProperty({
    type: Number,
    example: 39.9727,
    description: 'The canonical province reference point the platform uses everywhere.',
  })
  latitude!: number;

  @ApiProperty({ type: Number, example: 32.8637 })
  longitude!: number;

  @ApiProperty({ type: AirQualityIndexDto, description: 'The value for the step nearest to now.' })
  current!: AirQualityIndexDto;

  @ApiProperty({ type: AirQualitySeriesDto, nullable: true })
  series!: AirQualitySeriesDto | null;

  @ApiProperty({ type: AirQualityAttributionDto })
  attribution!: AirQualityAttributionDto;

  @ApiProperty({
    type: Boolean,
    description: 'False on the cold path (no usable run) — the page renders, the widget degrades.',
  })
  dataAvailable!: boolean;
}
