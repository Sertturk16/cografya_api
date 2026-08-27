import { Check, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * One row per submitted game round result (UYELIK-09, `UYELIK-09-plan.md` §5.2).
 *
 * ## No relation to `Province`/`Country`/`BookVideo` at all
 * Unlike `Favorite`/`VideoProgress`, this module resolves no external business key before
 * writing: `mode` and `clientRoundId` are pure opaque values the client supplies and the API
 * never resolves against another table (plan §5.1). There is therefore only one FK here.
 *
 * ## `user_id` is `ON DELETE CASCADE`
 * Identical reasoning to every other user-owned table in this repo (`sessions`,
 * `video_progress`, `favorites`): a round-history row has no meaning without its user, and
 * account deletion is the data owner's own act.
 *
 * ## Uniqueness — one two-column constraint, doubling as the `ON CONFLICT` target and the
 * access-path index
 * `UQ_game_rounds_user_client_round (user_id, client_round_id)` leads with `user_id`, so it
 * already serves `WHERE user_id = ?` (the history read's own filter) — no separate
 * `IDX_game_rounds_user_id` (plan §5.2). A second index on `(user_id, created_at)` to support the
 * history read's `ORDER BY created_at DESC` is a deliberate, explicitly-deferred YAGNI call — see
 * the migration's own docblock for the concrete follow-up trigger.
 *
 * ## `mode` is a plain `varchar`, not a Postgres native enum
 * The client's own `GameModeId` set is expected to grow (world/continent modes are a named,
 * future addition in `cografya_web/lib/game/config.ts`), and the API never branches on this
 * value — it is stored and echoed back unchanged, exactly like `client_round_id` itself. A
 * Postgres enum would couple this repo's release cadence to the web repo's game-mode roadmap for
 * a value with no server-side behaviour keyed on it (plan §5.2).
 *
 * ## No `updated_at`
 * A submitted round is never mutated after creation — there is no PUT/PATCH/DELETE route in this
 * package's scope at all (plan §5.1/§5.3), an even cleaner case than favorites' own "pure
 * existence fact" reasoning, since here there is not even a remove/toggle operation.
 *
 * ## No `slug_tr` / `slug_en`
 * This table is never public (protected, per-user, no page) — outside the domain of
 * `ENGINEERING.md` §5's slug rule entirely, the same reasoning `Favorite`/`VideoProgress` already
 * state.
 */
@Entity('game_rounds')
@Unique('UQ_game_rounds_user_client_round', ['userId', 'clientRoundId'])
@Check('CHK_game_rounds_score', '"score" >= 0 AND "score" <= 100')
@Check(
  'CHK_game_rounds_counts',
  '"found" >= 0 AND "first_try" >= 0 AND "total" >= 0 AND "pool_total" >= 0 AND "total_wrongs" >= 0',
)
@Check(
  'CHK_game_rounds_completion_time',
  '"completion_time_seconds" IS NULL OR "completion_time_seconds" >= 0',
)
export class GameRound {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_game_rounds' })
  id!: string;

  /** Owning user. `ON DELETE CASCADE`: a round-history row has no meaning without its user. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /**
   * Opaque, client-generated per-round id (plan §5.5) — the idempotency key together with
   * `userId`. The API never generates or resolves this value; it is whatever the caller sent.
   */
  @Column({ name: 'client_round_id', type: 'varchar', length: 128 })
  clientRoundId!: string;

  /**
   * Opaque game-mode tag (e.g. `"regions"`, `"provinces"`) — see the entity docblock's own
   * "plain varchar, not a native enum" section. Never validated against a closed set here.
   */
  @Column({ name: 'mode', type: 'varchar', length: 40 })
  mode!: string;

  @Column({ name: 'score', type: 'integer' })
  score!: number;

  @Column({ name: 'found', type: 'integer' })
  found!: number;

  @Column({ name: 'first_try', type: 'integer' })
  firstTry!: number;

  @Column({ name: 'total', type: 'integer' })
  total!: number;

  @Column({ name: 'pool_total', type: 'integer' })
  poolTotal!: number;

  @Column({ name: 'total_wrongs', type: 'integer' })
  totalWrongs!: number;

  @Column({ name: 'ended_early', type: 'boolean', default: false })
  endedEarly!: boolean;

  /**
   * Optional/nullable (plan §5.5/§15): the client engine today produces no elapsed-time value at
   * all (`cografya_web/lib/game/round.ts`'s own no-clock ruling, `DEC 2026-07-30m/30n`). Accepted
   * if a future client ever sends it; blocks nothing on its absence.
   */
  @Column({ name: 'completion_time_seconds', type: 'integer', nullable: true })
  completionTimeSeconds!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
