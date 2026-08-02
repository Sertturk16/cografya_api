import { ApiProperty } from '@nestjs/swagger';
import { AirQualityCategory, AirQualityPollutant } from '../air-quality.types';

/**
 * Raw hourly concentration arrays, one per pollutant, step-aligned with the parent series'
 * `timesUtc`. A nested class (not an inline object) so the OpenAPI schema names the shape for
 * codegen.
 */
export class AirQualitySeriesConcentrationsDto {
  @ApiProperty({
    // Raw schema, NOT `type: Number` + `isArray` + `nullable`: `nullable` on an `@ApiProperty`
    // array marks the ARRAY nullable, never its items (@nestjs/swagger keeps `nullable` at the
    // property level while descending other keywords). What the contract means is
    // `(number | null)[]` — the nulls are per-step gaps. Same trap and same fix as the merged
    // `MarineSeriesDto` (see its `seaSurfaceTemperature` comment).
    type: 'array',
    items: { type: 'number', nullable: true },
    description: 'µg/m³ per step; null per missing step.',
  })
  pm2_5!: (number | null)[];

  @ApiProperty({
    // Raw schema — see `pm2_5` for why.
    type: 'array',
    items: { type: 'number', nullable: true },
  })
  pm10!: (number | null)[];

  @ApiProperty({
    // Raw schema — see `pm2_5` for why.
    type: 'array',
    items: { type: 'number', nullable: true },
  })
  no2!: (number | null)[];

  @ApiProperty({
    // Raw schema — see `pm2_5` for why.
    type: 'array',
    items: { type: 'number', nullable: true },
  })
  o3!: (number | null)[];

  @ApiProperty({
    // Raw schema — see `pm2_5` for why.
    type: 'array',
    items: { type: 'number', nullable: true },
  })
  so2!: (number | null)[];
}

/**
 * The hourly series for one province: bands, categories, dominant pollutants and raw
 * concentrations, all step-aligned. Served by `GET /api/air-quality/provinces/{plateCode}`.
 *
 * ## `analysisEndUtc` returned ADDITIVELY in A2b — the planned return, not a contract slip
 * A1 froze this DTO with NO `analysisEndUtc` and said so in as many words, because Faz-1 was
 * then a one-product (forecast-only) leg: publishing an analysis boundary that the data did not
 * have would have labelled forecast hours as analysis, which SPEC §11.3.1 forbids. A1's own text
 * recorded the escape clause — *"if a product decision (S2) later adds the analysis job, the
 * field returns ADDITIVELY with an honest definition"*.
 *
 * That decision was taken: **DEC 2026-08-02b** ruled S2 YES on production-parity grounds, A2a
 * shipped the two-job ingest, and A2b publishes the boundary. So the field below is the
 * PLANNED return of a deliberately deferred field, additive and nullable — not a silent
 * reshaping of a frozen contract. Everything A1's honesty rule protected still holds, and is
 * now enforced by the store itself: the two products live in SEPARATE columns
 * (`air-quality-province-series.entity.ts`), so "a forecast hour labelled as analysis" is not a
 * mistake anybody can write.
 */
export class AirQualitySeriesDto {
  @ApiProperty({
    type: String,
    isArray: true,
    example: ['2026-08-01T00:00:00.000Z', '2026-08-01T01:00:00.000Z'],
    description:
      'Step instants (ISO-8601 UTC). INVARIANT: every other array in this object has exactly ' +
      'this length; a missing step is null in place, never dropped and never invented. ' +
      'Consecutive steps are exactly one hour apart. Steps BEFORE analysisEndUtc come from the ' +
      'provider ANALYSIS product; that instant and everything after it come from the FORECAST ' +
      'product. Both are model output, neither is an observation. When analysisEndUtc is null ' +
      'the series starts at the model run base time and contains no earlier step.',
  })
  timesUtc!: string[];

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-08-01T00:00:00.000Z',
    description:
      'The instant the ANALYSIS half ends and the FORECAST half begins — always the model run ' +
      'base time. Steps before this instant come from the provider’s ANALYSIS product; this ' +
      'instant and everything after it come from the FORECAST product. Both are model output, ' +
      'not observations. Null when this run carries no analysis product at all, in which case ' +
      'the whole series is forecast.',
  })
  analysisEndUtc!: string | null;

  @ApiProperty({
    type: Number,
    example: 1,
    description: 'Hours between steps (always 1 in Faz-1).',
  })
  stepHours!: number;

  @ApiProperty({
    type: String,
    example: '2026-08-05T00:00:00.000Z',
    description:
      'End of the published horizon — the last entry of timesUtc (run base + 96 h in Faz-1).',
  })
  horizonEndUtc!: string;

  @ApiProperty({
    // Raw schema — item-level nullability, the `MarineSeriesDto` idiom (see the concentrations
    // DTO above). `minimum`/`maximum` are written EXPLICITLY inside `items`: with the raw form
    // there is no auto-descent to put them there for us.
    type: 'array',
    items: { type: 'number', nullable: true, minimum: 1, maximum: 6 },
    description: 'Overall EAQI band per step; null where it cannot be computed.',
  })
  bands!: (number | null)[];

  @ApiProperty({
    // Raw schema — see `bands` for why.
    type: 'array',
    items: { type: 'string', enum: Object.values(AirQualityCategory), nullable: true },
  })
  categories!: (AirQualityCategory | null)[];

  @ApiProperty({
    // Raw schema — see `bands` for why.
    type: 'array',
    items: { type: 'string', enum: Object.values(AirQualityPollutant), nullable: true },
  })
  dominantPollutants!: (AirQualityPollutant | null)[];

  @ApiProperty({ type: AirQualitySeriesConcentrationsDto })
  concentrations!: AirQualitySeriesConcentrationsDto;
}
