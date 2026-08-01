import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the ECMWF ingest's persistent store (yeni-M3 SPEC §9.1): the cycle-progress ledger
 * `marine_ecmwf_cycles` and the per-(cycle, point) raw sample rows `marine_ecmwf_point_series`.
 *
 * Hand-authored raw SQL and hand-reviewed, like every sibling migration (repo playbook §5).
 *
 * ## Why Postgres holds forecast data at all (the SPEC's own Discuss & Decide)
 * SPEC v1 §5.1's "forecast values are never persisted" was written for point-query providers.
 * ECMWF inverts the economics: this content costs ~130 MB of downloads to reproduce, accumulates
 * over ~4 warmup tours, and the Redis cache's retention (`max(ok TTL, staleMax)`) is SHORTER
 * than the provider's 6-hourly cadence — an eviction would mean a re-download and an empty
 * widget until the next cycle. Bounded by construction: at most 3 cycles are retained (~120 KB),
 * pruned by the ingest itself, so there is no unbounded growth and no fake `lastmod` churn.
 *
 * ## Constraint choices
 * - `marine_ecmwf_point_series` PK is `(cycle_utc, marine_point_id)` — one row per point per
 *   cycle, upserted as steps merge in. No surrogate id: the natural key IS the access path.
 * - Both FKs CASCADE. Pruning a cycle removes its ~30 series rows atomically, and a reference
 *   point retired by the M1 load phase takes its series along instead of orphaning them.
 * - `steps_done smallint[]` (not a child table): it is a progress bitmap read and written as a
 *   whole by ONE writer (the warmup tour under its cross-instance lock), never queried per
 *   element. A join table would add machinery for a query nobody makes.
 * - No index beyond the PKs. The hot read is "newest cycle row for one point", served by the PK
 *   (`marine_point_id` equality + `cycle_utc` ordering needs at most 3 cycles scanned — the
 *   retention cap makes a dedicated index pure overhead on a ≤ ~93-row table).
 *
 * SCHEMA ONLY: rows are written by the scheduled ingest at runtime, never by a migration.
 *
 * `down()` drops the series table before the ledger it references — exactly reversible.
 */
export class InitMarineEcmwfStore1785686400000 implements MigrationInterface {
  name = 'InitMarineEcmwfStore1785686400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "marine_ecmwf_cycles" (
        "cycle_utc" timestamptz NOT NULL,
        "steps_done" smallint[] NOT NULL DEFAULT '{}',
        "step_hours" smallint NOT NULL,
        "forecast_hours" smallint NOT NULL,
        "bytes_downloaded" bigint NOT NULL DEFAULT 0,
        "started_at" timestamptz NOT NULL,
        "completed_at" timestamptz,
        "packing_type" text NOT NULL,
        "decoder_version" text NOT NULL,
        CONSTRAINT "PK_marine_ecmwf_cycles" PRIMARY KEY ("cycle_utc")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "marine_ecmwf_point_series" (
        "cycle_utc" timestamptz NOT NULL,
        "marine_point_id" uuid NOT NULL,
        "grid_latitude" numeric(9,6) NOT NULL,
        "grid_longitude" numeric(9,6) NOT NULL,
        "distance_km" numeric(8,4) NOT NULL,
        "values" jsonb NOT NULL,
        "support" jsonb NOT NULL,
        "ingested_at" timestamptz NOT NULL,
        CONSTRAINT "PK_marine_ecmwf_point_series" PRIMARY KEY ("cycle_utc", "marine_point_id"),
        CONSTRAINT "FK_marine_ecmwf_point_series_cycle"
          FOREIGN KEY ("cycle_utc") REFERENCES "marine_ecmwf_cycles" ("cycle_utc")
          ON DELETE CASCADE,
        CONSTRAINT "FK_marine_ecmwf_point_series_point"
          FOREIGN KEY ("marine_point_id") REFERENCES "marine_points" ("id")
          ON DELETE CASCADE
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "marine_ecmwf_point_series"`);
    await queryRunner.query(`DROP TABLE "marine_ecmwf_cycles"`);
  }
}
