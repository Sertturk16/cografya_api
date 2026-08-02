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
  parseJobList,
  parseJobStatus,
  parseResultAsset,
  type AdsRequestBody,
} from './ads-jobs';
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
    if (newest === null && nowDate.getUTCHours() < config.ads.submitAfterUtcHour) {
      // Cold start before the submit hour: the run day we would create is yesterday's, whose
      // results may already have expired on the provider's side. Wait for the hour.
      this.logger.debug('cold start before the submit hour — nothing to ingest yet');
      return null;
    }

    if (newest !== null && !isRunTerminal(newest)) {
      this.deps.metrics.increment('airq.run_abandoned', CAMS_ADS_PROVIDER);
      this.deps.metrics.event(
        'warn',
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
      if (outcome.kind === 'client_error' && isLicenceRefusal(403, outcome.reason)) {
        await this.terminate(run, index, job, 'licence not accepted for this dataset', 'refused');
        return;
      }
      // The job stays in `submitting` on purpose. The next tour reconciles instead of
      // submitting again — the failure may well have happened AFTER the provider accepted.
      this.deps.metrics.event('warn', 'air-quality submit failed — reconciling on the next tour', {
        provider: CAMS_ADS_PROVIDER,
        runUtc: run.runUtc.toISOString(),
        kind: job.kind,
        outcome: outcome.kind,
      });
      await this.writeJob(run, index, {
        ...job,
        state: 'submitting',
        submittedAt,
        attempts: job.attempts + 1,
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
      this.logger.warn(
        `${job.kind}: no upstream job matches our submit window — the submit never arrived; ` +
          'returning to costed for ONE clean re-submit.',
      );
      await this.writeJob(run, index, {
        ...job,
        state: 'costed',
        attempts: job.attempts + 1,
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
      await this.writeJob(run, index, {
        ...job,
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
    if (job.jobId === null) return;
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
      await this.terminate(
        run,
        index,
        job,
        `the provider ended the job as "${status}"`,
        'rejected',
      );
      return;
    }
    if (status === 'failed') {
      // The provider's transient class: retried against the per-JOB attempt budget.
      await this.recordTransient(run, index, { ...job, ...stamps }, `provider job status "failed"`);
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
    if (job.jobId === null) return;
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

    const expectedSteps = expectedStepCount(config.ads, job.kind);
    if (decoded.timeHours.length !== expectedSteps) {
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
      const mismatched = rows.filter((row) => {
        const cell = forecastCells.get(row.provinceId);
        return (
          cell === undefined ||
          cell.latitude !== row.gridLatitude ||
          cell.longitude !== row.gridLongitude
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
    await store.recordProduct({
      runUtc: run.runUtc,
      kind: job.kind,
      hours: job.kind === 'forecast' ? config.ads.forecastHours : decoded.timeHours.length,
      provinces: rows,
      bytesDownloaded: bytes,
      fileFormat: `zip(${String(decoded.zipMethod)})+${decoded.innerFormat}`,
      decoderVersion: decoded.decoderVersion,
      adsRequests: jobs,
      state: rollupRunState(jobs, this.deps.config.ads.maxAttemptsPerJob),
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
    if (job === undefined || job.jobId === null) return;

    const outcome = await this.deps.client.request({
      ...this.baseRequest(deadline, `${job.kind}.delete`),
      url: jobUrl(this.deps.config.ads, job.jobId),
      method: 'DELETE',
      // Measured: HTTP 200 + application/json + `{"status":"dismissed"}` — NOT a bare 204. The
      // ordinary text branch and the ordinary content-type guard both apply unchanged.
      parse: (body: string) => ({ kind: 'ok' as const, value: parseJobStatus(body, 'delete') }),
    });
    if (outcome.kind !== 'ok') {
      // Cleanup is politeness, not correctness: the result expires on its own in ~2 days. The
      // stamp is written anyway so a failing DELETE cannot spin every tour forever.
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
      state: rollupRunState(jobs, this.deps.config.ads.maxAttemptsPerJob),
      lastError: job.lastError === undefined ? undefined : job.lastError,
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
    const exhausted = attempts >= this.deps.config.ads.maxAttemptsPerJob;
    if (exhausted) {
      this.deps.metrics.increment('airq.attempts_exhausted', CAMS_ADS_PROVIDER);
      this.deps.metrics.event('error', 'air-quality job gave up after its attempt budget', {
        provider: CAMS_ADS_PROVIDER,
        runUtc: run.runUtc.toISOString(),
        kind: job.kind,
        attempts,
        reason: this.redact(reason),
      });
    }
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
      state: rollupRunState(jobs, this.deps.config.ads.maxAttemptsPerJob),
      lastError: this.redact(reason),
      lastErrorClass: 'upstream',
    });
  }

  private async terminate(
    run: AirQualityRun,
    index: number,
    job: AdsJobRecord,
    reason: string,
    state: Extract<AdsJobState, 'refused' | 'rejected'>,
    errorClass: AirQualityErrorClass = 'refused',
  ): Promise<void> {
    const jobs = replaceJob(run.adsRequests, index, {
      ...job,
      state,
      lastError: this.redact(reason),
    });
    run.adsRequests = jobs;
    const runState = rollupRunState(jobs, this.deps.config.ads.maxAttemptsPerJob);
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
}

// ─── dependencies ────────────────────────────────────────────────────────────

/** The options every ADS call shares — provider id, budget, the key header and the redactor. */
interface AdsRequestBase {
  readonly providerId: string;
  readonly label: string;
  readonly deadline: OperationDeadline;
  readonly limits: ProviderBudgetLimits;
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

/**
 * Which job this tour advances, and how.
 *
 * The FORECAST outranks everything, always: it is the page's "now". Cleanup debt comes last —
 * it is politeness, and it must never delay data.
 */
export function selectNextJob(
  run: { adsRequests: readonly AdsJobRecord[] },
  maxAttemptsPerJob: number,
): { index: number; action: 'progress' | 'cleanup' } | null {
  const progressable = (job: AdsJobRecord): boolean =>
    PROGRESSABLE_STATES.includes(job.state) && job.attempts < maxAttemptsPerJob;

  for (const kind of ['forecast', 'analysis'] as const) {
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
  const terminalFailure = (job: AdsJobRecord): boolean =>
    job.state === 'refused' ||
    job.state === 'rejected' ||
    job.state === 'failed' ||
    job.attempts >= maxAttemptsPerJob;

  const forecast = jobs.find((job) => job.kind === 'forecast');
  const analysis = jobs.find((job) => job.kind === 'analysis');

  if (forecast === undefined || terminalFailure(forecast)) return 'abandoned';
  if (forecast.state !== 'stored') return 'pending';
  if (analysis === undefined) return 'complete';
  if (analysis.state === 'stored') return 'complete';
  if (terminalFailure(analysis)) return 'degraded';
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
