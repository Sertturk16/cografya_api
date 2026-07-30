import { ApiProperty } from '@nestjs/swagger';
import { MARINE_DIRECTION_REFERENCE } from '../marine.types';
import { MarinePointListItemDto } from './marine-point-list-item.dto';
import { MarineSeriesDto } from './marine-series.dto';
import { MarineValueDto } from './marine-value.dto';

/**
 * One point's FULL payload: instant values plus the 5-day series.
 *
 * **NOT IMPLEMENTED IN M1** — frozen contract only; the endpoints land in M4.
 */
export class MarineConditionsDto {
  @ApiProperty({ type: MarinePointListItemDto, description: 'The point this block describes.' })
  point!: MarinePointListItemDto;

  @ApiProperty({ type: MarineValueDto, description: 'Sea surface temperature (°C).' })
  seaSurfaceTemperature!: MarineValueDto;

  @ApiProperty({ type: MarineValueDto, description: 'Significant wave height (m).' })
  waveHeight!: MarineValueDto;

  @ApiProperty({
    type: MarineValueDto,
    description: `Wave direction. ${MARINE_DIRECTION_REFERENCE} This field is 'from'.`,
  })
  waveDirection!: MarineValueDto;

  @ApiProperty({ type: MarineValueDto, description: 'Wind speed at 10 m (m/s).' })
  windSpeed10m!: MarineValueDto;

  @ApiProperty({
    type: MarineValueDto,
    description: `Wind direction at 10 m. ${MARINE_DIRECTION_REFERENCE} This field is 'from'.`,
  })
  windDirection10m!: MarineValueDto;

  @ApiProperty({
    type: MarineSeriesDto,
    nullable: true,
    description:
      'The 5-day series, or null. Nullable for a real case, not for convenience: CMEMS may be ' +
      'up while Open-Meteo is down, which yields instant values with no series.',
  })
  series!: MarineSeriesDto | null;

  @ApiProperty({
    example: true,
    description:
      'SERVER-COMPUTED. True when the chart comes from a different model than the headline ' +
      'instant value, which measurably happens (~1.5–1.7 °C apart at the same point). When ' +
      'true the web MUST render the fixed i18n notice marine.series.sourceDiffersNotice. It is ' +
      'a boolean rather than a design-guide sentence precisely so it can be asserted in a ' +
      'contract test instead of quietly skipped.',
  })
  seriesSourceDiffersFromInstant!: boolean;
}
