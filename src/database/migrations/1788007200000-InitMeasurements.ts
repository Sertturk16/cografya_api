import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `measurements` — one row per user-saved map measurement (distance / area / coordinate)
 * (UYELIK-11, `UYELIK-11-plan.md` §5.2).
 *
 * Hand-authored raw SQL and hand-reviewed (`ENGINEERING.md` §5), following `InitGameRounds`'s own
 * precedent exactly for the write-up shape.
 *
 * ## Only one FK — `users(id)` — unlike `favorites`
 * `type` and `points` are opaque values the client supplies; the API never resolves either
 * against a second table, so there is no second FK to reason about here (plan §5.1).
 *
 * ## `UQ_measurements_user_client_measurement` is also the access-path index
 * It leads with `user_id`, so it already serves `WHERE user_id = ?` — the list read, the get-one
 * read AND the quota `COUNT` — no separate `IDX_measurements_user_id` is added.
 *
 * ## `CHK_measurements_type` — a deliberate divergence from `game_rounds.mode`
 * `mode` carries no `CHECK` because the server treats it as fully opaque. This module's server
 * genuinely branches on `type` (the shape validator needs to know which minimum point count
 * applies), so it is a closed, server-known three-value set worth a `CHECK`.
 *
 * ## `CHK_measurements_points_array` — a minimal structural guard, not the full shape rule
 * Only asserts "a non-empty JSON array". It deliberately does NOT encode the type-dependent
 * minimum (1 for coordinate, 2 for distance, 3 for area) — that cross-field rule lives in
 * `MeasurementsService` / `validateMeasurementShape`, never as a DB `CHECK` (splitting one
 * product rule across two enforcement mechanisms is how the halves drift).
 *
 * DATA-LOSS WARNING: `down()` drops `measurements` with its constraints. It is safe only on an
 * empty or synthetic database. This migration's `up()` is NOT the table's only writer —
 * `MeasurementsService` writes and deletes rows behind the five `/api/measurements…` routes,
 * shipped in this same PR. Once a real saved measurement exists, reverting permanently deletes
 * user data no source can re-derive; production correction must use a forward migration unless
 * the owner has explicitly approved a verified backup/restore plan and the destructive rollback.
 */
export class InitMeasurements1788007200000 implements MigrationInterface {
  name = 'InitMeasurements1788007200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "measurements" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "client_measurement_id" character varying(128) NOT NULL,
        "type" character varying(10) NOT NULL,
        "points" jsonb NOT NULL,
        "title" character varying(200),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_measurements" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_measurements_user_client_measurement"
          UNIQUE ("user_id", "client_measurement_id"),
        CONSTRAINT "FK_measurements_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_measurements_type" CHECK ("type" IN ('distance', 'area', 'coordinate')),
        CONSTRAINT "CHK_measurements_points_array" CHECK (
          jsonb_typeof("points") = 'array' AND jsonb_array_length("points") >= 1
        )
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "measurements"`);
  }
}
