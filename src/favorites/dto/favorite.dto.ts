import { ApiProperty } from '@nestjs/swagger';

/**
 * Which kind of target one favorite row names — a plain TS enum, NOT persisted as a discrete
 * discriminator column (derivable at read time from which of the four target columns is set;
 * storing it separately would be redundant, mutable-independent state the entity's own
 * `CHK_favorites_exactly_one_target` already pins).
 *
 * Lowercase ASCII values, matching `CountryEntityType`'s own "structural signal, not a domain
 * name" casing convention — deliberately not `GeographicRegion`'s ALL_CAPS Turkish-name style,
 * since this discriminator names a shape, not a curriculum term.
 *
 * **Renamed from `FavoriteTargetType` (P1 PR-A, widening from two to four members)** — the old
 * name no longer fit once the type stopped being purely a read-side render detail and became the
 * literal `{entityType}` path segment of a public route.
 */
export enum FavoriteEntityType {
  Province = 'province',
  Country = 'country',
  Region = 'region',
  Continent = 'continent',
}

/**
 * The persisted-row echo, returned both by `GET /api/favorites` (one per item) and by each
 * `PUT /api/favorites/{entityType}/{entityId}` add call (plan §5.1.2).
 *
 * **Deliberately omits `id` and `userId`**, matching `VideoProgressDto`'s minimum-surface
 * precedent — the client already knows its own identity, and the favorites API never surfaces
 * the internal `favorites` row id or the province/country/region internal `uuid` anywhere:
 * externally it only ever speaks the published business key for `entityType` (`plateCode` /
 * `isoCode` / `slug` / a `Continent` enum label). The business key the client already used to add
 * the favorite is also the key it gets back, so no second identifier space is introduced.
 *
 * **`entityId` replaces the old two-field `plateCode`/`isoCode` pair (P1 PR-A, breaking
 * change).** One non-nullable string carrying whichever business key `entityType` names, rather
 * than two always-one-of-them-null fields — the shape a genuinely polymorphic API surface needs
 * once there are four types instead of two (four nullable fields does not scale).
 */
export class FavoriteDto {
  @ApiProperty({
    enum: FavoriteEntityType,
    description: 'Which kind of target this favorite names.',
  })
  entityType!: FavoriteEntityType;

  @ApiProperty({
    type: String,
    example: '34',
    description:
      'The published business key for entityType — provinces.plate_code, countries.iso_code, ' +
      "regions.slug, or a Continent enum label. Never the entity's internal uuid.",
  })
  entityId!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When this favorite was created, UTC.',
  })
  createdAt!: string;
}
