import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * One row per user-declared favorite: exactly ONE province OR ONE country, never neither and
 * never both (UYELIK-07, `UYELIK-07-plan.md` §5.2).
 *
 * ## One table with an exclusive-arc CHECK, not two per-type tables
 * `CHK_favorites_exactly_one_target` (below) is what makes `province_id`/`country_id` real,
 * independently-enforced FK columns rather than a polymorphic `(type, id)` pair — the roadmap's
 * own "tam bir hedef constraint'li kayıt" language read as a design requirement, not just a
 * warning against a type-string+id bookmark. A two-table split was rejected because the roadmap's
 * acceptance criterion is a single current-user LIST, and two tables would need a UNION (or two
 * round-trips merged in the service) for a listing with no offsetting benefit — both "entity
 * types" here are two, fixed, and share every column.
 *
 * ## The FKs are deliberately ASYMMETRIC, and the asymmetry is not the video_progress one
 * `user_id` is `ON DELETE CASCADE` — a favorite has no meaning without its user, and an account
 * deletion is the data owner's own act (same reasoning as `sessions.user_id` /
 * `video_progress.user_id`). `province_id`/`country_id` are `ON DELETE RESTRICT`, chosen
 * DEFENSIVELY rather than in response to a live command: unlike `video_progress.book_video_id`,
 * no operator-triggered delete path exists for either `provinces` or `countries` in this repo
 * today (`seedGeography`/`seedWorld` are strictly insert-or-update, no `--allow-removals`). The
 * choice is made anyway because a favorite row is user-produced and derivable from nothing —
 * exactly the class of data `users.district_id` and `video_progress.book_video_id` already
 * protect with RESTRICT — so that if any future operator-facing removal path is ever added for a
 * province or a country, it fails loudly on a referenced row rather than silently erasing a
 * stated user preference with no signal.
 *
 * ## Uniqueness — two plain two-column unique constraints, no partial index needed
 * Postgres treats NULL as distinct from NULL in a plain unique constraint, so
 * `UQ_favorites_user_province` only ever fires between two rows that BOTH carry a real, matching
 * `province_id` (every country-favorite row has `province_id = NULL` and is invisible to this
 * constraint entirely) — and symmetrically for `UQ_favorites_user_country`. Each constraint
 * doubles as the `INSERT … ON CONFLICT` target for its own add path (`FavoritesService`) and as
 * the access-path index for `WHERE user_id = ?` (both lead with `user_id`), mirroring
 * `video_progress`'s own "the unique constraint IS the access-path index" reasoning — no third,
 * standalone `IDX_favorites_user_id` is added.
 *
 * ## No `updated_at`
 * Unlike `video_progress` (whose row is genuinely mutated in place), a favorite row is a pure
 * existence fact: created once, deleted once, never updated. Carrying an `updated_at` that would
 * never legitimately change after creation is dead weight, not a defensive convention worth
 * copying uncritically.
 *
 * ## No `slug_tr` / `slug_en`
 * This table is never public (protected, per-user, no page) — outside the domain of
 * `ENGINEERING.md` §5's slug rule entirely, the same reasoning `VideoProgress`'s own docblock
 * states.
 */
@Entity('favorites')
@Unique('UQ_favorites_user_province', ['userId', 'provinceId'])
@Unique('UQ_favorites_user_country', ['userId', 'countryId'])
@Check(
  'CHK_favorites_exactly_one_target',
  `("province_id" IS NOT NULL AND "country_id" IS NULL) OR ("province_id" IS NULL AND "country_id" IS NOT NULL)`,
)
export class Favorite {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_favorites' })
  id!: string;

  /** Owning user. `ON DELETE CASCADE`: a favorite has no meaning without its user. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /**
   * `provinces.id` — the entity's INTERNAL uuid, never the public `plateCode`. `null` iff this row
   * favorites a country. `ON DELETE RESTRICT`: see the entity docblock's FK section.
   */
  @Column({ name: 'province_id', type: 'uuid', nullable: true })
  provinceId!: string | null;

  /**
   * `countries.id` — the entity's INTERNAL uuid, never the public `isoCode`. `null` iff this row
   * favorites a province. `ON DELETE RESTRICT`: see the entity docblock's FK section.
   */
  @Column({ name: 'country_id', type: 'uuid', nullable: true })
  countryId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
