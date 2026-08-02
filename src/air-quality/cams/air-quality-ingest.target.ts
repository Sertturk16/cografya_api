import { Logger } from '@nestjs/common';
import { OperationDeadline } from '../../upstream/operation-deadline';
import type { ScheduledWarmupTarget } from '../../upstream/scheduled-warmup.service';
import type { UpstreamHttpClient } from '../../upstream/upstream-http.client';
import type { ProviderBudgetLimits } from '../../upstream/provider-budget';
import type { UpstreamMetrics } from '../../upstream/upstream-metrics';
import type { UpstreamOutcome } from '../../upstream/upstream.types';
import { UpstreamSchemaError } from '../../upstream/upstream.types';
import { ALL_AIR_QUALITY_POLLUTANTS, AirQualityStatus } from '../air-quality.types';
import type { AirQualityUpstreamConfig } from '../air-quality-upstream.config';
import { CAMS_ADS_PROVIDER } from '../air-quality-upstream.config';
import type { Province } from '../../province/entities/province.entity';
import type {
  AdsJobKind,
  AdsJobRecord,
  AdsJobState,
  AirQualityErrorClass,
  AirQualityRun,
  AirQualityRunState,
  AirQualityStoredConcentrations,
  AirQualityStoredSupport,
} from '../entities/air-quality-run.entity';
import {
  analysisDateFor,
  assertAllowedDownloadHost,
  buildAnalysisRequestBody,
  buildForecastRequestBody,
  compactDay,
  costingUrl,
  currentRunDate,
  executionUrl,
  expectedProductFor,
  expectedStepCount,
  isLicenceRefusal,
  isoDay,
  isTerminalProviderStatus,
  jobResultsUrl,
  jobUrl,
  jobsListUrl,
  parseCosting,
  parseJobDismissal,
  parseJobList,
  parseJobStatus,
  parseResultAsset,
  type AdsRequestBody,
} from './ads-jobs';
import { toStoredDegrees } from '../entities/air-quality-province-series.entity';
import { adsRedactor } from './ads-redaction';
import { decodeCamsFile, type CamsDecodedFile } from './cams-decode';
import { CamsContractError } from './cams.errors';
import type { AirQualityIngestStorePort, RecordProvinceInput } from './air-quality-ingest.store';

/**
 * The scheduled CAMS ingest — a `ScheduledWarmupTarget` on the leg's OWN warmup instance.
 *
 * ## The binding principle
 * A user request NEVER triggers an ADS call. This class is the only thing in the process that
 * talks to the provider; it runs inside the warmup tour (cross-instance Redis lock included,
 * for free), and the e2e suite asserts the request path makes zero fetches.
 *
 * ## One step per tour (A-9), two jobs per day
 * A tour advances EXACTLY ONE job by EXACTLY ONE step: costing → submit → poll → results →
 * download+decode+store → cleanup. The download step resolves within its own tour because the
 * bytes are already in memory — writing 25 MiB to disk to defer decoding to the next tour would
 * be strictly worse.
 *
 * Job order is binding: the FORECAST always goes first. It is the page's "now"; the analysis is
 * an archive read of D−1 that can wait hours without anything being wrong. Reversing that would
 * let a slow analysis queue delay fresh data — not silently, but entirely needlessly.
 *
 * ## Never re-submit
 * A submit is NOT idempotent. So `submitting` is written to Postgres BEFORE the POST leaves,
 * the POST is made with `retryable: false`, and a tour that finds a job still in `submitting`
 * RECONCILES it against `GET /jobs` instead of submitting again. Measured: the job list does
 * not echo our request body, so adoption is deliberately narrow — exactly one unknown candidate
 * for our dataset created after our own submit stamp. Anything else stops LOUDLY, because
 * opening a second job on a guess is precisely the failure this whole path exists to avoid.
 */
export class AirQualityIngestTarget implements ScheduledWarmupTarget {
  readonly label = 'cams.run';

  private readonly logger = new Logger('AirQualityIngest');
  private readonly now: () => number;
  private readonly redact: (text: string) => string;

  constructor(private readonly deps: AirQualityIngestTargetDeps) {
    this.now = deps.now ?? Date.now;
    this.redact = adsRedactor(deps.config.ads.apiKey);
  }

  /** Never throws — the warmup contract. Every failure is logged and ends the slice. */
  async refresh(tourDeadline: OperationDeadline): Promise<void> {
    try {
      await this.runTourSlice(tourDeadline);
    } catch (error: unknown) {
      // Everything expected is handled inside; reaching here is OUR bug, and it must be loud
      // without killing the rest of the tour.
      this.deps.metrics.increment('airq.ingest_bug', CAMS_ADS_PROVIDER);
      this.logger.error(
        this.redact(
          `ingest slice aborted by an unexpected error — ` +
            `${error instanceof Error ? `${error.name}: ${error.message}` : 'unknown'}`,
        ),
      );
    }
  }

  private async runTourSlice(tourDeadline: OperationDeadline): Promise<void> {
    const { config } = this.deps;
    if (!config.ingestEnabled) return;

    const sliceBudgetMs = Math.min(config.ads.tourBudgetMs, tourDeadline.remainingMs());
    if (sliceBudgetMs < MIN_STEP_BUDGET_MS) {
      this.logger.log('tour slice too small for one step — yielding to the rest of the tour');
      return;
    }
    const deadline = new OperationDeadline(sliceBudgetMs, this.now);
    const nowDate = new Date(this.now());

    const run = await this.selectRun(nowDate);
    if (run === null) return;

    const selection = selectNextJob(run, config.ads.maxAttemptsPerJob);
    if (selection === null) {
      this.logger.debug(`run ${run.runUtc.toISOString()} has no advanceable job this tour`);
      return;
    }

    if (selection.action === 'cleanup') {
      await this.cleanupJob(run, selection.index, deadline);
      return;
    }
    await this.advanceJob(run, selection.index, deadline);
  }

  /**
   * Which run this tour is responsible for: the newest one, or a freshly created row for the
   * current run day once the submit hour has passed.
   *
   * A run whose FORECAST never finished is superseded rather than resumed across days — the
   * provider only keeps results ~1.5–2 days and yesterday's forecast is not what the page
   * needs. That supersession is LOUD (and marks the old run `abandoned`), because a run that
   * silently disappears from the ledger is how a broken ingest looks healthy.
   */
  private async selectRun(nowDate: Date): Promise<AirQualityRun | null> {
    const { config, store } = this.deps;
    const targetRunUtc = currentRunDate(nowDate, config.ads.submitAfterUtcHour);
    const newest = await store.newestRun();

    if (newest !== null && newest.runUtc.getTime() >= targetRunUtc.getTime()) {
      return newest;
    }
    if (nowDate.getUTCHours() < config.ads.submitAfterUtcHour) {
      // Before the submit hour the target run day is still YESTERDAY's. Whether this is a cold
      // start or the first tour after a multi-day outage, creating that run now would submit
      // jobs for a past run day only for the submit hour to supersede them loudly a few hours
      // later — one whole wasted job cycle (review #80 M3). A run already created for the
      // target day was returned above and keeps advancing through this window unimpeded.
      this.logger.debug('before the submit hour — the current run day is not submittable yet');
      return null;
    }

    if (newest !== null && !isRunTerminal(newest)) {
      // ERROR, like every other transition into `abandoned` (review #80 R2-M1): the same
      // terminal state must not be reported at two severities, or an operator filtering at
      // error level sees only some of the days on which nothing was published.
      //
      // ACCEPTED RESIDUAL: a job of the superseded run that still holds an open provider-side
      // job is never DELETE-cleaned — the ingest only ever advances the NEWEST run, so the old
      // row's cleanup debt is dropped here. The provider expires such a job on its own in ~2
      // days and the account holds no more than one orphan per superseded run; cleaning it
      // would mean advancing two runs per tour, which is a design change, not a fix.
      this.deps.metrics.increment('airq.run_abandoned', CAMS_ADS_PROVIDER);
      this.deps.metrics.event(
        'error',
        'air-quality run never completed before the next run day — superseding it',
        {
          provider: CAMS_ADS_PROVIDER,
          runUtc: newest.runUtc.toISOString(),
          state: newest.state,
          jobs: newest.adsRequests.map((job) => `${job.kind}:${job.state}`).join(','),
        },
      );
      await store.updateRun({
        runUtc: newest.runUtc,
        adsRequests: newest.adsRequests,
        state: 'abandoned',
      });
    }

    const runDate = isoDay(targetRunUtc);
    const jobs: AdsJobRecord[] = [
      newJob('forecast', runDate, buildForecastRequestBody(config.ads, runDate)),
    ];
    if (config.analysisEnabled) {
      const analysisDate = analysisDateFor(runDate);
      jobs.push(
        newJob('analysis', analysisDate, buildAnalysisRequestBody(config.ads, analysisDate)),
      );
    }
    await store.createRun({
      runUtc: targetRunUtc,
      datasetId: config.ads.datasetId,
      forecastHours: config.ads.forecastHours,
      adsRequests: jobs,
      now: nowDate,
    });
    this.logger.log(
      `run ${targetRunUtc.toISOString()} created with ${String(jobs.length)} job(s) ` +
        `(${jobs.map((job) => `${job.kind} ${job.requestDate}`).join(', ')})`,
    );
    return await store.getRun(targetRunUtc);
  }

  // ── one step of one job ──────────────────────────────────────────────────

  private async advanceJob(
    run: AirQualityRun,
    index: number,
    deadline: OperationDeadline,
  ): Promise<void> {
    const job = run.adsRequests[index];
    if (job === undefined) return;

    switch (job.state) {
      case 'pending':
        await this.stepCosting(run, index, job, deadline);
        return;
      case 'costed':
        await this.stepSubmit(run, index, job, deadline);
        return;
      case 'submitting':
        await this.stepReconcile(run, index, job, deadline);
        return;
      case 'submitted':
      case 'running':
        await this.stepPoll(run, index, job, deadline);
        return;
      case 'downloadable':
        await this.stepResults(run, index, job, deadline);
        return;
      case 'ready':
        await this.stepDownload(run, index, job, deadline);
        return;
      default:
        return;
    }
  }

  /**
   * `costing` — the free pre-submit guard.
   *
   * The endpoint answers HTTP 200 even when the cost exceeds the limit and never refuses by
   * itself, so the comparison is OURS and a refusal here is TERMINAL: the same request shape
   * will cost the same tomorrow, and submitting it anyway would spend the account's quota to be
   * rejected later.
   */
  private async stepCosting(
    run: AirQualityRun,
    index: number,
    job: AdsJobRecord,
    deadline: OperationDeadline,
  ): Promise<void> {
    const outcome = await this.deps.client.request({
      ...this.baseRequest(deadline, `${job.kind}.costing`),
      url: costingUrl(this.deps.config.ads),
      method: 'POST',
      requestBody: jsonBody({ inputs: job.requestBody }),
      parse: (body: string) => ({ kind: 'ok' as const, value: parseCosting(body) }),
    });
    if (outcome.kind !== 'ok') {
      await this.recordFailure(run, index, job, outcome);
      return;
    }
    if (outcome.value.cost > outcome.value.limit) {
      this.deps.metrics.increment('airq.cost_refused', CAMS_ADS_PROVIDER);
      this.deps.metrics.event('error', 'air-quality request shape exceeds the ADS cost limit', {
        provider: CAMS_ADS_PROVIDER,
        runUtc: run.runUtc.toISOString(),
        kind: job.kind,
        cost: outcome.value.cost,
        limit: outcome.value.limit,
      });
      await this.writeJob(run, index, {
        ...job,
        state: 'refused',
        lastError: `costing ${String(outcome.value.cost)} exceeds the account limit ${String(
          outcome.value.limit,
        )} — NOT submitting.`,
      });
      return;
    }
    await this.writeJob(run, index, { ...job, state: 'costed', lastError: null });
  }

  /**
   * `execution` — the one call in the leg that must never be retried automatically.
   *
   * `submitting` is persisted BEFORE the POST, so a process that dies mid-call leaves a state
   * that says "a job may exist upstream" rather than one that invites a second submit.
   */
  private async stepSubmit(
    run: AirQualityRun,
    index: number,
    job: AdsJobRecord,
    deadline: OperationDeadline,
  ): Promise<void> {
    const submittedAt = new Date(this.now()).toISOString();
    await this.writeJob(run, index, { ...job, state: 'submitting', submittedAt });

    const outcome = await this.deps.client.request({
      ...this.baseRequest(deadline, `${job.kind}.execution`),
      url: executionUrl(this.deps.config.ads),
      method: 'POST',
      requestBody: jsonBody({ inputs: job.requestBody }),
      // NOT idempotent: a retry after the provider already accepted creates a SECOND job.
      retryable: false,
      parse: (body: string) => ({ kind: 'ok' as const, value: parseJobStatus(body, 'execution') }),
    });

    if (outcome.kind !== 'ok') {
      // The status is read STRUCTURALLY from the outcome, and the match runs over the composed
      // (redacted, excerpt-capped) reason text — a JSON.parse of that text can never succeed,
      // which is exactly how the previous form left this branch unreachable (review #80 I5).
      if (outcome.kind === 'client_error' && isLicenceRefusal(outcome.httpStatus, outcome.reason)) {
        await this.terminate(run, index, job, 'licence not accepted for this dataset', 'refused');
        return;
      }
      // While it still has budget the job stays in `submitting` on purpose. The next tour
      // reconciles instead of submitting again — the failure may well have happened AFTER the
      // provider accepted.
      this.deps.metrics.event('warn', 'air-quality submit failed — reconciling on the next tour', {
        provider: CAMS_ADS_PROVIDER,
        runUtc: run.runUtc.toISOString(),
        kind: job.kind,
        outcome: outcome.kind,
      });
      const attempts = job.attempts + 1;
      const exhausted = this.noteAttemptsSpent(run, job, attempts, this.redact(outcome.reason));
      await this.writeJob(run, index, {
        ...job,
        // A job whose budget is spent reads `failed` in the ledger, whichever path spent the
        // last attempt (review #80 N6). The rollup already treated it as terminally failed;
        // leaving it in `submitting` only misreported WHAT happened to the next operator — and
        // to A2b, which reads this ledger. No re-submit is enabled: `selectNextJob` stops
        // advancing a job at its attempt ceiling regardless of the state word.
        state: exhausted ? 'failed' : 'submitting',
        submittedAt,
        attempts,
        lastError: this.redact(outcome.reason),
      });
      return;
    }

    await this.writeJob(run, index, {
      ...job,
      state: 'submitted',
      submittedAt,
      jobId: outcome.value.jobId,
      adsCreated: outcome.value.created,
      lastError: null,
    });
    this.logger.log(`${job.kind} job queued as ${outcome.value.jobId}`);
  }

  /**
   * Reconcile a job stuck in `submitting` — the ONE alternative to re-submitting.
   *
   * Candidates are FILTERED first: every job id we already know is removed, because with two
   * jobs a day we may legitimately have another of our own still running. On what remains:
   * 0 candidates ⇒ the submit never arrived, go back to `costed`; exactly 1 candidate created
   * at or after our submit stamp ⇒ adopt it; anything else ⇒ stop LOUDLY and leave it to a
   * human. Measured: the list does not echo request inputs, so a body comparison is not
   * available and the narrow rule is what remains.
   */
  private async stepReconcile(
    run: AirQualityRun,
    index: number,
    job: AdsJobRecord,
    deadline: OperationDeadline,
  ): Promise<void> {
    const outcome = await this.deps.client.request({
      ...this.baseRequest(deadline, `${job.kind}.jobs-list`),
      url: jobsListUrl(this.deps.config.ads),
      parse: (body: string) => ({ kind: 'ok' as const, value: parseJobList(body) }),
    });
    if (outcome.kind !== 'ok') {
      await this.recordFailure(run, index, job, outcome);
      return;
    }

    const known = new Set(
      run.adsRequests
        .map((entry) => entry.jobId)
        .filter((jobId): jobId is string => jobId !== null),
    );
    const candidates = outcome.value.filter(
      (entry) =>
        !known.has(entry.jobId) &&
        entry.processId === this.deps.config.ads.datasetId &&
        isAtOrAfter(entry.created, job.submittedAt),
    );

    if (candidates.length === 0) {
      const attempts = job.attempts + 1;
      const exhausted = this.noteAttemptsSpent(
        run,
        job,
        attempts,
        'submit never arrived; re-submit budget spent',
      );
      this.logger.warn(
        `${job.kind}: no upstream job matches our submit window — the submit never arrived; ` +
          (exhausted
            ? 'the attempt budget is spent, so the job gives up here.'
            : 'returning to costed for ONE clean re-submit.'),
      );
      await this.writeJob(run, index, {
        ...job,
        // `failed` at exhaustion, like every other attempt-spending path (review #80 N6).
        state: exhausted ? 'failed' : 'costed',
        attempts,
        submittedAt: null,
      });
      return;
    }
    const adopted = candidates[0];
    if (candidates.length > 1 || adopted === undefined) {
      // Ambiguity is exactly the situation in which opening another job is the wrong move.
      this.deps.metrics.increment('airq.reconcile_ambiguous', CAMS_ADS_PROVIDER);
      this.deps.metrics.event(
        'error',
        'air-quality reconciliation is AMBIGUOUS — refusing to submit again; a human must look',
        {
          provider: CAMS_ADS_PROVIDER,
          runUtc: run.runUtc.toISOString(),
          kind: job.kind,
          candidates: candidates.length,
        },
      );
      // The ambiguity SPENDS an attempt: without this the job stayed permanently progressable,
      // re-entering here (and re-paying the ADS request + re-emitting the event) every tour
      // forever — ~144×/day of identical error events and wasted provider budget (review #80
      // I10). The attempt budget now terminates it into an honest terminal rollup; the alarm
      // above has already said a human must look.
      const attempts = job.attempts + 1;
      const exhausted = this.noteAttemptsSpent(
        run,
        job,
        attempts,
        'reconciliation ambiguous; attempt budget spent',
      );
      await this.writeJob(run, index, {
        ...job,
        // `failed` at exhaustion, like every other attempt-spending path (review #80 N6).
        state: exhausted ? 'failed' : job.state,
        attempts,
        lastError: `${String(candidates.length)} unknown upstream jobs match our submit window`,
      });
      return;
    }

    this.logger.warn(`${job.kind}: adopted upstream job ${adopted.jobId} instead of re-submitting`);
    await this.writeJob(run, index, {
      ...job,
      state: adopted.status === 'successful' ? 'downloadable' : 'submitted',
      jobId: adopted.jobId,
      adsCreated: adopted.created,
      lastError: null,
    });
  }

  private async stepPoll(
    run: AirQualityRun,
    index: number,
    job: AdsJobRecord,
    deadline: OperationDeadline,
  ): Promise<void> {
    if (job.jobId === null) {
      // Unreachable by construction (`submitted`/`running` are only written with a job id). If
      // a refactor ever breaks that, this tour would otherwise spin here silently forever —
      // say so instead (review #80 M8).
      this.logger.error(`${job.kind}: state "${job.state}" with no jobId — ingest wiring bug`);
      return;
    }
    const outcome = await this.deps.client.request({
      ...this.baseRequest(deadline, `${job.kind}.poll`),
      url: jobUrl(this.deps.config.ads, job.jobId),
      parse: (body: string) => ({ kind: 'ok' as const, value: parseJobStatus(body, 'poll') }),
    });
    if (outcome.kind !== 'ok') {
      await this.recordFailure(run, index, job, outcome);
      return;
    }

    const status = outcome.value.status;
    const stamps = {
      adsCreated: outcome.value.created,
      adsStarted: outcome.value.started,
      adsFinished: outcome.value.finished,
    };
    if (status === 'successful') {
      await this.writeJob(run, index, { ...job, ...stamps, state: 'downloadable' });
      return;
    }
    if (isTerminalProviderStatus(status)) {
      this.deps.metrics.increment('airq.provider_refusal', CAMS_ADS_PROVIDER);
      await this.terminate(
        run,
        index,
        { ...job, ...stamps },
        `the provider ended the job as "${status}"`,
        'rejected',
        // `upstream`, not the default `refused`: THEY ended the job, exactly as in the sibling
        // `failed` branch below. `refused` is reserved for refusals WE make (review #80 N7).
        'upstream',
      );
      return;
    }
    if (status === 'failed') {
      // Terminal for the JOB, immediately — the plan §5.4 ladder's `failed ⇒ failed`. A
      // provider-side `failed` never becomes `successful` again, so "retrying" here could only
      // re-poll the same dead job until the attempt budget burned out (~1 h of noise for the
      // same answer, review #80 I11). The rollup and its abandoned/degraded alarm fire now,
      // while a human could still conceivably act on the day.
      this.deps.metrics.increment('airq.provider_failed', CAMS_ADS_PROVIDER);
      await this.terminate(
        run,
        index,
        { ...job, ...stamps },
        'the provider ended the job as "failed" — a fresh submit needs a human decision',
        'failed',
        'upstream',
      );
      return;
    }
    await this.writeJob(run, index, {
      ...job,
      ...stamps,
      state: status === 'running' ? 'running' : 'submitted',
    });
  }

  private async stepResults(
    run: AirQualityRun,
    index: number,
    job: AdsJobRecord,
    deadline: OperationDeadline,
  ): Promise<void> {
    if (job.jobId === null) {
      // Unreachable by construction — see the matching guard in stepPoll (review #80 M8).
      this.logger.error(`${job.kind}: state "${job.state}" with no jobId — ingest wiring bug`);
      return;
    }
    const outcome = await this.deps.client.request({
      ...this.baseRequest(deadline, `${job.kind}.results`),
      url: jobResultsUrl(this.deps.config.ads, job.jobId),
      parse: (body: string) => ({ kind: 'ok' as const, value: parseResultAsset(body) }),
    });
    if (outcome.kind !== 'ok') {
      await this.recordFailure(run, index, job, outcome);
      return;
    }

    // The guards that cost nothing, in order, BEFORE any byte is paid for.
    const { ads } = this.deps.config;
    let url: URL;
    try {
      url = assertAllowedDownloadHost(outcome.value.href, ads.objectStoreHosts);
    } catch (error: unknown) {
      // SSRF class — the plan's §5.4 guard 1 requires this refusal to be LOUD, and `terminate`
      // now alarms every abandoned run by construction; the dedicated counter names the cause.
      this.deps.metrics.increment('airq.download_host_refused', CAMS_ADS_PROVIDER);
      await this.terminate(
        run,
        index,
        job,
        error instanceof Error ? error.message : 'result href refused',
        'refused',
      );
      return;
    }
    if (outcome.value.sizeBytes > ads.runMaxBytes) {
      // LOUD, and BEFORE the network: the declared size already exceeds the heap ceiling, so
      // reality has diverged from the measured 25.26 MiB and someone must look.
      this.deps.metrics.increment('airq.size_refused', CAMS_ADS_PROVIDER);
      this.deps.metrics.event(
        'error',
        'air-quality result declares more bytes than AIR_QUALITY_RUN_MAX_BYTES — not downloading',
        {
          provider: CAMS_ADS_PROVIDER,
          runUtc: run.runUtc.toISOString(),
          kind: job.kind,
          declaredBytes: outcome.value.sizeBytes,
          capBytes: ads.runMaxBytes,
        },
      );
      await this.terminate(
        run,
        index,
        job,
        `declared file:size ${String(outcome.value.sizeBytes)} exceeds the ` +
          `${String(ads.runMaxBytes)} B cap`,
        'refused',
      );
      return;
    }

    // The VERIFIED href is stored (the parsed URL's own serialisation), never the raw provider
    // string, so nothing downstream can re-interpret bytes the allowlist already judged.
    await this.writeJob(run, index, {
      ...job,
      state: 'ready',
      lastError: null,
      result: {
        href: url.toString(),
        sizeBytes: outcome.value.sizeBytes,
        checksum: outcome.value.checksum,
      },
    });
  }

  /** Download, verify, decode and store — all inside this tour, because the bytes are in RAM. */
  private async stepDownload(
    run: AirQualityRun,
    index: number,
    job: AdsJobRecord,
    deadline: OperationDeadline,
  ): Promise<void> {
    const asset = job.result;
    if (asset === null) {
      await this.writeJob(run, index, { ...job, state: 'downloadable' });
      return;
    }
    const { ads } = this.deps.config;

    const outcome = await this.deps.client.request<Uint8Array>({
      ...this.baseRequest(deadline, `${job.kind}.download`),
      url: asset.href,
      // The ONE long call of the protocol (12.6 s measured for 25 MiB). Every JSON step runs
      // under the poll timeout set in `baseRequest`; only the archive gets the download cap.
      singleCallTimeoutMs: ads.downloadTimeoutMs,
      responseKind: 'bytes',
      expectedContentType: DOWNLOAD_CONTENT_TYPES,
      // No PRIVATE-TOKEN here: the object store authenticates nothing, and sending the key to a
      // third host would leak it across a trust boundary. The header map is built explicitly so
      // this is visible at the call site rather than being an omission.
      headers: {},
      // The provider's own declared size, floored by our ceiling — the cap stays authoritative
      // even if the guard above ever drifts.
      maxResponseBytes: Math.min(asset.sizeBytes, ads.runMaxBytes),
      parse: (body: Uint8Array) => {
        if (body.byteLength !== asset.sizeBytes) {
          throw new UpstreamSchemaError(
            `downloaded ${String(body.byteLength)} B where results declared ` +
              `${String(asset.sizeBytes)} B.`,
          );
        }
        return { kind: 'ok' as const, value: body };
      },
    });
    if (outcome.kind !== 'ok') {
      await this.recordFailure(run, index, job, outcome);
      return;
    }

    const md5 = await this.deps.md5(outcome.value);
    if (md5.toLowerCase() !== asset.checksum.toLowerCase()) {
      await this.recordTransient(
        run,
        index,
        job,
        `MD5 ${md5} does not match the declared file:checksum`,
      );
      return;
    }

    await this.decodeAndStore(run, index, job, outcome.value);
  }

  private async decodeAndStore(
    run: AirQualityRun,
    index: number,
    job: AdsJobRecord,
    archive: Uint8Array,
  ): Promise<void> {
    const { config, store } = this.deps;
    const provinces = await this.loadProvinces();
    if (provinces === null) return;

    let decoded: CamsDecodedFile;
    try {
      decoded = decodeCamsFile(archive, {
        // Both cross-validations come from the JOB, never from a constant.
        expectedRunDate: compactDay(job.requestDate),
        expectedProduct: expectedProductFor(job.kind),
        points: provinces.map((province) => ({
          plateCode: province.plateCode,
          latitude: province.latitude ?? 0,
          longitude: province.longitude ?? 0,
        })),
        pollutants: ALL_AIR_QUALITY_POLLUTANTS,
        maxInflatedBytes: config.ads.runMaxBytes,
      });
    } catch (error: unknown) {
      if (error instanceof CamsContractError) {
        // The `unexpected` flag separates "OUR decoder is broken" from "the provider drifted".
        // Both fail closed; only the diagnosis differs, and flattening them sends the next
        // person to the wrong file (plan §10-D3).
        const errorClass: AirQualityErrorClass = error.unexpected ? 'decoder_bug' : 'contract';
        this.deps.metrics.increment(
          error.unexpected ? 'airq.decoder_bug' : 'airq.contract_refusal',
          CAMS_ADS_PROVIDER,
        );
        this.deps.metrics.event(
          'error',
          error.unexpected
            ? 'air-quality DECODER BUG — not a provider deviation; fix the decoder'
            : 'air-quality payload refused by a pinned contract guard — provider record',
          {
            provider: CAMS_ADS_PROVIDER,
            runUtc: run.runUtc.toISOString(),
            kind: job.kind,
            reason: this.redact(error.message),
          },
        );
        await this.terminate(run, index, job, error.message, 'rejected', errorClass);
        return;
      }
      throw error;
    }

    // Judged against the horizon THIS RUN was created with (persisted for exactly this,
    // SAPMA 3) — an env change mid-run must not refuse an in-flight run whose bytes were
    // already paid for (review #80 M2). The span→step-count `+1` lives in the helper alone
    // (review #80 N4); `run` is passed in place of the config for the reason above.
    const expectedSteps = expectedStepCount(run, job.kind);
    if (decoded.timeHours.length !== expectedSteps) {
      this.deps.metrics.increment('airq.step_count_mismatch', CAMS_ADS_PROVIDER);
      await this.terminate(
        run,
        index,
        job,
        `decoded ${String(decoded.timeHours.length)} steps where the request asks for ` +
          `${String(expectedSteps)}`,
        'rejected',
        'contract',
      );
      return;
    }

    const byPlate = new Map(provinces.map((province) => [province.plateCode, province]));
    const rows: RecordProvinceInput[] = [];
    for (const decodedProvince of decoded.provinces) {
      const province = byPlate.get(decodedProvince.plateCode);
      if (province === undefined) continue;
      rows.push({
        provinceId: province.id,
        gridLatitude: decodedProvince.gridLatitude ?? 0,
        gridLongitude: decodedProvince.gridLongitude ?? 0,
        distanceKm: decodedProvince.distanceKm ?? 0,
        concentrations: toStoredConcentrations(decodedProvince.series),
        support: toStoredSupport(decodedProvince.support),
      });
    }

    // The analysis product must be read from the SAME cells as the forecast it will be merged
    // with. A drift here produces a series that errors nowhere and simply lies about where the
    // past came from — so the analysis is refused and the forecast publication is untouched.
    if (job.kind === 'analysis') {
      const forecastCells = await store.gridCellsFor(run.runUtc);
      if (forecastCells.size === 0) {
        // Defence in depth: `selectNextJob` no longer advances an analysis past a dead
        // forecast, so an empty map here is an ingest sequencing bug, not provider drift.
        // Saying "the grids differ" would send the operator to the provider, the wrong way
        // (review #80 I12 / M7 — the validator's misdirection note).
        this.deps.metrics.increment('airq.analysis_without_forecast', CAMS_ADS_PROVIDER);
        this.deps.metrics.event(
          'error',
          'air-quality analysis decoded but this run has NO stored forecast rows — nothing to ' +
            'align the grid-identity guard with; refusing the analysis product (ingest ' +
            'sequencing bug, NOT a provider grid change)',
          { provider: CAMS_ADS_PROVIDER, runUtc: run.runUtc.toISOString() },
        );
        await this.terminate(
          run,
          index,
          job,
          'no forecast rows are stored for this run — the analysis has nothing to align with',
          'refused',
        );
        return;
      }
      // Both sides pass through `toStoredDegrees`: the stored side went through the
      // `numeric(9,6)` transformer, so comparing it against the raw float32 decode would
      // refuse essentially every real run — 76/81 committed probe cells mismatch under a
      // strict `!==` (review #80 C2, empirically validated).
      const mismatched = rows.filter((row) => {
        const cell = forecastCells.get(row.provinceId);
        return (
          cell === undefined ||
          toStoredDegrees(cell.latitude) !== toStoredDegrees(row.gridLatitude) ||
          toStoredDegrees(cell.longitude) !== toStoredDegrees(row.gridLongitude)
        );
      });
      if (mismatched.length > 0) {
        this.deps.metrics.increment('airq.analysis_grid_mismatch', CAMS_ADS_PROVIDER);
        this.deps.metrics.event(
          'error',
          'air-quality analysis grid differs from the forecast grid — REFUSING the analysis ' +
            'product; the forecast publication is unaffected',
          {
            provider: CAMS_ADS_PROVIDER,
            runUtc: run.runUtc.toISOString(),
            mismatchedProvinces: mismatched.length,
          },
        );
        await this.terminate(
          run,
          index,
          job,
          `${String(mismatched.length)} provinces map to a different cell than the forecast`,
          'rejected',
          'contract',
        );
        return;
      }
    }

    const bytes = (run.bytesDownloaded ?? 0) + archive.byteLength;
    const jobs = replaceJob(run.adsRequests, index, {
      ...job,
      state: 'stored',
      lastError: null,
    });
    run.adsRequests = jobs;
    // Through `rollupLoudly` like EVERY other run-state write (review #80 R2-I1). A stored
    // product cannot roll the run to `abandoned` today — the analysis is only advanced behind a
    // `stored` forecast, and a `stored` forecast is not a terminal failure — so this is the
    // invariant, not a live alarm: the helper's promise that no state-writing path can bypass
    // it has to be true of every call site, or the next refactor reopens C1 in silence.
    await store.recordProduct({
      runUtc: run.runUtc,
      kind: job.kind,
      hours: job.kind === 'forecast' ? run.forecastHours : decoded.timeHours.length,
      provinces: rows,
      bytesDownloaded: bytes,
      fileFormat: `zip(${String(decoded.zipMethod)})+${decoded.innerFormat}`,
      decoderVersion: decoded.decoderVersion,
      adsRequests: jobs,
      state: this.rollupLoudly(run, jobs, `${job.kind} product stored`),
      now: new Date(this.now()),
    });
    this.logger.log(
      `${job.kind} stored: ${String(rows.length)} provinces × ${String(decoded.timeHours.length)} ` +
        `steps from ${String(archive.byteLength)} B`,
    );

    // Retention runs only in the tour that actually wrote the FORECAST — a no-op tour prunes
    // nothing, so a paused ingest can never age the store down below what it still serves.
    if (job.kind === 'forecast') {
      await store.pruneRuns(RETAINED_RUNS);
    }
  }

  /** Politeness: `DELETE /jobs/{id}` in its OWN tour, after the bytes are safely stored. */
  private async cleanupJob(
    run: AirQualityRun,
    index: number,
    deadline: OperationDeadline,
  ): Promise<void> {
    const job = run.adsRequests[index];
    if (job === undefined || job.jobId === null) {
      // Unreachable: the cleanup selector only picks jobs WITH an id (review #80 M8).
      this.logger.error('cleanup selected a job with no jobId — ingest wiring bug');
      return;
    }

    const outcome = await this.deps.client.request({
      ...this.baseRequest(deadline, `${job.kind}.delete`),
      url: jobUrl(this.deps.config.ads, job.jobId),
      method: 'DELETE',
      // Measured: HTTP 200 + application/json with a `status` field — NOT a bare 204. The
      // ordinary text branch and the ordinary content-type guard both apply unchanged. Parsed
      // with the DELETE-specific parser: the probe never recorded the body's full field list,
      // so only `status` may be required of it (review #80 I2).
      parse: (body: string) => ({ kind: 'ok' as const, value: parseJobDismissal(body) }),
    });
    if (outcome.kind !== 'ok') {
      // Cleanup is politeness, not correctness: the result expires on its own in ~2 days. The
      // stamp is written anyway so a failing DELETE cannot spin every tour forever. Counted, not
      // just logged (review #80 R2-M2): a DELETE that stops confirming EVERY day is how a
      // protocol drift (or a jobs-endpoint change) announces itself first, and a warn line
      // nobody counts is where that announcement dies.
      this.deps.metrics.increment('airq.cleanup_unconfirmed', CAMS_ADS_PROVIDER);
      this.logger.warn(
        `${job.kind}: DELETE did not confirm (${outcome.kind}) — the job expires on its own.`,
      );
    }
    await this.writeJob(run, index, {
      ...job,
      cleanupAt: new Date(this.now()).toISOString(),
    });
  }

  // ── shared plumbing ──────────────────────────────────────────────────────

  private baseRequest(deadline: OperationDeadline, label: string): AdsRequestBase {
    const limits = this.deps.config.budgets[CAMS_ADS_PROVIDER];
    if (limits === undefined) {
      throw new Error('the cams-ads provider budget is missing from the resolved config');
    }
    const apiKey = this.deps.config.ads.apiKey;
    return {
      providerId: CAMS_ADS_PROVIDER,
      label: `airq.${label}`,
      deadline,
      limits,
      // Every JSON step of the protocol finishes in well under a second; only the archive
      // download (which overrides this at ITS call site) may run long. Without the split the
      // declared poll timeout was read by nothing and one stalled poll could hold the
      // download's 180 s cap — most of a whole tour slice (review #80 I8).
      singleCallTimeoutMs: this.deps.config.ads.pollTimeoutMs,
      // The key travels ONLY in this header, only to the ADS API host. The download step
      // overrides `headers` with an empty map so it can never inherit it.
      headers: apiKey === null ? {} : { 'PRIVATE-TOKEN': apiKey },
      // The bare-UUID redactor: a provider that ever echoes the key into an error body must not
      // put it in a line that is logged at ERROR and cached.
      redactBody: this.redact,
    };
  }

  /** The 81 reference points, refused loudly when the seed is not what the ingest assumes. */
  private async loadProvinces(): Promise<Province[] | null> {
    const provinces = await this.deps.loadProvinces();
    const usable = provinces.filter(
      (province) => province.latitude !== null && province.longitude !== null,
    );
    if (usable.length !== EXPECTED_PROVINCE_COUNT) {
      // Silently ingesting 79 provinces is precisely the class this repo hunts: every endpoint
      // would answer, two provinces would simply never have data, and nothing would say why.
      this.deps.metrics.increment('airq.province_set_invalid', CAMS_ADS_PROVIDER);
      this.deps.metrics.event(
        'error',
        'the province reference set is not the expected 81 fully-located rows — refusing to ' +
          'ingest a partial set',
        {
          provider: CAMS_ADS_PROVIDER,
          rows: provinces.length,
          located: usable.length,
          expected: EXPECTED_PROVINCE_COUNT,
        },
      );
      return null;
    }
    return usable;
  }

  private async writeJob(run: AirQualityRun, index: number, job: AdsJobRecord): Promise<void> {
    const jobs = replaceJob(run.adsRequests, index, job);
    run.adsRequests = jobs;
    await this.deps.store.updateRun({
      runUtc: run.runUtc,
      adsRequests: jobs,
      state: this.rollupLoudly(run, jobs, job.lastError ?? 'job state write'),
      lastError: job.lastError,
    });
  }

  /** A provider/network failure: counted against the per-JOB budget, never the run's. */
  private async recordFailure(
    run: AirQualityRun,
    index: number,
    job: AdsJobRecord,
    outcome: Exclude<UpstreamOutcome<unknown>, { kind: 'ok' }>,
  ): Promise<void> {
    if (outcome.kind === 'schema_error') {
      await this.terminate(run, index, job, outcome.reason, 'rejected', 'contract');
      return;
    }
    await this.recordTransient(run, index, job, `${outcome.kind}: ${outcome.reason}`);
  }

  private async recordTransient(
    run: AirQualityRun,
    index: number,
    job: AdsJobRecord,
    reason: string,
  ): Promise<void> {
    const attempts = job.attempts + 1;
    const exhausted = this.noteAttemptsSpent(run, job, attempts, this.redact(reason));
    const jobs = replaceJob(run.adsRequests, index, {
      ...job,
      attempts,
      state: exhausted ? 'failed' : job.state,
      lastError: this.redact(reason),
    });
    run.adsRequests = jobs;
    await this.deps.store.updateRun({
      runUtc: run.runUtc,
      adsRequests: jobs,
      state: this.rollupLoudly(run, jobs, this.redact(reason)),
      lastError: this.redact(reason),
      lastErrorClass: 'upstream',
    });
  }

  private async terminate(
    run: AirQualityRun,
    index: number,
    job: AdsJobRecord,
    reason: string,
    state: Extract<AdsJobState, 'refused' | 'rejected' | 'failed'>,
    errorClass: AirQualityErrorClass = 'refused',
  ): Promise<void> {
    const jobs = replaceJob(run.adsRequests, index, {
      ...job,
      state,
      lastError: this.redact(reason),
    });
    run.adsRequests = jobs;
    const runState = this.rollupLoudly(run, jobs, this.redact(reason));
    if (job.kind === 'analysis' && runState === 'degraded') {
      // The fixed-24-hours promise is broken, but fresh data keeps flowing. LOUD, because the
      // contract shrinks honestly and somebody has to know it did.
      this.deps.metrics.increment('airq.run_degraded', CAMS_ADS_PROVIDER);
      this.deps.metrics.event(
        'warn',
        'air-quality analysis product failed terminally — the run publishes WITHOUT its past ' +
          'half (analysisEndUtc will be null)',
        {
          provider: CAMS_ADS_PROVIDER,
          runUtc: run.runUtc.toISOString(),
          reason: this.redact(reason),
        },
      );
    }
    await this.deps.store.updateRun({
      runUtc: run.runUtc,
      adsRequests: jobs,
      state: runState,
      lastError: this.redact(reason),
      lastErrorClass: errorClass,
    });
  }

  /**
   * The run-level rollup, with the abandoned alarm BY CONSTRUCTION.
   *
   * Every path that writes a run state goes through here, so no terminal forecast failure —
   * provider refusal, off-allowlist host, step-count mismatch, exhausted budget, cost refusal
   * — can roll the run to `abandoned` without an error-level event and the `airq.run_abandoned`
   * counter. Review #80 C1 (validated): three such paths reached `abandoned` in total silence,
   * the next-day supersede skips already-terminal runs, and the page would have served a stale
   * run indefinitely with nothing to page on. Alarming at the transition, not at the call
   * sites, is what makes the next forgotten call site impossible.
   */
  private rollupLoudly(
    run: AirQualityRun,
    jobs: readonly AdsJobRecord[],
    reason: string,
  ): AirQualityRunState {
    const state = rollupRunState(jobs, this.deps.config.ads.maxAttemptsPerJob);
    if (state === 'abandoned' && run.state !== 'abandoned') {
      this.deps.metrics.increment('airq.run_abandoned', CAMS_ADS_PROVIDER);
      this.deps.metrics.event(
        'error',
        'air-quality run ABANDONED — its forecast failed terminally; nothing will be published ' +
          'for this run day and the previous run keeps serving',
        {
          provider: CAMS_ADS_PROVIDER,
          runUtc: run.runUtc.toISOString(),
          jobs: jobs.map((job) => `${job.kind}:${job.state}`).join(','),
          reason,
        },
      );
    }
    run.state = state;
    return state;
  }

  /**
   * The ONE exhaustion check, shared by every attempt-spending path (review #80 I6): a job
   * that gives up must always fire `airq.attempts_exhausted` at error level, whichever branch
   * spent the final attempt. Returns whether the budget is now exhausted.
   */
  private noteAttemptsSpent(
    run: AirQualityRun,
    job: AdsJobRecord,
    attempts: number,
    reason: string,
  ): boolean {
    const exhausted = attempts >= this.deps.config.ads.maxAttemptsPerJob;
    if (exhausted) {
      this.deps.metrics.increment('airq.attempts_exhausted', CAMS_ADS_PROVIDER);
      this.deps.metrics.event('error', 'air-quality job gave up after its attempt budget', {
        provider: CAMS_ADS_PROVIDER,
        runUtc: run.runUtc.toISOString(),
        kind: job.kind,
        attempts,
        reason,
      });
    }
    return exhausted;
  }
}

// ─── dependencies ────────────────────────────────────────────────────────────

/** The options every ADS call shares — provider id, budget, the key header and the redactor. */
interface AdsRequestBase {
  readonly providerId: string;
  readonly label: string;
  readonly deadline: OperationDeadline;
  readonly limits: ProviderBudgetLimits;
  /** The JSON-step cap (`AIR_QUALITY_POLL_TIMEOUT_MS`); the download overrides it. */
  readonly singleCallTimeoutMs: number;
  readonly headers: Record<string, string>;
  readonly redactBody: (excerpt: string) => string;
}

export interface AirQualityIngestTargetDeps {
  readonly client: UpstreamHttpClient;
  readonly store: AirQualityIngestStorePort;
  readonly config: AirQualityUpstreamConfig;
  /** Reads the reference points — injected so the target does not own a repository. */
  readonly loadProvinces: () => Promise<Province[]>;
  readonly metrics: UpstreamMetrics;
  /** Injected so the pure state machine never imports node:crypto. */
  readonly md5: (bytes: Uint8Array) => Promise<string> | string;
  readonly now?: () => number;
}

// ─── pure helpers (unit-tested without a network or a database) ──────────────

/** Runs retained in Postgres. Three: today's, plus enough history to survive a missed day. */
export const RETAINED_RUNS = 3;

/** The province reference set the ingest is built for. Anything else is refused loudly. */
export const EXPECTED_PROVINCE_COUNT = 81;

/** Below this the slice cannot pay for a single step, so the tour yields instead of starting one. */
const MIN_STEP_BUDGET_MS = 5_000;

/**
 * Content types accepted on the result download. A LIST, like the marine mirror case, though
 * exactly one member is measured today (`application/zip` on all three archives of the A2a
 * probe pass). Unmeasured members are deliberately NOT added: a guess here is how a guard stops
 * guarding.
 */
const DOWNLOAD_CONTENT_TYPES = ['application/zip'] as const;

/** States from which a job still has a step to take. */
const PROGRESSABLE_STATES: readonly AdsJobState[] = [
  'pending',
  'costed',
  'submitting',
  'submitted',
  'running',
  'downloadable',
  'ready',
];

function newJob(kind: AdsJobKind, requestDate: string, requestBody: AdsRequestBody): AdsJobRecord {
  return {
    kind,
    requestDate,
    requestBody,
    state: 'pending',
    jobId: null,
    attempts: 0,
    submittedAt: null,
    adsCreated: null,
    adsStarted: null,
    adsFinished: null,
    cleanupAt: null,
    result: null,
    lastError: null,
  };
}

function replaceJob(
  jobs: readonly AdsJobRecord[],
  index: number,
  job: AdsJobRecord,
): AdsJobRecord[] {
  return jobs.map((entry, position) => (position === index ? job : entry));
}

/** A job that will never produce a product: a terminal state, or a spent attempt budget. */
export function isJobTerminalFailure(job: AdsJobRecord, maxAttemptsPerJob: number): boolean {
  return (
    job.state === 'refused' ||
    job.state === 'rejected' ||
    job.state === 'failed' ||
    job.attempts >= maxAttemptsPerJob
  );
}

/**
 * Which job this tour advances, and how.
 *
 * The FORECAST outranks everything, always: it is the page's "now". An analysis behind a DEAD
 * forecast is not advanced at all — its product could only ever be refused by the grid-identity
 * guard (there are no forecast rows to align with), so advancing it would spend a real ADS
 * submit and a ~6.25 MiB download every day of an abandoned run to manufacture a misleading
 * refusal (review #80 I12/M7). Cleanup debt comes last — it is politeness, and it must never
 * delay data.
 */
export function selectNextJob(
  run: { adsRequests: readonly AdsJobRecord[] },
  maxAttemptsPerJob: number,
): { index: number; action: 'progress' | 'cleanup' } | null {
  const progressable = (job: AdsJobRecord): boolean =>
    PROGRESSABLE_STATES.includes(job.state) && job.attempts < maxAttemptsPerJob;

  const forecast = run.adsRequests.find((job) => job.kind === 'forecast');
  const forecastDead = forecast === undefined || isJobTerminalFailure(forecast, maxAttemptsPerJob);

  for (const kind of ['forecast', 'analysis'] as const) {
    if (kind === 'analysis' && forecastDead) continue;
    const index = run.adsRequests.findIndex((job) => job.kind === kind && progressable(job));
    if (index >= 0) return { index, action: 'progress' };
  }
  const cleanupIndex = run.adsRequests.findIndex(
    (job) =>
      job.jobId !== null && job.cleanupAt === null && !PROGRESSABLE_STATES.includes(job.state),
  );
  if (cleanupIndex >= 0) return { index: cleanupIndex, action: 'cleanup' };
  return null;
}

/**
 * The run-level rollup, DERIVED from the jobs and written in the same transaction.
 *
 * `serviceable` and `degraded` both publish. The difference is whether the fixed-24-hours
 * promise was kept, which is a counter-and-alarm question: the data already says
 * `analysis_hours = 0`, but `degraded` says "we know, and we made noise".
 */
export function rollupRunState(
  jobs: readonly AdsJobRecord[],
  maxAttemptsPerJob: number,
): AirQualityRunState {
  const forecast = jobs.find((job) => job.kind === 'forecast');
  const analysis = jobs.find((job) => job.kind === 'analysis');

  if (forecast === undefined || isJobTerminalFailure(forecast, maxAttemptsPerJob)) {
    return 'abandoned';
  }
  if (forecast.state !== 'stored') return 'pending';
  if (analysis === undefined) return 'complete';
  if (analysis.state === 'stored') return 'complete';
  if (isJobTerminalFailure(analysis, maxAttemptsPerJob)) return 'degraded';
  return 'serviceable';
}

/** A run nobody will advance again — used to decide whether superseding it must be loud. */
export function isRunTerminal(run: { state: AirQualityRunState }): boolean {
  return run.state === 'complete' || run.state === 'degraded' || run.state === 'abandoned';
}

function isAtOrAfter(candidateIso: string | null, sinceIso: string | null): boolean {
  if (sinceIso === null) return false;
  if (candidateIso === null) return false;
  const candidate = Date.parse(candidateIso);
  const since = Date.parse(sinceIso);
  if (Number.isNaN(candidate) || Number.isNaN(since)) return false;
  // One minute of slack for clock skew between our stamp and the provider's.
  return candidate >= since - 60_000;
}

function jsonBody(payload: unknown): { contentType: string; content: string } {
  return { contentType: 'application/json', content: JSON.stringify(payload) };
}

function toStoredConcentrations(
  series: Record<string, (number | null)[]>,
): AirQualityStoredConcentrations {
  const stored = {} as AirQualityStoredConcentrations;
  for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) {
    stored[pollutant] = series[pollutant] ?? [];
  }
  return stored;
}

function toStoredSupport(
  support: Record<string, AirQualityStatus.Ok | AirQualityStatus.NotSupported>,
): AirQualityStoredSupport {
  const stored = {} as AirQualityStoredSupport;
  for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) {
    stored[pollutant] =
      support[pollutant] === AirQualityStatus.NotSupported ? 'not_supported' : 'ok';
  }
  return stored;
}
