import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates `districts` — the ilçe reference list behind the registration form's "İlçe" select
 * (üyelik plan §3, PR-1; migration M1 of that plan's §9 table).
 *
 * Hand-authored raw SQL and hand-reviewed, like every sibling migration (playbook §5). It is
 * SCHEMA ONLY: every row is written by `pnpm db:seed:reference`, never by a migration, and no
 * backfill is needed because the table starts empty.
 *
 * ## Ordering is a hard dependency, not a preference
 * The foreign key targets `provinces (id)`, so this migration MUST stay ordered after
 * `InitProvince1783382400000` in `data-source-options.ts` — the same constraint
 * `InitEarthquakeEvents` carries. The plan's §9 records the other half: `users.district_id` will
 * point here, which is why PR-1 lands before the auth core rather than beside it.
 *
 * ## What is deliberately NOT here
 * - **No `slug_tr` / `slug_en`.** `DEC 2026-08-20i` md.2 rules there is no ilçe page, no ilçe route
 *   and nothing that resolves an ilçe slug. Playbook §5 states the exception as a class — a public
 *   entity without its own page — and this table joins `earthquake_events`, `book_videos` and
 *   `book_video_questions` in it. If the ruling is reopened, the columns and their migration land
 *   in the PR that reopens it.
 * - **No population, area, coordinate or elevation.** 973 rows × one researched fact each is a
 *   research programme, and the consumer is a select box (playbook §12: YAGNI is the default).
 * - **No `district_count` backfill onto `provinces`.** That column already exists, is already
 *   published (`province-detail.dto.ts`, `province-map-summary.dto.ts`) and is already correct: it
 *   sums to 973 and agrees with the committed artefact in 81 of 81 provinces (measured; the
 *   comparison was proved able to see a difference by removing one district from a copy, which
 *   turned 0 mismatches into 1). The seed CHECKS against it rather than rewriting it, so the two
 *   numbers the site publishes cannot drift apart silently.
 *
 * ## Constraints, and both sides of each
 * - **`UQ_districts_province_name_tr`** — two ilçe of the same il never share a name (0 duplicates
 *   in the committed artefact; the counter is not vacuous, since 25 names DO repeat across
 *   different provinces and `Merkez` occurs 51 times). It is also the table's ONLY index: a unique
 *   constraint IS a unique B-tree on exactly those columns in that order, and the single query path
 *   (`WHERE province_id = $1`) reads it as a prefix, so a separate `INDEX (province_id)` would be a
 *   second physical index paying for an access path this one already serves. The
 *   `UQ_book_videos_book_deneme` precedent, applied.
 * - **`FK_districts_province` is `ON DELETE CASCADE`** — an ilçe has no meaning without its il. The
 *   81 province rows are a fixed set, so this should never fire; CASCADE is the honest semantic
 *   rather than an expected path.
 * - **`CHK_districts_name_tr` (`~ '^\S(.*\S)?$'`)** rejects the empty string and any name with
 *   leading or trailing whitespace. That is not hypothetical: the reference product this platform
 *   is measured against ships ` Finike` with a leading space, and a padded name renders padded,
 *   sorts wrongly and compares unequal to the same name typed normally.
 *   **What it deliberately ADMITS**, stated so the next reader can tell "allowed on purpose" from
 *   "not considered": interior runs of whitespace, an interior newline (`.` matches one in a
 *   Postgres ARE, and `$` still anchors at end-of-string), any Unicode letter, digits, punctuation,
 *   and an ALL-CAPS name. The last one matters most and is the reason this constraint stops where
 *   it does — `BOĞAZİÇİ` and an `i` carrying an invisible U+0307 are defects of the SOURCE
 *   TRANSFORMATION (`DEC 2026-08-20p` md.5, the ruling that extends `DEC 2026-08-20m` md.6 to
 *   these 973 names and binds the STORED value; a locale-blind lowercase converter produces U+0307
 *   in 308 of them, measured), and a transformation is judged in the load phase, where the
 *   error message can name the source file and the offending row. They are refused in
 *   `src/database/seeds/district.artifact.ts`. A CHECK constraint that half-guarded them would
 *   invite the belief that the column guarantees a writing form it does not.
 *
 * `down()` drops the table, which takes its index and constraints with it. Every row's CONTENT is
 * reproducible from the committed artefact by re-running the seed (plan §9, M1) — but the
 * IDENTIFIERS are not: `id` defaults to `gen_random_uuid()`, so a down/up/re-seed cycle mints 973
 * new uuids. That is harmless today, because nothing references this table and the api never
 * publishes a district id it did not just read. It stops being harmless the moment the plan's PR-3
 * adds `users.district_id`, and the same property already governs a RENAME (a removal plus an
 * insert — see `seed-reference.ts`), so the PR that adds that column owns both cases.
 */
export class InitDistricts1787302800000 implements MigrationInterface {
  name = 'InitDistricts1787302800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "districts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "province_id" uuid NOT NULL,
        "name_tr" character varying(100) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_districts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_districts_province_name_tr" UNIQUE ("province_id", "name_tr"),
        CONSTRAINT "FK_districts_province"
          FOREIGN KEY ("province_id") REFERENCES "provinces" ("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_districts_name_tr" CHECK ("name_tr" ~ '^\\S(.*\\S)?$')
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "districts"`);
  }
}
