import { ApiProperty } from '@nestjs/swagger';
import { EarthquakeDataStatus } from '../earthquake.types';
import { EarthquakeAttributionDto } from './earthquake-attribution.dto';
import { EarthquakeFilterEchoDto } from './earthquake-filter-echo.dto';

/**
 * Everything about an earthquake list response that is NOT the shared pagination core.
 *
 * This object is where `DEC 2026-08-12k` §2's split becomes visible in the published contract:
 * the core five (`items`, `page`, `pageSize`, `total`, `hasMore`) sit at the top level and bind
 * every future list, while these five are **this endpoint's extension** and bind nothing else. A
 * blog list has no "data status" and no attribution, and a shared envelope that forced those
 * fields on it would be broken on its first day — after which the person breaking it would be
 * right (`DEC 2026-08-12k` §2 and §7).
 *
 * The reason it is a nested object rather than five more top-level keys is measured, not
 * stylistic: `@nestjs/swagger` emits a subclass schema FLAT, so an inherited base cannot mark
 * which keys are the shared core. Nesting is the only form in which the boundary survives into
 * `openapi.json` — see `PaginationEnvelopeDto`.
 */
export class EarthquakeListMetaDto {
  @ApiProperty({
    type: EarthquakeFilterEchoDto,
    description: 'The filter actually applied, defaults resolved.',
  })
  filter!: EarthquakeFilterEchoDto;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-08-11T12:30:00.000Z',
    description:
      'When our last SUCCESSFUL contact with the provider finished, UTC; null before the first ' +
      'one. This — not build time — is what a dateModified or a sitemap lastmod derives from. ' +
      'Distinct from latestEventAtUtc on purpose: a quiet hour and an outage look identical ' +
      'from the newest event alone.',
  })
  dataUpdatedAtUtc!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-08-11T11:03:34.000Z',
    description:
      'Origin time of the newest event we hold, UTC; null when the store is empty. A concrete ' +
      'fact for the page description (SEO-POLICY Part A2), not a freshness claim.',
  })
  latestEventAtUtc!: string | null;

  @ApiProperty({
    enum: EarthquakeDataStatus,
    example: EarthquakeDataStatus.Ok,
    description:
      'Structural freshness verdict. The API ships this token and absolute timestamps; the ' +
      "sentence shown to the reader is the web layer's, and it is never a standing promise " +
      'like "updated every 5 minutes" — a fixed promise becomes a lie the moment the provider ' +
      'goes quiet (DEC 2026-08-12k D-F).',
  })
  dataStatus!: EarthquakeDataStatus;

  @ApiProperty({
    type: EarthquakeAttributionDto,
    isArray: true,
    description:
      'Required provider attribution, populated on EVERY response — including the cold path ' +
      'and every dataStatus. A licence notice that blinks with provider health does not ' +
      'discharge the obligation.',
  })
  attributions!: EarthquakeAttributionDto[];
}
