import { ApiProperty } from '@nestjs/swagger';
import { MARINE_DIRECTION_REFERENCE, MarineSource } from '../marine.types';

/**
 * The 5-day chart series for one point. Always ECMWF: CMEMS answers one time step per call, so a
 * multi-day chart would cost ~120 requests per point, while ECMWF publishes the whole global
 * field per step and the series is assembled from data we already hold.
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
 * **NOT IMPLEMENTED YET** — the shape is published so the web repo can codegen; the endpoints
 * that return it land in M3b (ECMWF read path) and M4 (CMEMS + merge).
 */
export class MarineSeriesDto {
  @ApiProperty({
    example: 3,
    description:
      'Spacing between consecutive samples, hours. Uniform at 3 across the whole published ' +
      'horizon: ECMWF switches to 6-hourly steps only after +144 h, and the horizon stops at ' +
      '+120 h, so this stays a single honest number.',
  })
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
    description:
      'Sea surface temperature, °C. Same length as timesUtc; nulls are gaps. ON THIS SERIES IT ' +
      'IS NULL FOR ITS WHOLE LENGTH: ECMWF Open Data publishes no sea-surface-temperature field ' +
      'in any of its streams (verified against the published parameter set of oper, wave, enfo ' +
      'and aifs-single). The array is kept rather than removed because the temperature series ' +
      'is a CMEMS concern and this shape must not change when M4 fills it.',
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
    // A single-value enum, not the two-value `MarineSource`. SPEC-ADDENDUM §7.2 pins this field
    // to a LITERAL, and the distinction is not pedantic: publishing the full enum makes generated
    // web types `'cmems' | 'ecmwf'`, forcing the web repo to defend against a value the server
    // can never emit. A type is the right place to say "always", a description is not.
    enum: [MarineSource.Ecmwf],
    example: MarineSource.Ecmwf,
    description:
      'Always ecmwf — CMEMS answers one time step per call, so a 5-day series would cost ~120 ' +
      'requests per point.',
  })
  source!: MarineSource.Ecmwf;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-07-30T12:00:00.000Z',
    description:
      'The model RUN this series came from (ISO-8601 UTC) — for ECMWF, the 00/06/12/18 UTC ' +
      'cycle; null for a provider that publishes none. Distinct from fetchedAtUtc and from ' +
      'validAtUtc, and it is the only one of the three that can expose a stale forecast: a ' +
      'two-day-old cycle still produces a step valid "now", so both of the other timestamps ' +
      'look fresh while the data is not.',
  })
  modelRunAtUtc!: string | null;

  @ApiProperty({
    example: '2026-08-04T00:00:00.000Z',
    description:
      'Last instant covered by this series (ISO-8601 UTC). NOT a constant: the published ECMWF ' +
      'horizon is +120 h from the model run, and while a cycle is still being ingested this is ' +
      'the last step actually held — it grows as the cycle completes. The web must read it ' +
      'rather than hardcode a slider bound.',
  })
  horizonEndUtc!: string;
}
