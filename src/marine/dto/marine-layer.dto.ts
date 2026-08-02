import { ApiProperty } from '@nestjs/swagger';
import {
  MARINE_DIRECTION_REFERENCE,
  MarineDirectionConvention,
  MarineLayerId,
  MarineSource,
  MarineUnit,
} from '../marine.types';

/** One stop of a layer's colour ramp. */
export class MarineColorStopDto {
  @ApiProperty({ example: 20, description: 'Value the stop is anchored at, in the layer unit.' })
  value!: number;

  @ApiProperty({ example: '#2c7fb8', description: 'Colour, `#rrggbb`.' })
  hex!: string;
}

/**
 * The machine-readable catalogue entry for one layer — the authority for how a value may be
 * rendered.
 *
 * ## The one field that is a safety interlock, not metadata
 * `directionConvention` is the ONLY machine-readable statement of what a direction degree
 * means. It exists because the providers disagree with themselves: ECMWF states its mean wave
 * direction as "coming from" and, on the same page, its wave SPECTRUM fields as "propagating
 * towards" — two conventions inside one wave model. A reversed arrow is the textbook "silently
 * wrong while every test is green" defect.
 *
 * **BINDING (SPEC-ADDENDUM §5.5): no surface may draw a direction arrow until BOTH this field
 * is published AND the wind-convention regression suite exists.** M1 satisfied only the first
 * half. M3a satisfies the second — the full condition is written out on the field itself, so a
 * web consumer reading only the generated types can see what it rests on.
 *
 * ## Completeness
 * The static half shipped in M1. Three fields resolve from the provider's catalogue and are
 * still `null`: `horizonEndUtc`, `updateFrequency`, `catalogueUpdatedAtUtc`. They are nullable
 * in the contract regardless (a provider may not publish them), so filling them later changes
 * no shape.
 */
export class MarineLayerDto {
  @ApiProperty({
    enum: MarineLayerId,
    description:
      'Layer id, snake_case. It corresponds one-to-one with a MarineValueDto property on the ' +
      'conditions/overview payloads, but those are camelCase — sea_surface_temperature ↔ ' +
      'seaSurfaceTemperature — so convert the case rather than indexing the payload by this id.',
  })
  id!: MarineLayerId;

  @ApiProperty({ example: 'Deniz suyu sıcaklığı', description: 'Display label (TR).' })
  labelTr!: string;

  @ApiProperty({ example: 'Sea surface temperature', description: 'Display label (EN).' })
  labelEn!: string;

  @ApiProperty({ enum: MarineUnit, description: 'Canonical unit of this layer’s values.' })
  unit!: MarineUnit;

  @ApiProperty({
    enum: MarineDirectionConvention,
    nullable: true,
    description:
      `What a degree MEANS for this layer; null for non-direction layers. ${MARINE_DIRECTION_REFERENCE} ` +
      'ARROW-UNLOCK CONDITION (binding, and now MET for wind_speed_10m and wind_direction_10m): ' +
      'a direction arrow may be drawn once this field is published AND the three-layer wind ' +
      'regression suite is green — (1) a table of eight cardinal vectors mapped to expected ' +
      'bearings, (2) the invariants every bearing in [0, 360), speed >= 0, speed >= |u| and |v|, ' +
      'and a null component producing a null bearing rather than 0, and (3) a committed real ' +
      'ECMWF GRIB message decoded and compared against ecCodes reference values. All three ship ' +
      'in src/marine/ecmwf/ and run on CI. The condition exists because ECMWF publishes wind as ' +
      'the vector components 10u/10v, so the bearing is SERVER-DERIVED arithmetic: a sign error ' +
      'produces a bearing exactly 180 degrees wrong, and a reversed arrow is indistinguishable ' +
      'from a correct one on screen. Wave direction is not derived — ECMWF states mwd as ' +
      '"degree true, zero means coming from the north" and it is published verbatim.',
  })
  directionConvention!: MarineDirectionConvention | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 0.1,
    description:
      'Below this magnitude the sea/wind counts as CALM. Published on the MAGNITUDE layer ' +
      '(wave_height, wind_speed_10m) and it governs the PAIRED direction layer: when ' +
      'wave_height < its calmThreshold the web shows a calm indicator instead of a ' +
      'wave_direction arrow, and likewise for wind. Null on the direction layers themselves ' +
      'and on temperature. The server never suppresses the direction value — nulling it would ' +
      'make "calm" indistinguishable from "no data".',
  })
  calmThreshold!: number | null;

  @ApiProperty({ enum: MarineSource, description: 'Primary provider for this layer.' })
  primarySource!: MarineSource;

  @ApiProperty({
    enum: MarineSource,
    nullable: true,
    description:
      'Provider used where the primary does not cover the point (CMEMS carries no wave field ' +
      'in the Marmara), or null when there is no fallback.',
  })
  fallbackSource!: MarineSource | null;

  @ApiProperty({ example: 3, description: 'Series step for this layer, hours.' })
  stepHours!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Last instant the PRIMARY provider can serve (ISO-8601 UTC), or null while the provider ' +
      'catalogue is unresolved. ECMWF layers: the newest ingested cycle’s published horizon. ' +
      'CMEMS layers: the MINIMUM of the serving products’ temporal-extent ends — the layer is ' +
      'one field for every basin, so the only horizon it can honour everywhere is the earliest ' +
      'one; it nulls when any serving product is unresolved or open-ended. The horizon is ' +
      'genuinely variable (4–9 days by product), so the web must read it here rather than ' +
      'hardcode a slider bound.',
  })
  horizonEndUtc!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'daily: 16:00; 20th of each month at 16UTC',
    description:
      'How often the provider re-runs the model, as the provider states it — PROVIDER-VERBATIM ' +
      'and not machine-parseable by contract. For CMEMS layers this is the STAC ' +
      'updateFrequencies compaction; when the serving products state different cadences the ' +
      'distinct strings are joined with " | ". Null while the catalogue is unresolved. Carried ' +
      'at LAYER level rather than per value because neither Faz-1 provider publishes a ' +
      'model-run time per value.',
  })
  updateFrequency!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'When the provider last updated its catalogue entry (ISO-8601 UTC), or null while ' +
      'unresolved. ECMWF layers: the model-run time of the newest ingested cycle (that ' +
      'provider has no catalogue document to date-stamp). CMEMS layers: the NEWEST ' +
      'admp_updated stamp across the serving products.',
  })
  catalogueUpdatedAtUtc!: string | null;

  @ApiProperty({
    type: MarineColorStopDto,
    isArray: true,
    description: 'Colour ramp for this layer, ascending by value.',
  })
  colorStops!: MarineColorStopDto[];

  @ApiProperty({
    example: 'cmems',
    description:
      'Key of the MarineAttributionDto that must accompany this layer. Attribution ROWS are ' +
      'seeded in M5; the reference is frozen now so the join is stable.',
  })
  attributionId!: string;
}
