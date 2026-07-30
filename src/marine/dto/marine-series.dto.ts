import { ApiProperty } from '@nestjs/swagger';
import { MARINE_DIRECTION_REFERENCE, MarineSource } from '../marine.types';

/**
 * The 5-day chart series for one point. Always Open-Meteo: CMEMS answers one time step per
 * call, so a 5-day hourly chart would cost ~120 calls per point.
 *
 * ## Contract guarantee — parallel arrays, and why they stay
 * Every value array is EXACTLY `timesUtc.length` long, and index `i` refers to `timesUtc[i]`
 * in every array. A short or long array is a contract violation, asserted per-array in e2e.
 *
 * The "array of objects" alternative was rejected: the parallel-array form is what a charting
 * library consumes directly, it is ~40 % smaller on the wire, and the invariant that makes it
 * risky (arrays drifting out of length) is cheap to assert and IS asserted — whereas the
 * object form's cost is paid on every request forever.
 *
 * **NOT IMPLEMENTED IN M1** — frozen contract only; lands in M3.
 */
export class MarineSeriesDto {
  @ApiProperty({ example: 3, description: 'Spacing between consecutive samples, hours.' })
  stepHours!: number;

  @ApiProperty({
    type: [String],
    example: ['2026-07-30T00:00:00.000Z', '2026-07-30T03:00:00.000Z'],
    description: 'Sample instants (ISO-8601 UTC). Defines the length of EVERY array below.',
  })
  timesUtc!: string[];

  @ApiProperty({
    // Raw schema, NOT `type: [Number]` + `isArray`: those combine into an array OF ARRAYS, and
    // `nullable` on an `@ApiProperty` array marks the ARRAY nullable, never its items. What the
    // contract means is `(number | null)[]` — the nulls are per-sample gaps.
    type: 'array',
    items: { type: 'number', nullable: true },
    description: 'Sea surface temperature, °C. Same length as timesUtc; nulls are gaps.',
  })
  seaSurfaceTemperature!: (number | null)[];

  @ApiProperty({
    // Raw schema — see `seaSurfaceTemperature` for why.
    type: 'array',
    items: { type: 'number', nullable: true },
    description: 'Significant wave height, m. Same length as timesUtc.',
  })
  waveHeight!: (number | null)[];

  @ApiProperty({
    // Raw schema — see `seaSurfaceTemperature` for why.
    type: 'array',
    items: { type: 'number', nullable: true },
    description: `Wave direction, degrees. ${MARINE_DIRECTION_REFERENCE} This field is 'from'.`,
  })
  waveDirection!: (number | null)[];

  @ApiProperty({
    // Raw schema — see `seaSurfaceTemperature` for why.
    type: 'array',
    items: { type: 'number', nullable: true },
    description:
      'Wind speed at 10 m, m/s (requested explicitly from the provider, never its default).',
  })
  windSpeed10m!: (number | null)[];

  @ApiProperty({
    // Raw schema — see `seaSurfaceTemperature` for why.
    type: 'array',
    items: { type: 'number', nullable: true },
    description: `Wind direction at 10 m, degrees. ${MARINE_DIRECTION_REFERENCE} This field is 'from'.`,
  })
  windDirection10m!: (number | null)[];

  @ApiProperty({
    enum: MarineSource,
    example: MarineSource.OpenMeteo,
    description: 'Always open-meteo — CMEMS cannot serve a time range in one call.',
  })
  source!: MarineSource;

  @ApiProperty({
    example: '2026-08-04T00:00:00.000Z',
    description:
      'Last instant the provider can serve for this point (ISO-8601 UTC). The horizon is NOT ' +
      'a constant (4–9 days depending on product), so the server states it and the web must ' +
      'not hardcode a slider bound.',
  })
  horizonEndUtc!: string;
}
