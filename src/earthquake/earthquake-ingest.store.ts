import type { DataSource } from 'typeorm';
import type { UpstreamOutcomeKind } from '../upstream/upstream.types';
import {
  EARTHQUAKE_PROVIDER_AFAD,
  type EarthquakeBindingKind,
  type EarthquakeIngestJobKind,
  type MagnitudeType,
} from './earthquake.types';
import { normaliseProvinceName } from './scope/earthquake-binding';

/** One row on its way in, already parsed, classified and fidelity-checked. */
export interface EarthquakeEventUpsert {
  readonly providerEventId: string;
  readonly occurredAtUtc: Date;
  readonly latitude: number;
  readonly longitude: number;
  readonly depthKm: number;
  readonly magnitude: number;
  readonly magnitudeType: MagnitudeType;
  readonly magnitudeTypeRaw: string;
  readonly providerCountry: string | null;
  readonly providerProvince: string | null;
  readonly providerDistrict: string | null;
  readonly providerLocationRaw: string;
  readonly placeNameTr: string;
  readonly bindingKind: EarthquakeBindingKind;
  readonly bindingPlateCode: string | null;
  readonly bindingDistanceKm: number | null;
  readonly inScope: boolean;
  readonly isRevised: boolean;
  readonly providerUpdatedAtUtc: Date | null;
}

/**
 * What one upsert did.
 *
 * `unchanged` carries no count on purpose: Postgres wrote no row, so there is nothing to report
 * about it — and inventing a number here (a stale read, a `-1`) is how a counter starts meaning
 * two different things. `revisionCount` is the row's value AFTER the write; the DELTA is not
 * returned because this statement cannot see the pre-update row, and a field that looks like a
 * delta but is not one is worse than its absence.
 */
export type EarthquakeUpsertResult =
  | { readonly kind: 'inserted' | 'updated'; readonly revisionCount: number }
  | { readonly kind: 'unchanged' };

export interface RecordRunInput {
  readonly jobKind: EarthquakeIngestJobKind;
  readonly startedAtUtc: Date;
  readonly finishedAtUtc: Date;
  readonly outcome: UpstreamOutcomeKind;
  readonly windowStartUtc: Date;
  readonly windowEndUtc: Date;
  readonly fetchedCount: number;
  readonly insertedCount: number;
  readonly updatedCount: number;
  readonly skippedOutOfScopeCount: number;
  readonly errorReason: string | null;
}

export interface EarthquakeIngestStorePort {
  loadProvincePlateCodes(): Promise<Map<string, string>>;
  upsertEvent(row: EarthquakeEventUpsert, now: Date): Promise<EarthquakeUpsertResult>;
  recordRun(input: RecordRunInput): Promise<void>;
  pruneRuns(retentionDays: number, now: Date): Promise<number>;
  providerEventIdsInWindow(startUtc: Date, endUtc: Date): Promise<Set<string>>;
}

export const EARTHQUAKE_INGEST_STORE = Symbol('EARTHQUAKE_INGEST_STORE');

/** Longest `error_reason` we keep. A diagnosis, not a transcript. */
const MAX_ERROR_REASON_LENGTH = 500;

/**
 * The six fields whose change means the provider REVISED its solution (SPEC §7.3).
 *
 * Deliberately narrower than "any column moved": a corrected place string is not a revision of the
 * earthquake, and counting it as one would make `revision_count` — which the reader is shown —
 * mean something other than what it says.
 */
const REVISION_FIELDS = [
  'occurred_at_utc',
  'latitude',
  'longitude',
  'depth_km',
  'magnitude',
  'magnitude_type',
] as const;

/** Every provider-derived column. A change in any of them is worth WRITING; only the six above count. */
const COMPARED_FIELDS = [
  ...REVISION_FIELDS,
  'magnitude_type_raw',
  'provider_country',
  'provider_province',
  'provider_district',
  'provider_location_raw',
  'place_name_tr',
  'binding_kind',
  'binding_plate_code',
  'binding_distance_km',
  'in_scope',
  'is_revised',
  'provider_updated_at_utc',
] as const;

/**
 * The earthquake ingest's only door to Postgres.
 *
 * ## Row by row, not in one batch
 * A batch insert is one statement, so one bad row — an FK violation against a province corrected
 * between the read and the write, a length nobody expected — takes the whole batch down with it.
 * E1's FK rider rules the opposite: a row-level violation is THAT ROW's failure and the tour goes
 * on. At the measured volume (~25 rows a `recent` tour, ~630 a `reconcile`) the cost of one
 * statement per row is nothing, and it buys per-row fail-soft that a batch cannot have.
 *
 * ## Nothing is written when nothing changed
 * `ON CONFLICT … DO UPDATE … WHERE <something differs>` makes Postgres skip the update entirely,
 * so `updated_at` does not move. That column is what `dateModified` and sitemap `lastmod` will be
 * built from (`SEO-POLICY.md` §B5 5.9, §B6 6.9) — re-announcing 33 000 unchanged events as
 * modified every five minutes would be a lie told at scale.
 */
export class EarthquakeIngestStore implements EarthquakeIngestStorePort {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * `normalised province name → plate code`, read once per tour.
   *
   * A name we cannot match yields `null` and a warning: an unknown province costs a cross-link,
   * whereas guessing one would put an event on a page it never happened near.
   */
  async loadProvincePlateCodes(): Promise<Map<string, string>> {
    const rows = await this.dataSource.query<{ name_tr: string; plate_code: string }[]>(
      `SELECT "name_tr", "plate_code" FROM "provinces"`,
    );
    const byName = new Map<string, string>();
    for (const row of rows) byName.set(normaliseProvinceName(row.name_tr), row.plate_code);
    return byName;
  }

  async upsertEvent(row: EarthquakeEventUpsert, now: Date): Promise<EarthquakeUpsertResult> {
    const changed = COMPARED_FIELDS.map(
      (field) => `"earthquake_events"."${field}" IS DISTINCT FROM "excluded"."${field}"`,
    ).join(' OR ');
    const revised = REVISION_FIELDS.map(
      (field) => `"earthquake_events"."${field}" IS DISTINCT FROM "excluded"."${field}"`,
    ).join(' OR ');
    const assignments = COMPARED_FIELDS.map((field) => `"${field}" = "excluded"."${field}"`).join(
      ', ',
    );

    const result = await this.dataSource.query<{ inserted: boolean; revision_count: number }[]>(
      `INSERT INTO "earthquake_events" (
         "provider", "provider_event_id", "occurred_at_utc", "latitude", "longitude", "depth_km",
         "magnitude", "magnitude_type", "magnitude_type_raw", "provider_country",
         "provider_province", "provider_district", "provider_location_raw", "place_name_tr",
         "binding_kind", "binding_plate_code", "binding_distance_km", "in_scope", "is_revised",
         "provider_updated_at_utc", "revision_count", "first_seen_at_utc", "created_at", "updated_at"
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
         0, $21, $21, $21
       )
       ON CONFLICT ("provider", "provider_event_id") DO UPDATE SET
         ${assignments},
         "updated_at" = $21,
         "revision_count" = "earthquake_events"."revision_count" + (CASE WHEN ${revised} THEN 1 ELSE 0 END)
       WHERE ${changed}
       RETURNING ("xmax" = 0) AS "inserted", "revision_count"`,
      [
        EARTHQUAKE_PROVIDER_AFAD,
        row.providerEventId,
        row.occurredAtUtc,
        row.latitude,
        row.longitude,
        row.depthKm,
        row.magnitude,
        row.magnitudeType,
        row.magnitudeTypeRaw,
        row.providerCountry,
        row.providerProvince,
        row.providerDistrict,
        row.providerLocationRaw,
        row.placeNameTr,
        row.bindingKind,
        row.bindingPlateCode,
        row.bindingDistanceKm,
        row.inScope,
        row.isRevised,
        row.providerUpdatedAtUtc,
        now,
      ],
    );

    // No row came back at all: the conflict fired and the `WHERE` said nothing differs, so
    // Postgres wrote nothing — including `updated_at`, which is the whole point.
    const written = result[0];
    if (written === undefined) return { kind: 'unchanged' };
    return {
      kind: written.inserted ? 'inserted' : 'updated',
      // `integer` comes back as a JS number from `pg`; `numeric` would not, which is why no
      // numeric column is ever read back through this path.
      revisionCount: Number(written.revision_count),
    };
  }

  async recordRun(input: RecordRunInput): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO "earthquake_ingest_runs" (
         "job_kind", "started_at_utc", "finished_at_utc", "outcome", "window_start_utc",
         "window_end_utc", "fetched_count", "inserted_count", "updated_count",
         "skipped_out_of_scope_count", "error_reason"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        input.jobKind,
        input.startedAtUtc,
        input.finishedAtUtc,
        input.outcome,
        input.windowStartUtc,
        input.windowEndUtc,
        input.fetchedCount,
        input.insertedCount,
        input.updatedCount,
        input.skippedOutOfScopeCount,
        input.errorReason === null ? null : input.errorReason.slice(0, MAX_ERROR_REASON_LENGTH),
      ],
    );
  }

  /**
   * Drop run rows older than the retention window — **never the newest successful one**.
   *
   * Two things are load-bearing here and neither is style:
   *
   * 1. **The newest `ok` run is exempt.** It is the anchor the served freshness is computed from.
   *    Prune it after a long outage and the API stops saying "the data is stale" and starts saying
   *    "there is no data" — a different, and false, statement.
   * 2. **`IS DISTINCT FROM`, not `<>`.** With no successful run yet the subquery is NULL, and
   *    `id <> NULL` is NULL, so a plain `<>` would quietly delete nothing at all, forever, on
   *    exactly the deployment whose table is filling up with failures.
   */
  async pruneRuns(retentionDays: number, now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    // A DELETE does NOT hand back its rows the way every other statement in this file does:
    // TypeORM's postgres runner switches on the command tag and returns `[rows, rowCount]` for
    // DELETE and UPDATE, and the rows alone for everything else
    // (`node_modules/typeorm/driver/postgres/PostgresQueryRunner.js:214-220`). Reading `.length`
    // off the outer array therefore reported **2 for every prune, whatever it deleted** — which
    // the first retention test could not see, because it expected 2. The second one, the case
    // that matters, is what caught it (CI run 1 of PR #118).
    const [deletedRows] = await this.dataSource.query<[{ id: string }[], number]>(
      `DELETE FROM "earthquake_ingest_runs"
        WHERE "started_at_utc" < $1
          AND "id" IS DISTINCT FROM (
            SELECT "id" FROM "earthquake_ingest_runs"
             WHERE "outcome" = 'ok' AND "finished_at_utc" IS NOT NULL
             ORDER BY "finished_at_utc" DESC
             LIMIT 1)
        RETURNING "id"`,
      [cutoff],
    );
    return deletedRows.length;
  }

  /**
   * The provider event ids we already hold for a window.
   *
   * Used by the `reconcile` tour to notice that something we stored has stopped being returned.
   * We never delete such a row (SPEC §7.3) — a silently vanishing archive is unauditable — so this
   * exists to make the disappearance visible in the log instead.
   */
  async providerEventIdsInWindow(startUtc: Date, endUtc: Date): Promise<Set<string>> {
    const rows = await this.dataSource.query<{ provider_event_id: string }[]>(
      `SELECT "provider_event_id" FROM "earthquake_events"
        WHERE "provider" = $1 AND "occurred_at_utc" >= $2 AND "occurred_at_utc" <= $3`,
      [EARTHQUAKE_PROVIDER_AFAD, startUtc, endUtc],
    );
    return new Set(rows.map((row) => row.provider_event_id));
  }
}
