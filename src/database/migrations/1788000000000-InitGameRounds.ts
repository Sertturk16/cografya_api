import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `game_rounds` — one row per submitted game round result (UYELIK-09,
 * `UYELIK-09-plan.md` §5.2).
 *
 * Hand-authored raw SQL and hand-reviewed (`ENGINEERING.md` §5), following `InitFavorites`'s own
 * precedent exactly for the write-up shape.
 *
 * ## Only one FK — `users(id)` — unlike `favorites`
 * `mode` and `client_round_id` are opaque values the client supplies; the API never resolves
 * either against a second table, so there is no second FK to reason about here (plan §5.1).
 *
 * ## `UQ_game_rounds_user_client_round` is also the `ON CONFLICT` target and the access-path index
 * It leads with `user_id`, so it already serves `WHERE user_id = ?` (the history read's own
 * filter) — no separate `IDX_game_rounds_user_id` is added. `GameRoundsService.submit` targets
 * this constraint by name in its atomic `INSERT … ON CONFLICT (…) DO UPDATE … RETURNING`.
 *
 * ## Considered and explicitly deferred: a `(user_id, created_at)` composite index
 * Unlike `favorites` (bounded at <= 280 rows/user), this table's row count is unbounded per user
 * over time (plan §2/§5.2) — a returning player accumulates one row per played round forever.
 * `UQ_game_rounds_user_client_round`'s leading `user_id` column still narrows a given history
 * read to that one user's own rows via an index scan; Postgres then sorts that (today, at most a
 * few thousand rows even for a very active long-time player) per-user result set for the
 * `ORDER BY created_at DESC`. This is a YAGNI call (`ENGINEERING.md` §12), not a permanent
 * position: if a single user's row count ever grows large enough for the sort step to matter, a
 * dedicated `(user_id, created_at)` composite index is a cheap, purely additive follow-up
 * migration — that row-count growth is the concrete trigger for it, named here rather than left
 * as an unstated risk.
 *
 * ## `CHK_game_rounds_score` / `CHK_game_rounds_counts` / `CHK_game_rounds_completion_time` —
 * single-column bounds only
 * Cross-field structural validation (`found <= total`, `firstTry <= found`,
 * `total <= poolTotal`, `!endedEarly ⟹ total === poolTotal`) lives in `GameRoundsService` as a
 * `400`, never as a DB CHECK — splitting one product rule across two enforcement mechanisms is
 * how the halves drift (`AddCountryEntityType1785949200000`'s own stated reasoning, reused here
 * per plan §5.3).
 *
 * DATA-LOSS WARNING: `down()` drops `game_rounds` with its constraints. It is safe only on an
 * empty or synthetic database. This migration's `up()` is NOT the table's only writer —
 * `GameRoundsService` writes rows behind the two `/api/game-rounds` routes, shipped in this same
 * PR. Once a real round-history row exists, reverting permanently deletes user data no source
 * can re-derive; production correction must use a forward migration unless the owner has
 * explicitly approved a verified backup/restore plan and the destructive rollback.
 */
export class InitGameRounds1788000000000 implements MigrationInterface {
  name = 'InitGameRounds1788000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "game_rounds" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "client_round_id" character varying(128) NOT NULL,
        "mode" character varying(40) NOT NULL,
        "score" integer NOT NULL,
        "found" integer NOT NULL,
        "first_try" integer NOT NULL,
        "total" integer NOT NULL,
        "pool_total" integer NOT NULL,
        "total_wrongs" integer NOT NULL,
        "ended_early" boolean NOT NULL DEFAULT false,
        "completion_time_seconds" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_game_rounds" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_game_rounds_user_client_round" UNIQUE ("user_id", "client_round_id"),
        CONSTRAINT "FK_game_rounds_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_game_rounds_score" CHECK ("score" >= 0 AND "score" <= 100),
        CONSTRAINT "CHK_game_rounds_counts" CHECK (
          "found" >= 0 AND "first_try" >= 0 AND "total" >= 0 AND "pool_total" >= 0
          AND "total_wrongs" >= 0
        ),
        CONSTRAINT "CHK_game_rounds_completion_time" CHECK (
          "completion_time_seconds" IS NULL OR "completion_time_seconds" >= 0
        )
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "game_rounds"`);
  }
}
