import { Logger } from '@nestjs/common';
import { describeErrorWithName } from '../common/describe-error';
import { OperationDeadline } from '../upstream/operation-deadline';
import type { ScheduledWarmupTarget } from '../upstream/scheduled-warmup.service';
import type { UpstreamHttpClient } from '../upstream/upstream-http.client';
import type { UpstreamMetrics } from '../upstream/upstream-metrics';
import type { UpstreamOutcomeKind } from '../upstream/upstream.types';
import { EarthquakeIngestJobKind } from './earthquake.types';
import { AFAD_TDVMS_PROVIDER, type EarthquakeUpstreamConfig } from './earthquake-upstream.config';
import { classifyAfadServerErrorBody } from './afad/afad-outcome';
import { parseAfadEventsBody, type AfadParsedPayload } from './afad/afad-event.parse';
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
  readonly jobKind: EarthquakeIngestJobKind;
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
      this.logger.log('tour slice too small for one call — yielding to the rest of the tour');
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
    const plateCodes = await store.loadProvincePlateCodes();
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
          `event ${row.providerEventId} was not written — ${describeErrorWithName(error)}`,
        );
      }
    }

    for (const rejection of payload.rejected) {
      this.deps.metrics.increment('eq.row_rejected', AFAD_TDVMS_PROVIDER);
      this.logger.warn(
        `event ${rejection.providerEventId ?? '(id unreadable)'} rejected — ${rejection.reason}`,
      );
    }

    if (this.deps.jobKind === EarthquakeIngestJobKind.Reconcile) {
      await this.reportDisappearances(window, payload);
    }

    await this.recordRun(startedAtUtc, window, 'ok', {
      fetchedCount: payload.fetchedCount,
      insertedCount,
      updatedCount,
      skippedOutOfScopeCount,
      errorReason: null,
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
    if (payload.rejected.length > 0 || writeFailedCount > 0) this.logger.warn(summary);
    else this.logger.log(summary);

    // One bad row and a broken write path produce the same per-row WARNs. Nothing written while
    // the database refused something is the shape only the systemic failure has.
    if (insertedCount === 0 && updatedCount === 0 && writeFailedCount > 0) {
      this.logger.error(
        `tour wrote NOTHING while the database refused ${String(writeFailedCount)} row(s) — ` +
          'this is a systemic write failure, not one bad row',
      );
    }

    await this.prune(writtenAt);
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
