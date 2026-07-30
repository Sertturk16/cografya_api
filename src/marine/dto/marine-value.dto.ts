import { ApiProperty } from '@nestjs/swagger';
import {
  MARINE_DIRECTION_REFERENCE,
  MarineFreshness,
  MarineSource,
  MarineStatus,
  MarineUnit,
} from '../marine.types';

/**
 * ONE served number, with everything needed to judge whether it may be shown.
 *
 * Named `MarineValueDto`, not `MarineMeasurementDto` (SPEC-ADDENDUM §7.1 / B1): these are
 * MODEL OUTPUTS, not observations, and the old name contradicted our own disclaimer. It is
 * also not `MarineForecastValueDto` — hindcast steps are served too.
 *
 * **NOT IMPLEMENTED IN M1.** This shape is frozen and published now (SPEC-ADDENDUM §8.2) so
 * the web repo can codegen and build against a mock; the endpoints that return it land in M3
 * (Open-Meteo) and M4 (CMEMS + merge). The shapes are safe to freeze because they were derived
 * from measured provider responses — the raw unit strings, the ABSENCE of a time field in the
 * CMEMS reply, the grid-centre snapping behaviour and the XML error path were all verified
 * live — which is where late surprises normally come from.
 */
export class MarineValueDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    example: 23.5,
    description:
      'The value, or null when status !== ok. NOT suppressed when the sea is calm: a ' +
      'server-side null would become indistinguishable from a genuine no_data. The layer ' +
      'catalogue publishes calmThreshold instead, and the DISPLAY decides not to draw an arrow.',
  })
  value!: number | null;

  @ApiProperty({
    enum: MarineUnit,
    description:
      'Canonical machine unit. Providers return three different strings for the same ' +
      'quantity (m / degree / degrees_C from CMEMS; m / ° / °C / km/h from Open-Meteo), so ' +
      'passthrough is not an option. Symbols are a display concern (web i18n).',
  })
  unit!: MarineUnit;

  @ApiProperty({
    enum: MarineStatus,
    description:
      'Why the value is or is not present. not_supported is a PERMANENT product truth (CMEMS ' +
      'carries no wave field in the Marmara at all) and is distinct from no_data ("covered ' +
      'here, but nothing right now"); the two must not render alike.',
  })
  status!: MarineStatus;

  @ApiProperty({
    enum: MarineFreshness,
    nullable: true,
    description:
      'Cache freshness, ALWAYS null when status !== ok. Deliberately separate from status: ' +
      'ok + stale is a normal, frequent combination (provider quiet for 20 minutes, we hold a ' +
      '40-minute-old valid number).',
  })
  freshness!: MarineFreshness | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-07-30T12:00:00.000Z',
    description:
      'The MODEL time this value belongs to (ISO-8601 UTC). For CMEMS this is the time WE ' +
      'sent: the GetFeatureInfo reply carries no time field at all, yet the time parameter ' +
      'does change the value — so an explicit time is always sent and never defaulted.',
  })
  validAtUtc!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-07-30T12:04:11.000Z',
    description: 'When WE fetched it (ISO-8601 UTC, server clock).',
  })
  fetchedAtUtc!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-07-30T12:00:00.000Z',
    description:
      'The model RUN this value came from (ISO-8601 UTC). ECMWF: the 00/06/12/18 UTC cycle, ' +
      'which the provider states in both the URL and the GRIB header. CMEMS: null — it ' +
      'publishes no run time per value. Added because it is the ONLY field that can reveal a ' +
      'stale forecast: an old cycle still produces a step valid "now", so validAtUtc looks ' +
      'current and fetchedAtUtc is genuinely recent while the numbers are two days old.',
  })
  modelRunAtUtc!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'When this value first became stale (ISO-8601 UTC), or null while fresh. Two ' +
      'independent ceilings can retire a value: cache age and model validity age — they catch ' +
      'different failures, since a value fetched 10 minutes ago may belong to an 8-hour-old ' +
      'model step.',
  })
  staleSinceUtc!: string | null;

  @ApiProperty({
    enum: MarineSource,
    nullable: true,
    description:
      'Which provider produced THIS field. Carried per field, never per response: mixing ' +
      'sources silently is banned (K6), and the Marmara wave fields legitimately come from a ' +
      'different provider than the temperature next to them.',
  })
  source!: MarineSource | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example:
      'BLKSEA_ANALYSISFORECAST_PHY_007_001/cmems_mod_blk_phy-tem_anfc_mrm-500m_PT1H-i_202311',
    description: 'Provider dataset identifier, verbatim, when the provider reports one.',
  })
  datasetId!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Latitude of the model grid cell centre the value was read from.',
  })
  gridLatitude!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Longitude of the model grid cell centre the value was read from.',
  })
  gridLongitude!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 1.2,
    description:
      'Distance from the requested coordinate to that grid centre, km. On BOTH Faz-1 sources ' +
      'this is an IN-CELL OFFSET, never a search distance: the value comes from the cell the ' +
      'coordinate falls in, and neither leg ever looks for a nearer wet cell. It therefore ' +
      'cannot exceed half a cell diagonal — ≤ ~2 km for the regional CMEMS grids, ≤ ~21 km for ' +
      'the 0.25° ECMWF grid (largest measured over the 30 reference points: 15.5 km) — and it ' +
      'cannot warn that data is far away. What it CAN do is expose a mapping bug: an offset ' +
      'above half a diagonal means the arithmetic picked the wrong cell.',
  })
  distanceKm!: number | null;
}

/**
 * Re-exported so the direction wording is written once. Quoted into the OpenAPI description of
 * every direction-bearing field.
 */
export const MARINE_VALUE_DIRECTION_REFERENCE = MARINE_DIRECTION_REFERENCE;
