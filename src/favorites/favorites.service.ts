import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Country } from '../country/entities/country.entity';
import { Province } from '../province/entities/province.entity';
import type { FavoriteDto } from './dto/favorite.dto';
import { FavoriteTargetType } from './dto/favorite.dto';
import { Favorite } from './entities/favorite.entity';
import { FAVORITES_ERROR_KEYS } from './favorites-error-keys';

/**
 * List / idempotent-add / idempotent-remove for `favorites`, scoped to the caller's own rows
 * throughout (plan §5.5). Every method takes `userId` from `@CurrentUser()` only — no request
 * shape (body, param or query) anywhere in this module carries a `userId` field, so there is no
 * field a caller could override (the cross-user-isolation invariant).
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
    private readonly dataSource: DataSource,
  ) {}

  /**
   * `GET /api/favorites` — a plain, unpaginated array (`ENGINEERING.md` §2's "bounded and small"
   * rule; bounded at <= 81 provinces + ~199 countries = 280 rows, ever, per user). Resolves each
   * row's internal `province_id`/`country_id` back to its published `plateCode`/`isoCode` via two
   * batched lookups — the favorites table never stores the business key itself (plan §5.1/§5.2).
   */
  async listMine(userId: string): Promise<FavoriteDto[]> {
    const rows = await this.favorites.find({ where: { userId }, order: { createdAt: 'ASC' } });
    if (rows.length === 0) return [];

    const provinceIds = rows.map((row) => row.provinceId).filter((id): id is string => id !== null);
    const countryIds = rows.map((row) => row.countryId).filter((id): id is string => id !== null);

    const [provinces, countries] = await Promise.all([
      provinceIds.length > 0
        ? this.provinces.find({ where: { id: In(provinceIds) } })
        : Promise.resolve([]),
      countryIds.length > 0
        ? this.countries.find({ where: { id: In(countryIds) } })
        : Promise.resolve([]),
    ]);
    const plateCodeById = new Map(provinces.map((province) => [province.id, province.plateCode]));
    const isoCodeById = new Map(countries.map((country) => [country.id, country.isoCode]));

    return rows.map((row) => {
      // `province_id`/`country_id` are `ON DELETE RESTRICT` (favorite.entity.ts), and neither
      // `seedGeography` nor `seedWorld` ever deletes a row (plan §2) — so a dangling reference
      // here should be structurally impossible via this API surface today. It is handled
      // defensively anyway (SFH144-M1): a lookup miss falls back to `null` rather than throwing,
      // but that fallback is now LOUD, matching `ProvinceClimate`'s own "this should never happen,
      // serve null and log" convention (`province.service.ts`) rather than silently minting a
      // `FavoriteDto` that violates its own documented contract with no signal anywhere.
      const plateCode =
        row.provinceId === null ? null : (plateCodeById.get(row.provinceId) ?? null);
      if (row.provinceId !== null && plateCode === null) {
        this.logger.warn(
          `favorites row ${row.id} references province_id ${row.provinceId}, which no longer ` +
            `resolves to a provinces row (province_id is ON DELETE RESTRICT — this should never ` +
            `happen). Serving plateCode: null rather than throwing.`,
        );
      }
      const isoCode = row.countryId === null ? null : (isoCodeById.get(row.countryId) ?? null);
      if (row.countryId !== null && isoCode === null) {
        this.logger.warn(
          `favorites row ${row.id} references country_id ${row.countryId}, which no longer ` +
            `resolves to a countries row (country_id is ON DELETE RESTRICT — this should never ` +
            `happen). Serving isoCode: null rather than throwing.`,
        );
      }
      return toDto(
        row.provinceId !== null ? FavoriteTargetType.Province : FavoriteTargetType.Country,
        plateCode,
        isoCode,
        row.createdAt,
      );
    });
  }

  /**
   * `PUT .../provinces/{plateCode}` — idempotent add. Resolves `plateCode` to the real row BEFORE
   * any write touches `favorites` (404 if unknown), then a SINGLE atomic `INSERT … ON CONFLICT
   * (user_id, province_id) DO UPDATE … RETURNING` (plan §5.3, race fix `SFH144-I1`/round 2).
   *
   * This used to be `DO NOTHING` followed by a separate re-read (`findOneOrFail`) to fetch the
   * row for the echoed `FavoriteDto`, on the reasoning that `DO NOTHING` returns no row on
   * conflict. That reasoning was correct but incomplete: the window between the INSERT committing
   * and the follow-up SELECT running was NOT safe here the way it is in
   * `VideoProgressService.upsert` (which this was copied from) — `video_progress` has no
   * `@Delete()` route, so no concurrent request can ever remove the row in that window, while
   * `removeProvince` below is exactly such a route for the exact same `(user_id, province_id)`
   * pair. A concurrent add + remove could land the DELETE inside that window, so the re-read found
   * no row and threw an uncaught `EntityNotFoundError` — surfacing as a bogus 500 on a request
   * that had, in fact, already been satisfied.
   *
   * `DO UPDATE SET "user_id" = EXCLUDED."user_id"` is a no-op write on conflict (every column that
   * matters — `created_at` — is left untouched, so a repeat add still echoes the ORIGINAL creation
   * timestamp) whose only purpose is making `RETURNING` fire on both branches: the statement now
   * always inserts-or-updates and returns exactly one row in one round trip, so there is no window
   * left for a concurrent `DELETE` on the same pair to land in between two separate statements —
   * this is the same atomic upsert-and-return idiom `AuthRateLimitService.consume` already uses
   * (`auth-rate-limit.service.ts`), not a new pattern.
   */
  async addProvince(userId: string, plateCode: string): Promise<FavoriteDto> {
    const province = await this.provinces.findOne({ where: { plateCode } });
    if (province === null) throw new NotFoundException(FAVORITES_ERROR_KEYS.provinceNotFound);

    const rows = await this.dataSource.query<{ created_at: Date }[]>(
      `INSERT INTO "favorites" ("user_id", "province_id")
       VALUES ($1, $2)
       ON CONFLICT ("user_id", "province_id") DO UPDATE SET "user_id" = EXCLUDED."user_id"
       RETURNING "created_at"`,
      [userId, province.id],
    );
    const [row] = rows;
    if (row === undefined) {
      // Cannot happen for an `INSERT … ON CONFLICT DO UPDATE` (unlike the plain-INSERT
      // `AuthRateLimitService` case this mirrors, there is no DO-NOTHING branch here that could
      // legitimately return zero rows) — kept as a fail-closed guard against
      // `noUncheckedIndexedAccess`, not a reachable runtime path.
      throw new Error('favorites: province upsert returned no row');
    }
    return toDto(FavoriteTargetType.Province, province.plateCode, null, row.created_at);
  }

  /**
   * `DELETE .../provinces/{plateCode}` — unconditionally idempotent (plan §5.6): 0 rows deleted
   * and 1 row deleted are both success, and a well-formed but unknown `plateCode` is ALSO a no-op
   * rather than a 404 — the caller never needs to distinguish "never favorited" from "unknown
   * province" from "just removed". Every delete filters by `userId` — never `WHERE province_id =
   * ?` alone — so this can never remove another user's row (the cross-user-isolation invariant,
   * sharpened for the delete surface per plan §10).
   */
  async removeProvince(userId: string, plateCode: string): Promise<void> {
    const province = await this.provinces.findOne({ where: { plateCode } });
    if (province === null) return;
    await this.favorites.delete({ userId, provinceId: province.id });
  }

  /**
   * `PUT .../countries/{isoCode}` — idempotent add. Resolves `isoCode` to the real row BEFORE any
   * write touches `favorites` (404 if unknown), then a SINGLE atomic `INSERT … ON CONFLICT
   * (user_id, country_id) DO UPDATE … RETURNING` (plan §5.3, race fix `SFH144-I1`/round 2).
   *
   * This used to be `DO NOTHING` followed by a separate re-read (`findOneOrFail`) to fetch the
   * row for the echoed `FavoriteDto`, on the reasoning that `DO NOTHING` returns no row on
   * conflict. That reasoning was correct but incomplete: the window between the INSERT committing
   * and the follow-up SELECT running was NOT safe here the way it is in
   * `VideoProgressService.upsert` (which this was copied from) — `video_progress` has no
   * `@Delete()` route, so no concurrent request can ever remove the row in that window, while
   * `removeCountry` below is exactly such a route for the exact same `(user_id, country_id)` pair.
   * A concurrent add + remove could land the DELETE inside that window, so the re-read found no
   * row and threw an uncaught `EntityNotFoundError` — surfacing as a bogus 500 on a request that
   * had, in fact, already been satisfied.
   *
   * `DO UPDATE SET "user_id" = EXCLUDED."user_id"` is a no-op write on conflict (every column that
   * matters — `created_at` — is left untouched, so a repeat add still echoes the ORIGINAL creation
   * timestamp) whose only purpose is making `RETURNING` fire on both branches: the statement now
   * always inserts-or-updates and returns exactly one row in one round trip, so there is no window
   * left for a concurrent `DELETE` on the same pair to land in between two separate statements —
   * this is the same atomic upsert-and-return idiom `AuthRateLimitService.consume` already uses
   * (`auth-rate-limit.service.ts`), not a new pattern.
   */
  async addCountry(userId: string, isoCode: string): Promise<FavoriteDto> {
    const country = await this.countries.findOne({ where: { isoCode } });
    if (country === null) throw new NotFoundException(FAVORITES_ERROR_KEYS.countryNotFound);

    const rows = await this.dataSource.query<{ created_at: Date }[]>(
      `INSERT INTO "favorites" ("user_id", "country_id")
       VALUES ($1, $2)
       ON CONFLICT ("user_id", "country_id") DO UPDATE SET "user_id" = EXCLUDED."user_id"
       RETURNING "created_at"`,
      [userId, country.id],
    );
    const [row] = rows;
    if (row === undefined) {
      // Cannot happen for an `INSERT … ON CONFLICT DO UPDATE` (unlike the plain-INSERT
      // `AuthRateLimitService` case this mirrors, there is no DO-NOTHING branch here that could
      // legitimately return zero rows) — kept as a fail-closed guard against
      // `noUncheckedIndexedAccess`, not a reachable runtime path.
      throw new Error('favorites: country upsert returned no row');
    }
    return toDto(FavoriteTargetType.Country, null, country.isoCode, row.created_at);
  }

  /** `DELETE .../countries/{isoCode}` — unconditionally idempotent, mirroring {@link removeProvince}. */
  async removeCountry(userId: string, isoCode: string): Promise<void> {
    const country = await this.countries.findOne({ where: { isoCode } });
    if (country === null) return;
    await this.favorites.delete({ userId, countryId: country.id });
  }
}

function toDto(
  type: FavoriteTargetType,
  plateCode: string | null,
  isoCode: string | null,
  createdAt: Date,
): FavoriteDto {
  return { type, plateCode, isoCode, createdAt: createdAt.toISOString() };
}
