import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { UpstreamOutcomeKind } from '../../upstream/upstream.types';
import { EarthquakeIngestJobKind } from '../earthquake.types';

/**
 * One ingest tour and what it did — the air-quality `air_quality_runs` precedent.
 *
 * ## Why this table exists at all
 * It is the only place "the provider went quiet" can be told apart from "the provider went
 * down". The newest event being 88 minutes old (a real reading on 2026-08-11) is either a calm
 * afternoon or an outage, and the single fact that separates them is **when we last made
 * successful contact** — which is not derivable from the events table, because a healthy tour
 * that finds nothing writes no event rows. `dataStatus`, the reader-facing data age and the
 * `no-store` decision on the cold path all read from here (SPEC §5.2).
 *
 * ## Growth, stated rather than discovered
 * At D-G's 300-second cadence this table takes ~288 `recent` rows a day plus a handful of
 * `reconcile` rows — on the order of 107 000 rows a year, against ~33 000 in the events table.
 * A retention policy is INGEST behaviour and therefore E2's (`FU-EQ-RUNS-PRUNE`, Atlas-tracked);
 * what E1 can do about it is the partial index below, which keeps the only hot query — "the
 * last successful tour" — off a growing sequential scan.
 *
 * ## E1 scope
 * Schema only. Nothing writes a row in this PR.
 */
@Entity('earthquake_ingest_runs')
// The one query on the read path: `dataUpdatedAtUtc` is the finish time of the newest SUCCESSFUL
// tour, so the index is partial on exactly that predicate. As with the events table, the
// migration owns the `DESC` ordering the decorator cannot express.
@Index('IDX_earthquake_ingest_runs_ok_finished', ['finishedAtUtc'], {
  where: `"outcome" = 'ok'`,
})
export class EarthquakeIngestRun {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Which cadence — or the hand-run load — wrote this row. See {@link EarthquakeIngestJobKind}. */
  @Column({ name: 'job_kind', type: 'varchar', length: 16 })
  jobKind!: EarthquakeIngestJobKind;

  @Column({ name: 'started_at_utc', type: 'timestamptz' })
  startedAtUtc!: Date;

  /** `null` while the tour is in flight. */
  @Column({ name: 'finished_at_utc', type: 'timestamptz', nullable: true })
  finishedAtUtc!: Date | null;

  /**
   * How the tour ended, in the SHARED upstream vocabulary (`UpstreamOutcomeKind`) rather than a
   * second one invented here. `null` while in flight.
   *
   * The mapping E2 must implement is not the obvious one: AFAD answers a malformed query with
   * **HTTP 500 while the body says `status: 400`** (measured, SPEC §3.6). A client that reads
   * only the transport code files its own bad query as `transient`, backs off, and retries it
   * forever. The body has to be read too (SPEC §8.2).
   */
  @Column({ name: 'outcome', type: 'varchar', length: 24, nullable: true })
  outcome!: UpstreamOutcomeKind | null;

  /**
   * The window this tour ASKED FOR — always an explicit `start`/`end` pair.
   *
   * Recorded because the provider applies `limit` BEFORE `orderby` (measured: `limit=3` with
   * `orderby=timedesc` returned the three OLDEST events of the window, SPEC §3.4). So ingest can
   * never ask for "the last N"; it narrows by window and sends `limit` only as an overflow
   * alarm. Storing the window is what makes a gap in coverage auditable afterwards.
   */
  @Column({ name: 'window_start_utc', type: 'timestamptz' })
  windowStartUtc!: Date;

  @Column({ name: 'window_end_utc', type: 'timestamptz' })
  windowEndUtc!: Date;

  /** Rows the provider returned for the window. */
  @Column({ name: 'fetched_count', type: 'integer', default: 0 })
  fetchedCount!: number;

  @Column({ name: 'inserted_count', type: 'integer', default: 0 })
  insertedCount!: number;

  /** Upserts that actually changed a value — the same count that moves `revision_count`. */
  @Column({ name: 'updated_count', type: 'integer', default: 0 })
  updatedCount!: number;

  @Column({ name: 'skipped_out_of_scope_count', type: 'integer', default: 0 })
  skippedOutOfScopeCount!: number;

  /**
   * Why the tour failed, redacted and shortened BEFORE it is written (E2's write path).
   *
   * `text` rather than a capped `varchar` on purpose: a length overflow here would abort the
   * very insert that records the failure, losing the diagnosis along with the tour.
   */
  @Column({ name: 'error_reason', type: 'text', nullable: true })
  errorReason!: string | null;
}
