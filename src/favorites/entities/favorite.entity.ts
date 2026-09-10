import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { CONTINENT_DB_ENUM, Continent } from '../../common/continent.enum';

/**
 * One row per user-declared favorite: exactly ONE of province, country, region or continent,
 * never neither and never more than one (P1 PR-A plan §5.1, widening UYELIK-07's original
 * province/country-only shape).
 *
 * ## One table with a four-branch exclusive-arc CHECK, not four per-type tables
 * `CHK_favorites_exactly_one_target` (below) is what makes `province_id`/`country_id`/
 * `region_id`/`continent` real, independently-enforced columns rather than a polymorphic
 * `(entity_type, entity_key)` pair — a design that was measured and explicitly rejected (plan
 * §5.1 "Rejected alternative") because it would have dropped all three entity FKs and required a
 * genuine data migration of live rows, for a uniformity gain that is invisible in the published
 * contract (the API surface is byte-identical either way). `num_nonnulls("province_id",
 * "country_id", "region_id", "continent") = 1` replaces what was originally a two-branch boolean
 * XOR — a four-branch hand-written XOR would be eight predicates nobody can read, while this form
 * is one expression that scales to a fifth type by adding one argument.
 *
 * ## `region_id` has a real FK; `continent` deliberately does NOT — and that asymmetry is
 * structural, not an oversight
 * `provinces`, `countries` and `regions` are all real tables with their own uuid PK, so
 * `province_id`/`country_id`/`region_id` all get the same `ON DELETE RESTRICT` FK treatment (see
 * below). `Continent`, by contrast, is a Postgres **enum type** (`"continent"`, shared with
 * `countries.continent`), not a table — there is no `continents` row anywhere in this schema to
 * reference, so no FK is possible for that branch by construction. The `continent` column is
 * typed directly as that enum, which is itself the structural membership check: a label outside
 * the seven live values cannot be written to the column at all, with no application-level
 * validation required to make that guarantee hold at the database layer.
 *
 * ## The FKs that exist are deliberately ASYMMETRIC relative to `user_id`
 * `user_id` is `ON DELETE CASCADE` — a favorite has no meaning without its user, and an account
 * deletion is the data owner's own act (same reasoning as `sessions.user_id` /
 * `video_progress.user_id`). `province_id`/`country_id`/`region_id` are `ON DELETE RESTRICT`,
 * chosen DEFENSIVELY: no operator-triggered delete path exists for `provinces`, `countries` or
 * `regions` in this repo today (every seed is strictly insert-or-update, no `--allow-removals`).
 * The choice is made anyway because a favorite row is user-produced and derivable from nothing —
 * exactly the class of data `users.district_id` and `video_progress.book_video_id` already
 * protect with RESTRICT — so that if any future operator-facing removal path is ever added, it
 * fails loudly on a referenced row rather than silently erasing a stated user preference with no
 * signal.
 *
 * ## Uniqueness — four plain two-column unique constraints, no partial index needed
 * Postgres treats NULL as distinct from NULL in a plain unique constraint, so e.g.
 * `UQ_favorites_user_region` only ever fires between two rows that BOTH carry a real, matching
 * `region_id` (every non-region favorite row has `region_id = NULL` and is invisible to this
 * constraint entirely) — and symmetrically for the other three. Each constraint doubles as the
 * `INSERT … ON CONFLICT` target for its own add path (`FavoritesService`) and as the access-path
 * index for `WHERE user_id = ?` (all four lead with `user_id`), mirroring `video_progress`'s own
 * "the unique constraint IS the access-path index" reasoning — no third, standalone
 * `IDX_favorites_user_id` is added.
 *
 * ## No `updated_at`
 * A favorite row is a pure existence fact: created once, deleted once, never updated. Carrying an
 * `updated_at` that would never legitimately change after creation is dead weight, not a
 * defensive convention worth copying uncritically.
 *
 * ## No `slug_tr` / `slug_en`
 * This table is never public (protected, per-user, no page) — outside the domain of
 * `ENGINEERING.md` §5's slug rule entirely, the same reasoning `VideoProgress`'s own docblock
 * states.
 */
@Entity('favorites')
@Unique('UQ_favorites_user_province', ['userId', 'provinceId'])
@Unique('UQ_favorites_user_country', ['userId', 'countryId'])
@Unique('UQ_favorites_user_region', ['userId', 'regionId'])
@Unique('UQ_favorites_user_continent', ['userId', 'continent'])
@Check(
  'CHK_favorites_exactly_one_target',
  `num_nonnulls("province_id", "country_id", "region_id", "continent") = 1`,
)
export class Favorite {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_favorites' })
  id!: string;

  /** Owning user. `ON DELETE CASCADE`: a favorite has no meaning without its user. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /**
   * `provinces.id` — the entity's INTERNAL uuid, never the public `plateCode`. `null` unless
   * this row favorites a province. `ON DELETE RESTRICT`: see the entity docblock's FK section.
   */
  @Column({ name: 'province_id', type: 'uuid', nullable: true })
  provinceId!: string | null;

  /**
   * `countries.id` — the entity's INTERNAL uuid, never the public `isoCode`. `null` unless this
   * row favorites a country. `ON DELETE RESTRICT`: see the entity docblock's FK section.
   */
  @Column({ name: 'country_id', type: 'uuid', nullable: true })
  countryId!: string | null;

  /**
   * `regions.id` — the entity's INTERNAL uuid, never the public `slug`. `null` unless this row
   * favorites a region. `ON DELETE RESTRICT`: see the entity docblock's FK section.
   */
  @Column({ name: 'region_id', type: 'uuid', nullable: true })
  regionId!: string | null;

  /**
   * A `Continent` enum label directly — there is no internal uuid to hide, because `Continent`
   * is a Postgres enum type, not a table (see the entity docblock). `null` unless this row
   * favorites a continent.
   */
  @Column({
    name: 'continent',
    type: 'enum',
    enum: Continent,
    enumName: CONTINENT_DB_ENUM,
    nullable: true,
  })
  continent!: Continent | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
