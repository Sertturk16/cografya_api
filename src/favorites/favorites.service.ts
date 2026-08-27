import { Injectable, NotFoundException } from '@nestjs/common';
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

    return rows.map((row) =>
      toDto(
        row,
        row.provinceId === null ? null : (plateCodeById.get(row.provinceId) ?? null),
        row.countryId === null ? null : (isoCodeById.get(row.countryId) ?? null),
      ),
    );
  }

  /**
   * `PUT .../provinces/{plateCode}` — idempotent add. Resolves `plateCode` to the real row BEFORE
   * any write touches `favorites` (404 if unknown), then a plain `INSERT … ON CONFLICT (user_id,
   * province_id) DO NOTHING` (plan §5.3): there is nothing to update on conflict — no column
   * changes value on a repeat add — so `DO NOTHING` is the correct, simpler idiom here, not
   * `video_progress`'s `DO UPDATE`. Concurrency-safe for the same reason: `ON CONFLICT` is atomic
   * at the Postgres row-lock level, so two concurrent adds for the same pair serialize inside
   * Postgres and never produce two rows. Because `DO NOTHING` returns no row on a conflict, the
   * row is always re-read by `(userId, provinceId)` afterward to build the echoed `FavoriteDto`
   * (identical pattern to `VideoProgressService.upsert`'s post-write `findOneOrFail`).
   */
  async addProvince(userId: string, plateCode: string): Promise<FavoriteDto> {
    const province = await this.provinces.findOne({ where: { plateCode } });
    if (province === null) throw new NotFoundException(FAVORITES_ERROR_KEYS.provinceNotFound);

    await this.dataSource.query(
      `INSERT INTO "favorites" ("user_id", "province_id")
       VALUES ($1, $2)
       ON CONFLICT ("user_id", "province_id") DO NOTHING`,
      [userId, province.id],
    );
    const row = await this.favorites.findOneOrFail({
      where: { userId, provinceId: province.id },
    });
    return toDto(row, province.plateCode, null);
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

  /** `PUT .../countries/{isoCode}` — idempotent add, mirroring {@link addProvince} exactly. */
  async addCountry(userId: string, isoCode: string): Promise<FavoriteDto> {
    const country = await this.countries.findOne({ where: { isoCode } });
    if (country === null) throw new NotFoundException(FAVORITES_ERROR_KEYS.countryNotFound);

    await this.dataSource.query(
      `INSERT INTO "favorites" ("user_id", "country_id")
       VALUES ($1, $2)
       ON CONFLICT ("user_id", "country_id") DO NOTHING`,
      [userId, country.id],
    );
    const row = await this.favorites.findOneOrFail({ where: { userId, countryId: country.id } });
    return toDto(row, null, country.isoCode);
  }

  /** `DELETE .../countries/{isoCode}` — unconditionally idempotent, mirroring {@link removeProvince}. */
  async removeCountry(userId: string, isoCode: string): Promise<void> {
    const country = await this.countries.findOne({ where: { isoCode } });
    if (country === null) return;
    await this.favorites.delete({ userId, countryId: country.id });
  }
}

function toDto(row: Favorite, plateCode: string | null, isoCode: string | null): FavoriteDto {
  return {
    type: row.provinceId !== null ? FavoriteTargetType.Province : FavoriteTargetType.Country,
    plateCode,
    isoCode,
    createdAt: row.createdAt.toISOString(),
  };
}
