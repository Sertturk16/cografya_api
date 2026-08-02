import { ApiProperty } from '@nestjs/swagger';
import { MARINE_DIRECTION_REFERENCE } from '../marine.types';
import { MarinePointListItemDto } from './marine-point-list-item.dto';
import { MarineSeriesDto } from './marine-series.dto';
import { MarineValueDto } from './marine-value.dto';

/**
 * One point's FULL payload: instant values plus the 5-day series.
 *
 * ## BINDING: this DTO carries NO `attributions`, and that is a DEFERRAL, not a decision
 * `GET /api/marine/points/{slug}/conditions` returns this shape at the top level and is the one
 * marine value endpoint that publishes derived provider data with no licence notice attached.
 * M1 froze it that way; M5 documented the gap instead of closing it (plan §8 R1, Atlas ruling
 * DEC 2026-08-02h S5) for one reason only: **the endpoint has no consumer today.** The hub
 * reads `/overview`, the province surfaces read `/provinces/{plateCode}/conditions`, and both
 * of those carry both rows. Adding the array here would also nest it once per point inside the
 * province response (twice for İstanbul), which is why it is not simply bolted on.
 *
 * **THE RULE, and it binds whoever breaks it first:** any surface that starts consuming
 * `/points/{slug}/conditions` MUST display the ECMWF and Copernicus Marine notices, and
 * `attributions` rides that change — it is part of the work of wiring the endpoint up, not a
 * follow-up ticket. Shipping a page off this endpoint without the notices is a licence breach,
 * not a missing nicety. `marine-attribution-catalogue.ts` already holds the rows.
 *
 * **IMPLEMENTED IN M4b.**
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
