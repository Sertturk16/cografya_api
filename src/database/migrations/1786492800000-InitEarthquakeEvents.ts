import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `earthquake_events` — the store behind the `/deprem` hub and the province sections
 * (SPEC §5.1, PR E1).
 *
 * Hand-authored raw SQL and hand-reviewed, like every sibling migration (playbook §5). It is
 * SCHEMA ONLY: every row is written by the E2 ingest at runtime, never by a migration, and no
 * backfill is needed because the table starts empty.
 *
 * ## Column choices that differ from SPEC §5.1, and why (all Atlas-ruled at the E1 plan gate)
 * - `depth_km numeric(7,3)`, not `(6,3)`. The SPEC's own CHECK admits 1000 while `(6,3)` tops
 *   out at 999.999 — the column could not hold the ceiling its own constraint allows, and
 *   Postgres would raise a numeric overflow before the CHECK was ever consulted.
 * - `latitude`/`longitude numeric(9,6)`, not `(9,5)`. Matches `provinces` and `marine_points`;
 *   the measured feed carries five decimals, so the sixth is headroom rather than a change.
 * - `magnitude numeric(4,2)`, not `(3,1)`. All 630 measured events carried one decimal
 *   (range 0.6–4.5), so this is cheap insurance, not a fix for an observed defect: under
 *   `(3,1)` a two-decimal value would be rounded, and E2's fidelity rule compares round-tripped
 *   values at tolerance 0, so the row would be refused rather than mis-stored.
 * - `binding_plate_code varchar(2)`, not `char(2)`. `provinces.plate_code` is `varchar(2)`;
 *   `bpchar` blank-pads and would put the foreign key across two different types.
 * - `provider_province` / `provider_district` are NULLABLE. 630/630 measured rows carried both,
 *   but that is one week of observation rather than a provider contract, and a NOT NULL would
 *   let a provider change stop an entire ingest tour. Neither is ever published alone.
 * - `place_name_tr` / `provider_location_raw` are named after the fields they feed
 *   (`placeNameTr`, `providerLocationRaw`) rather than the SPEC's `place_label_tr` /
 *   `provider_location`: a column whose name differs from its published field is this repo's
 *   known drift class.
 *
 * ## What is deliberately NOT here
 * - **No `slug_tr` / `slug_en`.** Playbook §5 requires them on public entities because the web
 *   repo routes on them; `DEC 2026-08-12k` D-E rules there is no per-event page, so there is no
 *   route and a slug would resolve nothing. Recorded as an exception in playbook §5.
 * - **No `neighborhood`, no `rms`.** The first is a location precision the page has no use for;
 *   the second is a solution-quality metric that reads as an accuracy claim (SPEC §6.2).
 * - **No future-tense column of any kind** — no prediction, probability, risk score, expected
 *   time or alert level. That is a ruling (DEC 2026-07-30k, `QUESTIONS.md` D-6), not a
 *   preference, and the absence is structural: publishing one would require changing this file.
 *
 * ## Constraints and indexes
 * - `UNIQUE (provider, provider_event_id)` is the upsert conflict target. `provider` is in the
 *   key so a future second source cannot collide with an AFAD event id.
 * - The FK on `binding_plate_code` is `ON DELETE SET NULL`. The 81 province rows are a fixed
 *   set, so it should never fire; if it did, the row would keep a `binding_kind` asserting a
 *   binding whose plate code is gone. Accepted and stated. **E2 obligation:** an FK violation on
 *   one row is a `schema_error` for THAT ROW and the tour continues — a structural guarantee
 *   that can halt a fail-soft loop trades one failure mode for a worse one.
 * - `IDX_earthquake_events_scope_time` carries `provider_event_id DESC` as a third key because
 *   SPEC §13 item 13 requires a deterministic secondary sort; without it, offset pagination can
 *   show the same row on two pages and the index leaves the tie-break to a sort node.
 * - The province index is partial on `in_scope`: an out-of-scope row is served on no path.
 *
 * `down()` drops the table, which takes its indexes and constraints with it.
 */
export class InitEarthquakeEvents1786492800000 implements MigrationInterface {
  name = 'InitEarthquakeEvents1786492800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "earthquake_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "provider" character varying(16) NOT NULL,
        "provider_event_id" character varying(32) NOT NULL,
        "occurred_at_utc" timestamptz NOT NULL,
        "latitude" numeric(9,6) NOT NULL,
        "longitude" numeric(9,6) NOT NULL,
        "depth_km" numeric(7,3) NOT NULL,
        "magnitude" numeric(4,2) NOT NULL,
        "magnitude_type" character varying(8) NOT NULL,
        "magnitude_type_raw" character varying(16) NOT NULL,
        "provider_country" character varying(64),
        "provider_province" character varying(64),
        "provider_district" character varying(64),
        "provider_location_raw" character varying(160) NOT NULL,
        "place_name_tr" character varying(160) NOT NULL,
        "binding_kind" character varying(24) NOT NULL,
        "binding_plate_code" character varying(2),
        "binding_distance_km" numeric(6,2),
        "in_scope" boolean NOT NULL,
        "is_revised" boolean NOT NULL DEFAULT false,
        "provider_updated_at_utc" timestamptz,
        "revision_count" integer NOT NULL DEFAULT 0,
        "first_seen_at_utc" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_earthquake_events" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_earthquake_events_provider_event"
          UNIQUE ("provider", "provider_event_id"),
        CONSTRAINT "FK_earthquake_events_binding_province"
          FOREIGN KEY ("binding_plate_code") REFERENCES "provinces" ("plate_code")
          ON DELETE SET NULL,
        CONSTRAINT "CHK_earthquake_events_magnitude"
          CHECK ("magnitude" >= -1 AND "magnitude" <= 10),
        CONSTRAINT "CHK_earthquake_events_latitude"
          CHECK ("latitude" >= -90 AND "latitude" <= 90),
        CONSTRAINT "CHK_earthquake_events_longitude"
          CHECK ("longitude" >= -180 AND "longitude" <= 180),
        CONSTRAINT "CHK_earthquake_events_depth_km"
          CHECK ("depth_km" >= -5 AND "depth_km" <= 1000)
      )
    `);

    // The hub's main path, with the deterministic pagination tie-break in the index.
    await queryRunner.query(`
      CREATE INDEX "IDX_earthquake_events_scope_time"
        ON "earthquake_events" ("in_scope", "occurred_at_utc" DESC, "provider_event_id" DESC)
    `);

    // The province section. Partial: an out-of-scope row is never served.
    await queryRunner.query(`
      CREATE INDEX "IDX_earthquake_events_plate_time"
        ON "earthquake_events" ("binding_plate_code", "occurred_at_utc" DESC)
        WHERE "in_scope"
    `);

    // The magnitude-filtered list. D-C applies the threshold at DISPLAY time, so this is the
    // filter the reader actually moves, not an ingest-time one.
    await queryRunner.query(`
      CREATE INDEX "IDX_earthquake_events_scope_mag_time"
        ON "earthquake_events" ("in_scope", "magnitude", "occurred_at_utc" DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // DROP TABLE also removes its indexes and constraints.
    await queryRunner.query(`DROP TABLE "earthquake_events"`);
  }
}
