import { ApiProperty } from '@nestjs/swagger';
import { MARINE_DIRECTION_REFERENCE } from '../marine.types';
import { MarinePointListItemDto } from './marine-point-list-item.dto';
import { MarineValueDto } from './marine-value.dto';

/**
 * One point's INSTANT values for the `/deniz` hub — no series.
 *
 * A distinct type from `MarineConditionsDto` rather than "the same type with series: null"
 * (SPEC-ADDENDUM §7.5 / B4): the hub renders ~31 of these, and shipping 31 null series fields
 * plus a `seriesSourceDiffersFromInstant` flag that means nothing without a series is contract
 * noise the web repo would have to defend against.
 *
 * **NOT IMPLEMENTED IN M1** — frozen contract only; the endpoint lands in M4.
 */
export class MarineOverviewPointDto {
  @ApiProperty({ type: MarinePointListItemDto, description: 'The point this block describes.' })
  point!: MarinePointListItemDto;

  @ApiProperty({ type: MarineValueDto, description: 'Sea surface temperature (°C).' })
  seaSurfaceTemperature!: MarineValueDto;

  @ApiProperty({
    type: MarineValueDto,
    description:
      'Significant wave height (m) — the mean of the highest one third of waves. Individual ' +
      'waves can be noticeably higher; the /deniz hub is required to explain this in prose.',
  })
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
}
