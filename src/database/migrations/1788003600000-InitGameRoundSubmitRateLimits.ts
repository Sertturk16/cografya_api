import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `game_round_submit_rate_limits` — the per-user, per-hour submission counter for
 * `POST /api/game-rounds` (UYELIK-09 fix-round-2, `pr-reviews/145.md` `SEC145-I1`/`VAL145-I1`,
 * owner ledger `UYELIK-09-owner-review-ledger.md` §2.1).
 *
 * ## Why this is a NEW table rather than a reuse of `auth_rate_limits`
 * The round-1 remedy proposal said "reuse the identity-axis limiter idiom"; remedy-validation
 * (`145-remedy-validation-SEC145-I1.json`, `VALR145-I1`) read that literally and found it would
 * mean either widening `CHK_auth_rate_limits_scope` — a CLOSED, DB-enforced enum
 * (`1787565600000-InitAuthSessions.ts`) — for a feature with no auth meaning, or passing a
 * `userId` UUID into `AuthRateLimitService.consume`'s `canonicalEmail` parameter, whose own
 * docblock and `subjectHash` derivation document it as ALWAYS holding an e-posta address. Ruled
 * remedy: reuse only the SQL PATTERN (the atomic `INSERT … ON CONFLICT … RETURNING` fixed-window
 * counter), in a table this module owns outright.
 *
 * ## No `scope` column, no HMAC
 * This table has exactly one axis (`POST /api/game-rounds`, per user) — no second call site will
 * ever share it, unlike `auth_rate_limits`' five-scope closed set, so there is nothing to
 * discriminate on. `subject_hash` (`auth_rate_limits`) exists ONLY because that limiter must also
 * count an unregistered e-posta address (D11, `AuthRateLimitService`'s own docblock) — an
 * existence oracle it must not become. `user_id` here is always a real, authenticated row (the
 * guard runs chained AFTER `AccessTokenGuard`, plan/fix-round §Fix-1), so it is stored PLAIN, the
 * same way `game_rounds.user_id`/`favorites.user_id`/`video_progress.user_id` already do —
 * hashing it would add a dependency on `AuthSecretsProvider` for zero confidentiality gain.
 *
 * ## `UQ_game_round_submit_rate_limits_user_window` is also the `ON CONFLICT` target and the
 * access-path index
 * It leads with `user_id`, so it already serves the per-user `WHERE user_id = ?` the stale-window
 * cleanup delete needs — no separate `IDX_game_round_submit_rate_limits_user_id` is added, the
 * same reasoning `UQ_game_rounds_user_client_round` and `UQ_favorites_user_province` already
 * state for their own tables. `GameRoundSubmitRateLimitService.consume` targets this constraint's
 * COLUMN LIST — `ON CONFLICT ("user_id", "window_start")` — not `ON CONFLICT ON CONSTRAINT
 * "…"`, in its atomic upsert.
 *
 * ## `FK_game_round_submit_rate_limits_user` is `ON DELETE CASCADE`
 * Same reasoning as every other user-owned table in this repo (`sessions`, `video_progress`,
 * `favorites`, `game_rounds`): a rate-limit counter has no meaning without its user.
 *
 * ## `CHK_game_round_submit_rate_limits_count` — single-column bound only
 * Mirrors `CHK_auth_rate_limits_count` exactly: the counter can never go negative. There is no
 * upper-bound CHECK — the 300/hour ceiling is a service-level comparison
 * (`GAME_ROUND_SUBMIT_RATE_LIMIT.limit`), not a schema invariant, so it can change without a
 * migration.
 *
 * DATA-LOSS NOTE (lower stakes than `game_rounds`' own warning): `down()` drops this table. Unlike
 * `game_rounds`, it holds no user-generated content — only ephemeral, self-healing rate-limit
 * counters that the next request after a revert simply starts fresh (stale rows are deleted on
 * their own, per `windowMs`, anyway). Reverting on a live database resets every caller's current-hour
 * counter to zero rather than losing anything a user produced; it is still avoided on a live
 * database as routine practice, but it is not the same class of event as reverting `InitGameRounds`.
 */
export class InitGameRoundSubmitRateLimits1788003600000 implements MigrationInterface {
  name = 'InitGameRoundSubmitRateLimits1788003600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "game_round_submit_rate_limits" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "window_start" timestamptz NOT NULL,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_game_round_submit_rate_limits" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_game_round_submit_rate_limits_user_window"
          UNIQUE ("user_id", "window_start"),
        CONSTRAINT "FK_game_round_submit_rate_limits_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_game_round_submit_rate_limits_count" CHECK ("attempt_count" >= 0)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "game_round_submit_rate_limits"`);
  }
}
