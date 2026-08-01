import { ApiProperty } from '@nestjs/swagger';
import {
  AirQualityCategory,
  AirQualityFreshness,
  AirQualityIndexSystem,
  AirQualityPollutant,
  AirQualitySource,
  AirQualityStatus,
} from '../air-quality.types';
import { AirQualityPollutantValueDto } from './air-quality-pollutant-value.dto';

/**
 * The EAQI value for ONE instant at one province reference point, with everything needed to
 * judge whether and how it may be shown (the honest-presentation contract, SPEC §13.1).
 *
 * **NOT SERVED BY ANY A1 ENDPOINT** — frozen contract, published for codegen; the province
 * endpoints land in A2 (see `AirQualityPollutantValueDto` for the freeze rules).
 *
 * No colour, no display text, no health advice anywhere in this contract: the API carries
 * tokens; rendering is the web repo's editorial surface (DEC 2026-07-30w).
 */
export class AirQualityIndexDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 6,
    example: 2,
    description: 'Overall EAQI band = the WORST per-pollutant sub-band. Null unless status=ok.',
  })
  band!: number | null;

  @ApiProperty({
    enum: AirQualityCategory,
    nullable: true,
    description:
      'Category TOKEN for the band — never user-facing text; TR/EN names and the ' +
      '"our translation" label are web i18n keys.',
  })
  category!: AirQualityCategory | null;

  @ApiProperty({
    enum: AirQualityPollutant,
    nullable: true,
    description:
      'The pollutant that set the worst band. Ties are broken deterministically by the ' +
      'published order (see GET /api/air-quality/index-system → tieBreakOrder).',
  })
  dominantPollutant!: AirQualityPollutant | null;

  @ApiProperty({
    enum: AirQualityIndexSystem,
    description:
      'Which index methodology produced band/category. The full band table behind this ' +
      'token is published at GET /api/air-quality/index-system; the web must not hardcode it. ' +
      'Adding a member is treated as a BREAKING change (exhaustive switches).',
  })
  indexSystem!: AirQualityIndexSystem;

  @ApiProperty({ enum: AirQualityStatus })
  status!: AirQualityStatus;

  @ApiProperty({
    enum: AirQualityFreshness,
    nullable: true,
    description: 'Cache freshness; ALWAYS null when status !== ok.',
  })
  freshness!: AirQualityFreshness | null;

  @ApiProperty({
    type: AirQualityPollutantValueDto,
    isArray: true,
    description:
      'Raw per-pollutant concentrations + sub-indexes (DEC 2026-07-30w: the index stays ' +
      'auditable against the numbers it came from).',
  })
  pollutants!: AirQualityPollutantValueDto[];

  @ApiProperty({
    enum: AirQualityPollutant,
    isArray: true,
    description:
      'Pollutants missing at this instant. A partial index is still published; honesty here ' +
      'means SAYING what is missing, not hiding what is known. All five missing → status ' +
      'no_data.',
  })
  missingPollutants!: AirQualityPollutant[];

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-08-01T14:00:00.000Z',
    description:
      'The model step this value belongs to (ISO-8601 UTC). Derived from the REQUESTED run ' +
      'day + hour offset — the file’s own free-text time label is only cross-validated, ' +
      'never parsed as the source of truth.',
  })
  validAtUtc!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-08-01T00:00:00.000Z',
    description: 'CAMS model run base time (00:00 UTC of the run day) — the "model time".',
  })
  modelRunAtUtc!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-08-01T12:41:03.000Z',
    description: 'When the run file was downloaded and decoded by this server.',
  })
  ingestedAtUtc!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-08-01T14:03:11.000Z',
    description:
      'When THIS response was compiled from the local store (cache semantics only — the ' +
      'model/ingest instants above are the honest data times).',
  })
  fetchedAtUtc!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: 'When the served value started counting as stale; null while fresh.',
  })
  staleSinceUtc!: string | null;

  @ApiProperty({ enum: AirQualitySource })
  source!: AirQualitySource;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'cams-europe-air-quality-forecasts',
    description: 'Provider dataset identifier, verbatim.',
  })
  datasetId!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 39.95,
    description: 'Latitude of the grid-cell CENTRE the value was read from.',
  })
  gridLatitude!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 32.85 })
  gridLongitude!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 3.1,
    description:
      'Distance (km) between the requested province reference point and the grid-cell ' +
      'centre. This is the WITHIN-CELL offset of nearest-cell sampling — never the result of ' +
      'searching for a "better" cell; interpolation and averaging are banned by design.',
  })
  distanceKm!: number | null;

  @ApiProperty({
    type: Number,
    example: 0.1,
    description:
      'Model grid resolution in degrees (~11 km background level). Street-level differences ' +
      'are below this resolution by construction — honest-presentation field.',
  })
  gridResolutionDegrees!: number;
}
