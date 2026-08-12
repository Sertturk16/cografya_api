import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `earthquake_ingest_runs` — the per-tour ledger behind `dataStatus`, the reader-facing
 * data age and the cold-path `no-store` decision (SPEC §5.2, PR E1).
 *
 * Hand-authored raw SQL and hand-reviewed, like every sibling migration (playbook §5). SCHEMA
 * ONLY; the E2 ingest writes every row. No backfill: the table starts empty and a missing
 * history simply reads as "no successful contact yet", which is the honest cold-start answer.
 *
 * ## Why it is a SEPARATE table from the events
 * It is the only place "the provider went quiet" can be distinguished from "the provider went
 * down". A healthy tour that finds no new earthquakes writes no event rows, so the events table
 * alone cannot date our last successful contact — and an 88-minute-old newest event (a real
 * reading on 2026-08-11) is either a calm afternoon or an outage.
 *
 * ## Nullability
 * `finished_at_utc` and `outcome` are nullable together: a row is written when the tour STARTS,
 * so a crashed process leaves visible evidence rather than no row at all. The four counters
 * default to 0 so a tour that fails before fetching still reads correctly.
 *
 * `error_reason` is `text`, not a capped `varchar`, on purpose: a length overflow would abort
 * the very insert recording the failure and lose the diagnosis with it. E2 redacts and shortens
 * on the write path.
 *
 * ## The one index, and the growth it answers
 * At D-G's 300-second cadence this table takes ~288 `recent` rows a day plus a few `reconcile`
 * rows — on the order of 107 000 a year. The only hot query is "the newest SUCCESSFUL tour",
 * read on every list request, so the index is partial on exactly that predicate and stays small
 * regardless of how many failures accumulate. A retention policy is ingest behaviour and
 * therefore E2's (`FU-EQ-RUNS-PRUNE`, Atlas-tracked) — this migration does not pretend to solve
 * it.
 *
 * `outcome` stores an `UpstreamOutcomeKind` value (`src/upstream/upstream.types.ts`) rather than
 * a vocabulary invented here. It is a plain `varchar` and not a Postgres enum so that adding an
 * upstream outcome kind never needs a migration on this table.
 */
export class InitEarthquakeIngestRuns1786496400000 implements MigrationInterface {
  name = 'InitEarthquakeIngestRuns1786496400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "earthquake_ingest_runs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "job_kind" character varying(16) NOT NULL,
        "started_at_utc" timestamptz NOT NULL,
        "finished_at_utc" timestamptz,
        "outcome" character varying(24),
        "window_start_utc" timestamptz NOT NULL,
        "window_end_utc" timestamptz NOT NULL,
        "fetched_count" integer NOT NULL DEFAULT 0,
        "inserted_count" integer NOT NULL DEFAULT 0,
        "updated_count" integer NOT NULL DEFAULT 0,
        "skipped_out_of_scope_count" integer NOT NULL DEFAULT 0,
        "error_reason" text,
        CONSTRAINT "PK_earthquake_ingest_runs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_earthquake_ingest_runs_ok_finished"
        ON "earthquake_ingest_runs" ("finished_at_utc" DESC)
        WHERE "outcome" = 'ok'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // DROP TABLE also removes its indexes and constraints.
    await queryRunner.query(`DROP TABLE "earthquake_ingest_runs"`);
  }
}
