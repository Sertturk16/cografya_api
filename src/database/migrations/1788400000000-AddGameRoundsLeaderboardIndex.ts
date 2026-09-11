import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One new index for the per-game leaderboard read (P1 PR-C plan §5.3): `GET
 * /api/game-rounds/leaderboard` filters `game_rounds` by `mode`, picks one best row per
 * `user_id` (`DISTINCT ON`) and orders the result by `score DESC` within that —
 * `("mode", "user_id", "score" DESC)` is exactly that access path.
 *
 * **Distinct from the deferred index `GameRound`'s own entity docblock already names.** That
 * docblock defers a DIFFERENT index, `(user_id, created_at)`, to support `listMine`'s own
 * `ORDER BY created_at DESC` — this migration does not add that one and does not close that
 * deferral; it is a second, independent access path for a query this table did not serve before
 * (the leaderboard's `mode`-first ranking), not the trigger for the history-read index.
 *
 * Stated honestly, not measured: with 5 live rows in this table today this index is
 * unmeasurable — it is added because `game_rounds` is this repo's only genuinely unbounded
 * per-user table (a row is created per played round, with no corpus ceiling) and the
 * leaderboard is a new, repeated read path over it, not because a slow query was observed.
 *
 * `down()` only drops the index — non-destructive in either direction, no row is ever touched.
 */
export class AddGameRoundsLeaderboardIndex1788400000000 implements MigrationInterface {
  name = 'AddGameRoundsLeaderboardIndex1788400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "IDX_game_rounds_leaderboard"
        ON "game_rounds" ("mode", "user_id", "score" DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_game_rounds_leaderboard"`);
  }
}
