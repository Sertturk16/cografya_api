import { ApiProperty } from '@nestjs/swagger';

/**
 * Which kind of target one favorite row names — a plain TS enum, NOT persisted (derivable from
 * which FK column is set; storing it would be redundant, mutable-independent state the entity's
 * own `CHK_favorites_exactly_one_target` already pins).
 *
 * Lowercase ASCII values, matching `CountryEntityType`'s own "structural signal, not a domain
 * name" casing convention — deliberately not `GeographicRegion`'s ALL_CAPS Turkish-name style,
 * since this discriminator names a shape, not a curriculum term.
 */
export enum FavoriteTargetType {
  Province = 'province',
  Country = 'country',
}

/**
 * The persisted-row echo, returned both by `GET /api/favorites` (one per item) and by each `PUT`
 * add endpoint (plan §5.4/§5.5).
 *
 * **Deliberately omits `id` and `userId`**, matching `VideoProgressDto`'s minimum-surface
 * precedent — the client already knows its own identity, and the favorites API never surfaces
 * the internal `favorites` row id or the province/country `uuid` anywhere (plan §5.1): externally
 * it only ever speaks `plateCode`/`isoCode`, exactly like every other province/country-facing
 * surface in this repo today. The business key the client already used to add the favorite is
 * also the key it gets back, so no second identifier space is introduced.
 */
export class FavoriteDto {
  @ApiProperty({
    enum: FavoriteTargetType,
    description: 'Which kind of target this favorite names.',
  })
  type!: FavoriteTargetType;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '34',
    description: 'provinces.plate_code. Set iff type === "province"; null otherwise.',
  })
  plateCode!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'TR',
    description: 'countries.iso_code. Set iff type === "country"; null otherwise.',
  })
  isoCode!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When this favorite was created, UTC.',
  })
  createdAt!: string;
}
