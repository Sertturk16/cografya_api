import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the air-quality ingest's persistent store (SPEC §9.2 + plan §4): the per-run ledger
 * `air_quality_runs` and the per-(run, province) raw sample rows
 * `air_quality_province_series`.
 *
 * Hand-authored raw SQL and hand-reviewed, like every sibling migration (playbook §5). It is
 * SCHEMA ONLY — every row is written by the scheduled ingest at runtime, never by a migration.
 *
 * ## Why Postgres holds model output at all
 * The marine ECMWF reasoning, with this leg's own numbers: reproducing one run costs ~32 MiB of
 * provider downloads that only exist for ~1.5–2 days, and the Redis retention window is shorter
 * than the provider's daily cadence — so keeping the only copy in an evictable cache would make
 * a `FLUSHALL` a data-loss event. Growth is bounded by construction: 3 runs × 81 provinces ×
 * ~5 KB ≈ 1.2 MB, pruned by the ingest itself.
 *
 * ## Column choices worth defending
 * - `ads_requests jsonb` carries BOTH of the day's jobs, each with its own state, attempt
 *   counter, provider queue stamps and cleanup stamp. There is deliberately no separate
 *   `ads_queue_stamps` column and no run-level `attempts`/`job_cleanup_at`: with two jobs, a
 *   single such column cannot say WHICH job it describes, and a shared attempt counter would
 *   let a failing analysis spend the forecast's retry budget (plan SAPMA 1/5/6).
 * - No `first_step_utc` / `last_step_utc` / `first_step_valid_at` / `analysis_end_utc`: all four
 *   derive from `run_utc ± analysis_hours/forecast_hours`, and a second copy of one fact is this
 *   repo's known drift class (SAPMA 2).
 * - `forecast_hours` and `analysis_hours` are stored PER RUN (SAPMA 3/7) so the
 *   `array length === forecast_hours + 1` invariant stays checkable per row after an env change,
 *   and so "this run has no analysis product" is a machine-readable `0` rather than an inference.
 * - `analysis_concentrations` / `analysis_support` are SEPARATE, NULLABLE columns (SAPMA 8). The
 *   two CAMS products never mix in storage, which makes "a forecast hour published as analysis"
 *   impossible to write as a bug — it would need this migration to be changed.
 * - `last_error_class` separates "fix our decoder" from "record the provider's drift"; flattening
 *   them sends the diagnosis the wrong way (plan §10-D3).
 *
 * ## Constraints and indexes
 * - `air_quality_province_series` PK is `(run_utc, province_id)` — one row per province per run,
 *   written once per product. No surrogate id: the natural key IS the access path.
 * - Both FKs CASCADE. Pruning a run removes its 81 rows atomically; a province dropped from the
 *   seed takes its series along instead of orphaning them.
 * - NO index beyond the PKs, exactly as the marine store: the hot read is "the newest servable
 *   run, then its 81 rows", and the 3-run retention cap keeps the table at ≤ 243 rows, where a
 *   dedicated index is pure write overhead.
 *
 * `down()` drops the series table before the ledger it references — exactly reversible.
 */
export class InitAirQualityStore1785859200000 implements MigrationInterface {
  name = 'InitAirQualityStore1785859200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "air_quality_runs" (
        "run_utc" timestamptz NOT NULL,
        "state" text NOT NULL,
        "forecast_hours" smallint NOT NULL,
        "analysis_hours" smallint NOT NULL DEFAULT 0,
        "ads_requests" jsonb NOT NULL,
        "dataset_id" text NOT NULL,
        "last_error" text,
        "last_error_class" text,
        "bytes_downloaded" bigint,
        "file_format" text,
        "decoder_version" text,
        "started_at" timestamptz NOT NULL,
        "completed_at" timestamptz,
        CONSTRAINT "PK_air_quality_runs" PRIMARY KEY ("run_utc")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "air_quality_province_series" (
        "run_utc" timestamptz NOT NULL,
        "province_id" uuid NOT NULL,
        "grid_latitude" numeric(9,6) NOT NULL,
        "grid_longitude" numeric(9,6) NOT NULL,
        "distance_km" numeric(8,4) NOT NULL,
        "concentrations" jsonb NOT NULL,
        "support" jsonb NOT NULL,
        "analysis_concentrations" jsonb,
        "analysis_support" jsonb,
        "ingested_at" timestamptz NOT NULL,
        CONSTRAINT "PK_air_quality_province_series" PRIMARY KEY ("run_utc", "province_id"),
        CONSTRAINT "FK_air_quality_province_series_run"
          FOREIGN KEY ("run_utc") REFERENCES "air_quality_runs" ("run_utc")
          ON DELETE CASCADE,
        CONSTRAINT "FK_air_quality_province_series_province"
          FOREIGN KEY ("province_id") REFERENCES "provinces" ("id")
          ON DELETE CASCADE
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "air_quality_province_series"`);
    await queryRunner.query(`DROP TABLE "air_quality_runs"`);
  }
}
