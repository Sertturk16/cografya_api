import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Continent } from '../common/continent.enum';
import { Country } from '../country/entities/country.entity';
import { Province } from '../province/entities/province.entity';
import { Region } from '../region/entities/region.entity';
import type { FavoriteDto } from './dto/favorite.dto';
import { FavoriteEntityType } from './dto/favorite.dto';
import { Favorite } from './entities/favorite.entity';
import { FAVORITES_ERROR_KEYS, type FavoritesErrorKey } from './favorites-error-keys';

/** One of the four persisted columns a favorite row's target lives in. */
type FavoriteColumnProperty = 'provinceId' | 'countryId' | 'regionId' | 'continent';

/** A resolved target: the persisted column it belongs in (both spellings) and its internal value. */
interface ResolvedFavoriteTarget {
  readonly property: FavoriteColumnProperty;
  readonly sqlColumn: string;
  /** The province/country/region internal uuid, or the continent enum label verbatim. */
  readonly value: string;
}

/** `entityType` → its persisted column, in both the TypeORM property spelling and the raw SQL spelling. */
const FAVORITE_COLUMN_BY_TYPE: Record<
  FavoriteEntityType,
  Pick<ResolvedFavoriteTarget, 'property' | 'sqlColumn'>
> = {
  [FavoriteEntityType.Province]: { property: 'provinceId', sqlColumn: 'province_id' },
  [FavoriteEntityType.Country]: { property: 'countryId', sqlColumn: 'country_id' },
  [FavoriteEntityType.Region]: { property: 'regionId', sqlColumn: 'region_id' },
  [FavoriteEntityType.Continent]: { property: 'continent', sqlColumn: 'continent' },
};

/** `entityType` → the 404 key thrown when `entityId` is well-formed but names nothing real. */
const FAVORITES_NOT_FOUND_KEY_BY_TYPE: Record<FavoriteEntityType, FavoritesErrorKey> = {
  [FavoriteEntityType.Province]: FAVORITES_ERROR_KEYS.provinceNotFound,
  [FavoriteEntityType.Country]: FAVORITES_ERROR_KEYS.countryNotFound,
  [FavoriteEntityType.Region]: FAVORITES_ERROR_KEYS.regionNotFound,
  [FavoriteEntityType.Continent]: FAVORITES_ERROR_KEYS.continentNotFound,
};

/**
 * List / idempotent-add / idempotent-remove for `favorites`, scoped to the caller's own rows
 * throughout, now polymorphic over all four entity types (P1 PR-A plan §5.1.2, widening
 * UYELIK-07's original province/country-only shape). Every method takes `userId` from
 * `@CurrentUser()` only — no request shape (body, param or query) anywhere in this module carries
 * a `userId` field, so there is no field a caller could override (the cross-user-isolation
 * invariant).
 */
@Injectable()
export class FavoritesService {
  private readonly logger = new Logger('Favorites');

  constructor(
    @InjectRepository(Favorite)
    private readonly favorites: Repository<Favorite>,
    @InjectRepository(Province)
    private readonly provinces: Repository<Province>,
    @InjectRepository(Country)
    private readonly countries: Repository<Country>,
    @InjectRepository(Region)
    private readonly regions: Repository<Region>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * `GET /api/favorites` — a plain, unpaginated array (`ENGINEERING.md` §2's "bounded and small"
   * rule; bounded at <= 81 provinces + ~199 countries + 7 regions + 7 continents = 294 rows,
   * ever, per user). Resolves each row's internal `province_id`/`country_id`/`region_id` back to
   * its published `plateCode`/`isoCode`/`slug` via three batched lookups (`continent` needs no
   * lookup — the stored value already IS the published label) — the favorites table never stores
   * the business key itself for the three FK-backed types (plan §5.1/§5.1.2).
   */
  async listMine(userId: string): Promise<FavoriteDto[]> {
    const rows = await this.favorites.find({ where: { userId }, order: { createdAt: 'ASC' } });
    if (rows.length === 0) return [];

    const provinceIds = rows.map((row) => row.provinceId).filter((id): id is string => id !== null);
    const countryIds = rows.map((row) => row.countryId).filter((id): id is string => id !== null);
    const regionIds = rows.map((row) => row.regionId).filter((id): id is string => id !== null);

    const [provinces, countries, regions] = await Promise.all([
      provinceIds.length > 0
        ? this.provinces.find({ where: { id: In(provinceIds) } })
        : Promise.resolve([]),
      countryIds.length > 0
        ? this.countries.find({ where: { id: In(countryIds) } })
        : Promise.resolve([]),
      regionIds.length > 0
        ? this.regions.find({ where: { id: In(regionIds) } })
        : Promise.resolve([]),
    ]);
    const plateCodeById = new Map(provinces.map((province) => [province.id, province.plateCode]));
    const isoCodeById = new Map(countries.map((country) => [country.id, country.isoCode]));
    const slugById = new Map(regions.map((region) => [region.id, region.slug]));

    const dtos: FavoriteDto[] = [];
    for (const row of rows) {
      const resolved = this.resolveRowBusinessKey(row, plateCodeById, isoCodeById, slugById);
      // `province_id`/`country_id`/`region_id` are `ON DELETE RESTRICT` (favorite.entity.ts), and
      // no seed ever deletes a row (plan §2) — so a dangling reference here should be
      // structurally impossible via this API surface today. Handled defensively anyway
      // (SFH144-M1, extended to `region` per plan §5.1.2): a lookup miss is logged LOUDLY and the
      // row is OMITTED from the list rather than served with a fabricated `entityId` — unlike the
      // old two-field shape, `FavoriteDto.entityId` is a single non-nullable string with no "null
      // means unresolved" escape hatch, so silently minting one would violate the published
      // contract with no signal anywhere.
      if (resolved === null) continue;
      dtos.push(toDto(resolved.entityType, resolved.entityId, row.createdAt));
    }
    return dtos;
  }

  private resolveRowBusinessKey(
    row: Favorite,
    plateCodeById: Map<string, string>,
    isoCodeById: Map<string, string>,
    slugById: Map<string, string>,
  ): { entityType: FavoriteEntityType; entityId: string } | null {
    if (row.provinceId !== null) {
      const plateCode = plateCodeById.get(row.provinceId);
      if (plateCode === undefined) {
        this.warnUnresolvable(row.id, 'province_id', row.provinceId);
        return null;
      }
      return { entityType: FavoriteEntityType.Province, entityId: plateCode };
    }
    if (row.countryId !== null) {
      const isoCode = isoCodeById.get(row.countryId);
      if (isoCode === undefined) {
        this.warnUnresolvable(row.id, 'country_id', row.countryId);
        return null;
      }
      return { entityType: FavoriteEntityType.Country, entityId: isoCode };
    }
    if (row.regionId !== null) {
      const slug = slugById.get(row.regionId);
      if (slug === undefined) {
        this.warnUnresolvable(row.id, 'region_id', row.regionId);
        return null;
      }
      return { entityType: FavoriteEntityType.Region, entityId: slug };
    }
    if (row.continent !== null) {
      return { entityType: FavoriteEntityType.Continent, entityId: row.continent };
    }
    // `CHK_favorites_exactly_one_target` guarantees exactly one of the four columns is non-null
    // for every persisted row — this branch exists only to satisfy the return type and to fail
    // loudly rather than silently if that guarantee is ever violated.
    this.logger.warn(
      `favorites row ${row.id} has no non-null target column, which ` +
        `CHK_favorites_exactly_one_target should make impossible. Omitting it from the list.`,
    );
    return null;
  }

  private warnUnresolvable(rowId: string, sqlColumn: string, targetId: string): void {
    this.logger.warn(
      `favorites row ${rowId} references ${sqlColumn} ${targetId}, which no longer resolves to a ` +
        `row (${sqlColumn} is ON DELETE RESTRICT — this should never happen). Omitting this row ` +
        `from the list.`,
    );
  }

  /**
   * Resolves `(entityType, entityId)` — the published business key pair — to the internal target
   * a `favorites` row would store, or `null` if `entityId` is well-formed but names nothing real.
   * For `province`/`country`/`region` this is a lookup by the entity's own business-key column;
   * for `continent` it is pure in-memory membership in the `Continent` enum, no query at all
   * (plan §5.1.2's "batches its lookups per type … resolves continents from the in-memory enum
   * with no query at all").
   */
  private async resolveTarget(
    entityType: FavoriteEntityType,
    entityId: string,
  ): Promise<ResolvedFavoriteTarget | null> {
    const column = FAVORITE_COLUMN_BY_TYPE[entityType];
    switch (entityType) {
      case FavoriteEntityType.Province: {
        const province = await this.provinces.findOne({ where: { plateCode: entityId } });
        return province === null ? null : { ...column, value: province.id };
      }
      case FavoriteEntityType.Country: {
        const country = await this.countries.findOne({ where: { isoCode: entityId } });
        return country === null ? null : { ...column, value: country.id };
      }
      case FavoriteEntityType.Region: {
        const region = await this.regions.findOne({ where: { slug: entityId } });
        return region === null ? null : { ...column, value: region.id };
      }
      case FavoriteEntityType.Continent: {
        const isKnownContinent = (Object.values(Continent) as string[]).includes(entityId);
        return isKnownContinent ? { ...column, value: entityId } : null;
      }
    }
  }

  /**
   * `PUT /api/favorites/{entityType}/{entityId}` — idempotent add. Resolves `entityId` to the
   * real target BEFORE any write touches `favorites` (404 if unknown), then a SINGLE atomic
   * `INSERT … ON CONFLICT (user_id, <column>) DO UPDATE … RETURNING` (plan §5.1.2, race fix
   * `SFH144-I1`/round 2, unchanged in shape from the original two-type implementation — only the
   * column and value are now selected per `entityType`).
   *
   * `DO UPDATE SET "user_id" = EXCLUDED."user_id"` is a no-op write on conflict (every column
   * that matters — `created_at` — is left untouched, so a repeat add still echoes the ORIGINAL
   * creation timestamp) whose only purpose is making `RETURNING` fire on both branches: the
   * statement always inserts-or-updates and returns exactly one row in one round trip, so there
   * is no window left for a concurrent `DELETE` on the same pair to land between two separate
   * statements — the same atomic upsert-and-return idiom `AuthRateLimitService.consume` already
   * uses. **This idiom must not be "simplified" back to `DO NOTHING` + a re-read** — see the
   * entity/plan history this docblock inherits for exactly the bogus-500 regression that would
   * reopen.
   *
   * `column.sqlColumn` is interpolated into the SQL text rather than bound as a parameter (column
   * identifiers cannot be bound parameters in Postgres), but it is never attacker-controlled: it
   * comes only from {@link FAVORITE_COLUMN_BY_TYPE}, a fixed internal map keyed by the validated
   * `FavoriteEntityType` enum, never from the request body or any user-supplied string.
   */
  async addTarget(
    userId: string,
    entityType: FavoriteEntityType,
    entityId: string,
  ): Promise<FavoriteDto> {
    const target = await this.resolveTarget(entityType, entityId);
    if (target === null) {
      throw new NotFoundException(FAVORITES_NOT_FOUND_KEY_BY_TYPE[entityType]);
    }

    const rows = await this.dataSource.query<{ created_at: Date }[]>(
      `INSERT INTO "favorites" ("user_id", "${target.sqlColumn}")
       VALUES ($1, $2)
       ON CONFLICT ("user_id", "${target.sqlColumn}") DO UPDATE SET "user_id" = EXCLUDED."user_id"
       RETURNING "created_at"`,
      [userId, target.value],
    );
    const [row] = rows;
    if (row === undefined) {
      // Cannot happen for an `INSERT … ON CONFLICT DO UPDATE` — kept as a fail-closed guard
      // against `noUncheckedIndexedAccess`, not a reachable runtime path.
      throw new Error(`favorites: ${entityType} upsert returned no row`);
    }
    return toDto(entityType, entityId, row.created_at);
  }

  /**
   * `DELETE /api/favorites/{entityType}/{entityId}` — unconditionally idempotent (plan §5.1.2):
   * 0 rows deleted and 1 row deleted are both success, and a well-formed but unknown `entityId`
   * is ALSO a no-op rather than a 404 — the caller never needs to distinguish "never favorited"
   * from "unknown target" from "just removed". Every delete filters by `userId` — never by the
   * target column alone — so this can never remove another user's row (the cross-user-isolation
   * invariant).
   */
  async removeTarget(
    userId: string,
    entityType: FavoriteEntityType,
    entityId: string,
  ): Promise<void> {
    const target = await this.resolveTarget(entityType, entityId);
    if (target === null) return;

    switch (target.property) {
      case 'provinceId':
        await this.favorites.delete({ userId, provinceId: target.value });
        return;
      case 'countryId':
        await this.favorites.delete({ userId, countryId: target.value });
        return;
      case 'regionId':
        await this.favorites.delete({ userId, regionId: target.value });
        return;
      case 'continent':
        await this.favorites.delete({ userId, continent: target.value as Continent });
        return;
    }
  }
}

function toDto(entityType: FavoriteEntityType, entityId: string, createdAt: Date): FavoriteDto {
  return { entityType, entityId, createdAt: createdAt.toISOString() };
}
