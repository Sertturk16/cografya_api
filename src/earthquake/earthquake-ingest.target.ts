import { Logger } from '@nestjs/common';
import { describeErrorWithName } from '../common/describe-error';
import { OperationDeadline } from '../upstream/operation-deadline';
import type { ScheduledWarmupTarget } from '../upstream/scheduled-warmup.service';
import type { UpstreamHttpClient } from '../upstream/upstream-http.client';
import type { UpstreamMetrics } from '../upstream/upstream-metrics';
import type { UpstreamOutcomeKind } from '../upstream/upstream.types';
import { EarthquakeIngestJobKind, type EarthquakeIngestCadence } from './earthquake.types';
import { AFAD_TDVMS_PROVIDER, type EarthquakeUpstreamConfig } from './earthquake-upstream.config';
import { classifyAfadServerErrorBody } from './afad/afad-outcome';
import { parseAfadEventsBody, type AfadParsedPayload } from './afad/afad-event.parse';
import { quoteProviderText } from './afad/afad-log-safe';
import { buildAfadEventFilterUrl, buildAfadWindow, type AfadWindow } from './afad/afad-window';
import type { EarthquakeIngestStorePort } from './earthquake-ingest.store';
import { buildEarthquakeRow } from './earthquake-row';

/**
 * Budget one call is assumed to need before it is started.
 *
 * The measured 7-day fetch took 0.43 s; 5 s of assumed cost stops a tour from opening a request it
 * cannot finish inside its remaining slice, which would spend the provider's capacity and ours for
 * a result nobody can use.
 */
const ESTIMATED_CALL_COST_MS = 5_000;

/** How many vanished ids a single log line names before it starts counting instead. */
const MAX_NAMED_ABSENT_IDS = 20;

export interface EarthquakeIngestTargetDeps {
  readonly client: UpstreamHttpClient;
  readonly store: EarthquakeIngestStorePort;
  readonly config: EarthquakeUpstreamConfig;
  readonly metrics: UpstreamMetrics;
  /** A CADENCE, never the hand-run backfill: this class is the scheduled half of the ingest. */
  readonly jobKind: EarthquakeIngestCadence;
  /** Injected in tests. */
  readonly now?: () => number;
}

/**
 * One AFAD ingest tour — a `ScheduledWarmupTarget` on one of this leg's TWO warmup instances.
 *
 * ## Two cadences, one class
 * `recent` (every 5 minutes, 6-hour window) picks up new events; `reconcile` (every 6 hours,
 * 7-day window) catches LATE revisions. The split is measured, not defensive: Pazarcık M7.7 was
 * revised 8.5 hours after the event and Elbistan M7.6 three days after (SPEC §3.8), so a single
 * short window would systematically miss corrections to the biggest earthquakes — the rows that
 * are read the most and quoted the longest.
 *
 * ## No request path ever reaches AFAD
 * This class is the only thing in the process that talks to the provider, and it runs inside a
 * warmup tour (cross-instance Redis lock included, for free). E3's endpoints will read Postgres
 * and nothing else.
 *
 * ## Fail-soft has two levels, deliberately
 * A broken ENVELOPE (not an array, or a response sitting on the safety limit) fails the whole tour
 * as `schema_error`, because we cannot tell what is missing. A broken ROW fails that row: it is
 * counted, named in the log, and the tour continues. E1's FK rider rules the second explicitly,
 * and the first is what stops us from writing a truncated window as if it were the whole truth.
 */
export class EarthquakeIngestTarget implements ScheduledWarmupTarget {
  readonly label: string;

  private readonly logger: Logger;
  private readonly now: () => number;

  constructor(private readonly deps: EarthquakeIngestTargetDeps) {
    this.label = `afad.events.${deps.jobKind}`;
    this.logger = new Logger(`EarthquakeIngest:${deps.jobKind}`);
    this.now = deps.now ?? Date.now;
  }

  /** Never throws — the warmup contract. */
  async refresh(tourDeadline: OperationDeadline): Promise<void> {
    try {
      await this.runTour(tourDeadline);
    } catch (error: unknown) {
      // Everything expected is handled inside, so reaching here is OUR bug: loud, counted, and
      // never allowed to take down the tour that hosts it.
      this.deps.metrics.increment('eq.ingest_bug', AFAD_TDVMS_PROVIDER);
      this.logger.error(
        `ingest tour aborted by an unexpected error — ${describeErrorWithName(error)}`,
      );
    }
  }

  private async runTour(tourDeadline: OperationDeadline): Promise<void> {
    const { config, jobKind } = this.deps;
    if (!config.ingestEnabled) return;

    const startedAtUtc = new Date(this.now());
    const window = buildAfadWindow(jobKind, this.now(), config);

    const sliceBudgetMs = Math.min(config.tourBudgetMs, tourDeadline.remainingMs());
    if (sliceBudgetMs < ESTIMATED_CALL_COST_MS) {
      // WARN, counted, and named for what it is. This branch writes no run row at all, so a leg
      // whose budget is configured below the assumed call cost goes permanently dark; at `log`
      // level with no counter, its only trace was a line that also claimed to be yielding to a
      // tour that hosts exactly one target (review #118 SFH118-M1).
      this.deps.metrics.increment('eq.slice_skipped', AFAD_TDVMS_PROVIDER);
      this.logger.warn(
        `tour slice of ${String(sliceBudgetMs)} ms is below the ${String(ESTIMATED_CALL_COST_MS)} ms ` +
          'one call is assumed to need — no call made, and no run recorded',
      );
      return;
    }
    const deadline = new OperationDeadline(sliceBudgetMs, this.now);

    const outcome = await this.deps.client.request<AfadParsedPayload>({
      providerId: AFAD_TDVMS_PROVIDER,
      label: this.label,
      url: buildAfadEventFilterUrl(config.baseUrl, window, config.safetyLimit),
      deadline,
      limits: config.budget,
      singleCallTimeoutMs: config.singleCallTimeoutMs,
      maxResponseBytes: config.responseMaxBytes,
      // AFAD answers a malformed query with HTTP 500 while the body says 400 (measured, SPEC
      // §3.6). Without this the client would file OUR bad query as a provider outage and retry it
      // on every tour forever, at WARN, with nothing ever pointing at the query.
      serverErrorBodyClassifier: classifyAfadServerErrorBody,
      parse: (body: string) => ({
        kind: 'ok',
        value: parseAfadEventsBody(body, { safetyLimit: config.safetyLimit }),
      }),
    });

    if (outcome.kind !== 'ok') {
      // Already logged by the shared client with the provider, the label and a redacted reason.
      await this.recordRun(startedAtUtc, window, outcome.kind, {
        fetchedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        skippedOutOfScopeCount: 0,
        errorReason: outcome.reason,
      });
      // Retention runs on the FAILING path too. A leg failing at the 300 s cadence is exactly the
      // deployment whose ledger fills up — and it was the one deployment retention never reached,
      // because `prune` was called only from the success path (review #118 CODE118-M3). Pruning is
      // independent of the tour's outcome and already fail-soft.
      await this.prune(new Date(this.now()));
      return;
    }

    await this.storePayload(startedAtUtc, window, outcome.value);
  }

  private async storePayload(
    startedAtUtc: Date,
    window: AfadWindow,
    payload: AfadParsedPayload,
  ): Promise<void> {
    const { store, config } = this.deps;

    // The province lookup is a store READ the tour cannot proceed without — but an unguarded throw
    // here escaped all the way to `refresh`, where it was filed under `eq.ingest_bug` ("OUR bug")
    // and left NO run row at all, so the ledger could not tell "this tour failed" from "this tour
    // never ran" (review #118 CODE118-M4 / SFH118-I1). A database hiccup is now recorded as the
    // transient failure it is, with a reason saying plainly it was ours to read, not AFAD's.
    let plateCodes: Map<string, string>;
    try {
      plateCodes = await store.loadProvincePlateCodes();
    } catch (error: unknown) {
      this.deps.metrics.increment('eq.store_read_failed', AFAD_TDVMS_PROVIDER);
      this.logger.error(
        `the province lookup failed, so this tour classified nothing — ${describeErrorWithName(error)}`,
      );
      await this.recordRun(startedAtUtc, window, 'transient', {
        fetchedCount: payload.fetchedCount,
        insertedCount: 0,
        updatedCount: 0,
        skippedOutOfScopeCount: 0,
        errorReason: `the provider answered, but OUR province lookup failed — ${describeErrorWithName(error)}`,
      });
      await this.prune(new Date(this.now()));
      return;
    }
    if (plateCodes.size === 0) {
      // The scheduled analogue of the backfill's refusal (`earthquake.cli.ts`): an empty province
      // table means the geography seed has not run, so every row lands with no cross-link and only
      // the last 6 hours / 7 days are ever revisited (review #118 SFH118-M2).
      this.logger.error(
        'the provinces table is empty — every event in this tour will be stored without a ' +
          'province cross-link; run `pnpm db:seed:geography`',
      );
    }
    const writtenAt = new Date(this.now());

    let insertedCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    let skippedOutOfScopeCount = 0;
    let writeFailedCount = 0;
    let plateUnresolvedCount = 0;

    for (const event of payload.accepted) {
      const row = buildEarthquakeRow(event, plateCodes, config.scopeBufferKm);
      if (!row.inScope) skippedOutOfScopeCount += 1;
      if (row.providerProvince !== null && row.bindingPlateCode === null) plateUnresolvedCount += 1;

      try {
        const result = await store.upsertEvent(row, writtenAt);
        if (result.kind === 'inserted') insertedCount += 1;
        else if (result.kind === 'updated') updatedCount += 1;
        else unchangedCount += 1;
      } catch (error: unknown) {
        // One row the database refused — an FK violation against a province that moved under us,
        // a length nobody expected. E1's rider: that is THIS ROW's failure, not the tour's.
        writeFailedCount += 1;
        this.deps.metrics.increment('eq.row_write_failed', AFAD_TDVMS_PROVIDER);
        this.logger.warn(
          `event ${quoteProviderText(row.providerEventId)} was not written — ` +
            describeErrorWithName(error),
        );
      }
    }

    const rejectionReasons = new Set<string>();
    for (const rejection of payload.rejected) {
      rejectionReasons.add(rejection.reason);
      this.deps.metrics.increment('eq.row_rejected', AFAD_TDVMS_PROVIDER);
      const id =
        rejection.providerEventId === null
          ? '(id unreadable)'
          : quoteProviderText(rejection.providerEventId);
      this.logger.warn(`event ${id} rejected — ${rejection.reason}`);
    }

    if (this.deps.jobKind === EarthquakeIngestJobKind.Reconcile) {
      // Wrapped, because this is the ONE store call in this method that is purely diagnostic. An
      // unguarded rejection here unwound past the ledger write, all four counters, the summary and
      // the systemic-write alarm — so a reconcile tour that had already committed ~630 rows left no
      // trace and was filed as OUR bug (review #118 SFH118-I1). A diagnosis may only ever cost the
      // diagnosis.
      try {
        await this.reportDisappearances(window, payload);
      } catch (error: unknown) {
        this.deps.metrics.increment('eq.absent_check_failed', AFAD_TDVMS_PROVIDER);
        this.logger.warn(
          `the disappearance check could not run for this window — ${describeErrorWithName(error)}`,
        );
      }
    }

    const ledgerDiagnosis = this.diagnoseTour(payload, {
      insertedCount,
      updatedCount,
      unchangedCount,
      writeFailedCount,
      rejectionReasons,
    });

    await this.recordRun(startedAtUtc, window, ledgerDiagnosis.outcome, {
      fetchedCount: payload.fetchedCount,
      insertedCount,
      updatedCount,
      skippedOutOfScopeCount,
      errorReason: ledgerDiagnosis.errorReason,
    });

    this.deps.metrics.increment('eq.rows_inserted', AFAD_TDVMS_PROVIDER, insertedCount);
    this.deps.metrics.increment('eq.rows_updated', AFAD_TDVMS_PROVIDER, updatedCount);
    this.deps.metrics.increment(
      'eq.rows_out_of_scope',
      AFAD_TDVMS_PROVIDER,
      skippedOutOfScopeCount,
    );
    this.deps.metrics.increment('eq.plate_unresolved', AFAD_TDVMS_PROVIDER, plateUnresolvedCount);

    const summary =
      `tour done — ${String(payload.fetchedCount)} fetched, ${String(insertedCount)} inserted, ` +
      `${String(updatedCount)} updated, ${String(unchangedCount)} unchanged, ` +
      `${String(skippedOutOfScopeCount)} out of scope, ${String(payload.rejected.length)} rejected, ` +
      `${String(writeFailedCount)} write-failed, ${String(plateUnresolvedCount)} without a plate code`;
    // The summary carries the whole operational signal today (there is no metrics exporter yet),
    // so its LEVEL is the alarm. ERROR whenever the ledger row above is not a clean `ok` — carrying
    // the same diagnosis the ledger stored, so the log and the ledger cannot disagree; WARN also
    // when every row lost its province join, the systemic shape of a missing geography seed
    // (review #118 SFH118-M2).
    if (ledgerDiagnosis.errorReason !== null) {
      this.logger.error(`${summary} — ${ledgerDiagnosis.errorReason}`);
    } else if (payload.rejected.length > 0 || writeFailedCount > 0 || plateUnresolvedCount > 0) {
      this.logger.warn(summary);
    } else this.logger.log(summary);

    await this.prune(writtenAt);
  }

  /**
   * What the ledger row should SAY about a tour that reached the store.
   *
   * The ledger is the freshness anchor — E3 derives `dataStatus` and the published data age from
   * the newest `ok` run — so the two ways a tour can do all its work and store nothing must not
   * both be recorded as a clean success (review #118 CODE118-I2 and SFH118-I2). Neither needs a
   * migration: `error_reason` is nullable `text`, truncated on the write path.
   *
   * - **The write path is broken.** Nothing reached the store at all — not one insert, update or
   *   confirmed-unchanged row — while the database refused at least one. `schema_error` is the
   *   closest word the shared `UpstreamOutcomeKind` vocabulary has. `unchangedCount` is part of the
   *   test on purpose: a reconcile tour that confirmed 629 rows and lost one to an FK violation has
   *   a working write path, and recording THAT as a failed tour would be the same lie in the other
   *   direction.
   * - **The parser accepted nothing.** The provider returned rows and not one survived — a field
   *   renamed upstream, a type changed. The envelope is still a JSON array, so the tour-level
   *   `schema_error` alarm never fires and the events table simply stops growing while the ledger
   *   keeps saying `ok`. The outcome word STAYS `ok` because it describes the CALL, which really
   *   did succeed; what was missing is any durable trace of why nothing landed.
   */
  private diagnoseTour(
    payload: AfadParsedPayload,
    counts: {
      insertedCount: number;
      updatedCount: number;
      unchangedCount: number;
      writeFailedCount: number;
      rejectionReasons: ReadonlySet<string>;
    },
  ): { outcome: UpstreamOutcomeKind; errorReason: string | null } {
    const nothingReachedTheStore =
      counts.insertedCount === 0 && counts.updatedCount === 0 && counts.unchangedCount === 0;

    if (nothingReachedTheStore && counts.writeFailedCount > 0) {
      return {
        outcome: 'schema_error',
        errorReason:
          `the database refused all ${String(counts.writeFailedCount)} row(s) this tour tried to ` +
          'write — this is a systemic write failure, not one bad row',
      };
    }

    if (payload.fetchedCount > 0 && payload.accepted.length === 0) {
      const reasons = [...counts.rejectionReasons].sort();
      return {
        outcome: 'ok',
        errorReason:
          `the provider returned ${String(payload.fetchedCount)} row(s) and the parser accepted ` +
          `none; refusal reasons: ${reasons.join(' | ')}`,
      };
    }

    return { outcome: 'ok', errorReason: null };
  }

  /**
   * Rows we hold for this window that the provider no longer returns.
   *
   * **Nothing is deleted** (SPEC §7.3). An archive that silently drops rows cannot be audited, and
   * a provider hiccup would be indistinguishable from a retraction. So the disappearance is
   * reported and the row stays exactly as it was.
   */
  private async reportDisappearances(
    window: AfadWindow,
    payload: AfadParsedPayload,
  ): Promise<void> {
    const stored = await this.deps.store.providerEventIdsInWindow(window.startUtc, window.endUtc);
    if (stored.size === 0) return;
    const returned = new Set(payload.accepted.map((event) => event.providerEventId));
    for (const rejection of payload.rejected) {
      // A row we REFUSED was still returned by the provider. Counting it as vanished would blame
      // the provider for our own rejection.
      if (rejection.providerEventId !== null) returned.add(rejection.providerEventId);
    }

    const absent = [...stored].filter((id) => !returned.has(id));
    if (absent.length === 0) return;
    this.deps.metrics.increment('eq.rows_absent_upstream', AFAD_TDVMS_PROVIDER, absent.length);
    const named = absent.slice(0, MAX_NAMED_ABSENT_IDS);
    this.logger.warn(
      `${String(absent.length)} stored event(s) in this window were not returned by the provider ` +
        `and were NOT deleted: ${JSON.stringify(named)}` +
        (absent.length > named.length ? ` (+${String(absent.length - named.length)} more)` : ''),
    );
  }

  /**
   * Write the tour's ledger row.
   *
   * ## Exactly ONE row, written when the tour ENDS
   * E1's migration docblock describes `finished_at_utc`/`outcome` as "nullable together: a row is
   * written when the tour STARTS, so a crashed process leaves visible evidence rather than no row
   * at all". E2 deliberately does not do that (plan §6.6): one row, at the end, both columns always
   * populated — so a process killed mid-tour leaves no ledger trace, the accepted cost of not
   * paying two writes per tour. Recorded here because this is where the next reader looks; the
   * migration's own wording is Atlas's to correct (review #118 CODE118-M6).
   */
  private async recordRun(
    startedAtUtc: Date,
    window: AfadWindow,
    outcome: UpstreamOutcomeKind,
    counts: {
      fetchedCount: number;
      insertedCount: number;
      updatedCount: number;
      skippedOutOfScopeCount: number;
      errorReason: string | null;
    },
  ): Promise<void> {
    try {
      await this.deps.store.recordRun({
        jobKind: this.deps.jobKind,
        startedAtUtc,
        finishedAtUtc: new Date(this.now()),
        outcome,
        windowStartUtc: window.startUtc,
        windowEndUtc: window.endUtc,
        ...counts,
      });
    } catch (error: unknown) {
      // The ledger failing must not fail the tour that populated the store. It DOES cost the
      // freshness anchor, so it is an ERROR rather than a warning.
      this.deps.metrics.increment('eq.run_record_failed', AFAD_TDVMS_PROVIDER);
      this.logger.error(`the ingest run could not be recorded — ${describeErrorWithName(error)}`);
    }
  }

  /** Retention for the run ledger (`FU-EQ-RUNS-PRUNE`). Housekeeping never fails a tour. */
  private async prune(now: Date): Promise<void> {
    try {
      const removed = await this.deps.store.pruneRuns(this.deps.config.runRetentionDays, now);
      if (removed > 0) this.logger.debug(`pruned ${String(removed)} old ingest run row(s)`);
    } catch (error: unknown) {
      this.deps.metrics.increment('eq.prune_failed', AFAD_TDVMS_PROVIDER);
      this.logger.warn(`ingest run pruning failed — ${describeErrorWithName(error)}`);
    }
  }
}
