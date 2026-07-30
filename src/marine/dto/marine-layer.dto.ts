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
 * means. It exists because the providers disagree with themselves: Open-Meteo documents wave
 * direction as "the direction the waves come from" and ocean-current direction as "where the
 * current is heading towards" — inside the same API. A reversed wind arrow is the textbook
 * "silently wrong while every test is green" defect.
 *
 * **BINDING (SPEC-ADDENDUM §5.5): no surface may draw a direction arrow until BOTH this field
 * is published AND M3's empirical wind-convention regression test exists.** M1 satisfies only
 * the first half. Publishing it here is what unblocks Vera's contract work, not her arrows.
 *
 * ## M1 completeness
 * The static half ships now. Three fields resolve from the provider's STAC catalogue and are
 * therefore `null` until M3 wires that fetch: `horizonEndUtc`, `updateFrequency`,
 * `catalogueUpdatedAtUtc`. They are nullable in the contract anyway (a provider may not
 * publish them), so M3 fills values into an unchanged shape — no breaking change.
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
      'INTERLOCK: publishing this field is only the FIRST of two preconditions for rendering a ' +
      'direction arrow. The second is M3’s regression test, which pins Open-Meteo’s wind ' +
      'convention — the provider does not document it, so it was established empirically. Until ' +
      'that test exists, direction-arrow rendering is out of scope on every surface; consume ' +
      'this field for labels and data, not for arrows.',
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
      'Last instant the provider can serve (ISO-8601 UTC). NULL IN M1 — resolved from the ' +
      'provider catalogue in M3. The horizon is genuinely variable (4–9 days by product), so ' +
      'the web must read it here rather than hardcode a slider bound.',
  })
  horizonEndUtc!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'twice-daily: 00:00 UTC; 12:00 UTC',
    description:
      'How often the provider re-runs the model, as the provider states it. NULL IN M1 — ' +
      'resolved from the provider catalogue in M3. Carried at LAYER level rather than per ' +
      'value because neither Faz-1 provider publishes a model-run time per value; a per-value ' +
      'field would be null 31 × 5 times per response.',
  })
  updateFrequency!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'When the provider last updated its catalogue entry (ISO-8601 UTC). NULL IN M1 — ' +
      'resolved from the provider catalogue in M3.',
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
