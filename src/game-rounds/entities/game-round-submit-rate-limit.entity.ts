import { Check, Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * The per-user, per-hour submission counter behind `POST /api/game-rounds`'s rate-limit guard
 * (UYELIK-09 fix-round-2, see the migration's own docblock for the full design and why this is a
 * new table rather than a reuse of `AuthRateLimit`).
 *
 * The MIGRATION is the schema truth (`1788003600000-InitGameRoundSubmitRateLimits.ts`); these
 * decorators are declared so the access path reads beside the columns, matching
 * `AuthRateLimit`'s own precedent — nothing here injects `Repository<GameRoundSubmitRateLimit>`,
 * `GameRoundSubmitRateLimitService` reads/writes it with `DataSource.query` directly, exactly as
 * `AuthRateLimitService` does for its own table.
 */
@Entity('game_round_submit_rate_limits')
@Unique('UQ_game_round_submit_rate_limits_user_window', ['userId', 'windowStart'])
@Check('CHK_game_round_submit_rate_limits_count', `"attempt_count" >= 0`)
export class GameRoundSubmitRateLimit {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_game_round_submit_rate_limits' })
  id!: string;

  /** Owning user. `ON DELETE CASCADE`: a rate-limit counter has no meaning without its user. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** `floor(now / windowMs) * windowMs`, in UTC — the fixed window's start instant. */
  @Column({ name: 'window_start', type: 'timestamptz' })
  windowStart!: Date;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount!: number;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}
