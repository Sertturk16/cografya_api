import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One row per `(user, book_video)` — the caller's last playback position and a user-declared
 * "watched" signal for one video solution (UYELIK-05, `UYELIK-05-plan.md` §5.2).
 *
 * ## Access path is the unique constraint, not a second index
 * `UQ_video_progress_user_book_video` IS the access-path index for both endpoints
 * (`WHERE user_id = ? AND book_video_id = ?`). No standalone `book_video_id` index is added either
 * — the only reader of one would be the referential-integrity check `pnpm db:seed:books
 * --allow-removals` runs on delete, a rare hand-run maintenance command, not a request-path query
 * (full reasoning: the migration's own docblock). It is also what makes the upsert idempotent AND
 * concurrency-safe: `INSERT … ON CONFLICT` is atomic at the Postgres row-lock level, so two
 * concurrent upserts for the same pair serialize inside Postgres rather than racing to create two
 * rows.
 *
 * ## The two FKs are deliberately ASYMMETRIC
 * `user_id` is `ON DELETE CASCADE` (a progress row has no meaning without its user, and an account
 * deletion is the data owner's own act). `book_video_id` is `ON DELETE RESTRICT`, governed by the
 * `users.district_id` precedent rather than `book_video_questions.book_video_id`: progress rows are
 * user-produced and derivable from nothing, so `pnpm db:seed:books --allow-removals` retiring a
 * `book_videos` row must fail loudly and roll back rather than silently cascade away another user's
 * saved position (full reasoning: the migration's own docblock).
 *
 * ## No `slug_tr` / `slug_en`
 * `ENGINEERING.md` §5's slug rule binds PUBLIC entities the web repo routes to; this table is
 * never public (protected, per-user, no page), so it was never a candidate for the rule at all —
 * not a claimed exception, simply outside the rule's domain.
 *
 * ## `watched_at` is "last confirmed instant", not "first ever watched instant"
 * Overwritten on every upsert that carries `watched: true`, and cleared to `null` on one that
 * carries `watched: false` — a flat, uniform overwrite (plan §5.3), not a first-true-wins
 * timestamp. `CHK_video_progress_watched_at` below pins the two columns' relationship, mirroring
 * the `users` entity's own `CHK_users_verification_state` idiom of tying a boolean's state to a
 * nullable timestamp's presence.
 */
@Entity('video_progress')
@Unique('UQ_video_progress_user_book_video', ['userId', 'bookVideoId'])
@Check('CHK_video_progress_position', '"last_position_seconds" >= 0')
@Check(
  'CHK_video_progress_watched_at',
  `("watched" = false AND "watched_at" IS NULL) OR ("watched" = true AND "watched_at" IS NOT NULL)`,
)
export class VideoProgress {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_video_progress' })
  id!: string;

  /** Owning user. `ON DELETE CASCADE`: a progress row has no meaning without its user. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /**
   * Owning video. `ON DELETE RESTRICT`: unlike `user_id`, a progress row must NOT silently
   * disappear when a `book_videos` row is retired by `pnpm db:seed:books --allow-removals` — see
   * the entity's own docblock and the migration's for the full reasoning.
   */
  @Column({ name: 'book_video_id', type: 'uuid' })
  bookVideoId!: string;

  @Column({ name: 'last_position_seconds', type: 'integer' })
  lastPositionSeconds!: number;

  @Column({ name: 'watched', type: 'boolean', default: false })
  watched!: boolean;

  /** When the caller most recently confirmed `watched: true`. `null` whenever `watched` is false. */
  @Column({ name: 'watched_at', type: 'timestamptz', nullable: true })
  watchedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
