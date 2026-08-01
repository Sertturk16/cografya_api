import { Logger } from '@nestjs/common';
import { OperationDeadline } from '../../upstream/operation-deadline';
import type {
  UpstreamHttpClient,
  UpstreamRequestOptions,
} from '../../upstream/upstream-http.client';
import type { UpstreamMetrics } from '../../upstream/upstream-metrics';
import type { UpstreamOutcome } from '../../upstream/upstream.types';
import type { MarinePoint } from '../entities/marine-point.entity';
import type { MarineUpstreamConfig } from '../marine-upstream.config';
import { MARINE_PROVIDER } from '../marine-upstream.config';
import type { MarineWarmupTarget } from '../marine-warmup.service';
import {
  buildEcmwfUrl,
  candidateCycles,
  cycleSteps,
  indexExpectation,
  orderStepsForIngest,
} from './ecmwf-cycle';
import {
  assertIndexRecordsMatchRequest,
  mergeByteRanges,
  parseEcmwfIndex,
  selectIndexRecords,
  toRangeHeader,
  type EcmwfByteRange,
  type EcmwfIndexRecord,
} from './ecmwf-index';
import { mapPointToGrid, type EcmwfGridMapping } from './ecmwf-grid';
import { ECMWF_STEP_HOURS, type EcmwfParam, type EcmwfStream } from './ecmwf.constants';
import { EcmwfContractError } from './ecmwf.errors';
import type { EcmwfIngestStorePort, RecordStepPoint } from './ecmwf-ingest.store';
import type { DecodedGribCells } from './grib/grib-decoder.adapter';
import type { GribDecodeJob } from './grib/grib-decode-protocol';
import { EcmwfDecodeCrashError, type IsolatedDecodeResult } from './grib/isolated-grib-decoder';

/** The isolation seam: the real implementation forks a child; unit tests decode in-process. */
export interface GribDecodePort {
  decode(job: GribDecodeJob): Promise<IsolatedDecodeResult>;
}

/** Cycles kept in Postgres — SPEC §9.1's retention rule. */
export const ECMWF_RETAINED_CYCLES = 3;

/**
 * What one step is assumed to cost before it is started. Measured ~2.5 s end to end; the
 * headroom covers a congested provider without letting a tour start work it cannot finish.
 */
const ESTIMATED_STEP_COST_MS = 15_000;

/** Accepted content types, by body kind (measured mirror variance — olcumler §M5 / S3). */
const INDEX_CONTENT_TYPES = ['application/json', 'application/octet-stream'] as const;
const GRIB_CONTENT_TYPES = ['application/grib', 'application/octet-stream'] as const;

/** Streams and the parameters each one carries (SPEC §4.1). */
const STREAM_PARAMS: readonly { stream: EcmwfStream; params: readonly EcmwfParam[] }[] = [
  { stream: 'oper', params: ['10u', '10v'] },
  { stream: 'wave', params: ['swh', 'mwd'] },
];

interface EcmwfIngestTargetDeps {
  readonly client: UpstreamHttpClient;
  readonly store: EcmwfIngestStorePort;
  readonly decoder: GribDecodePort;
  readonly config: MarineUpstreamConfig;
  /** Reads the reference points — injected so the target does not own a repository. */
  readonly loadPoints: () => Promise<MarinePoint[]>;
  readonly metrics: UpstreamMetrics;
  readonly now?: () => number;
}

/** A point with its precomputed grid mapping, in a fixed order shared with `indices`. */
interface MappedPoint {
  readonly point: MarinePoint;
  readonly mapping: EcmwfGridMapping;
}

/**
 * The scheduled ECMWF ingest — a `MarineWarmupTarget`, exactly the seam M2 opened for it.
 *
 * ## The one binding principle (SPEC §3)
 * A user request NEVER triggers an ECMWF call. This class is the ONLY thing that talks to the
 * provider, it runs only inside the warmup tour (cross-instance Redis lock included, for free),
 * and the e2e suite asserts the request path makes zero fetches.
 *
 * ## How a tour spends its slice
 * `refresh` derives an inner budget of `min(ECMWF_TOUR_BUDGET_MS, tour remaining)` so the M4
 * CMEMS targets behind it cannot starve, picks the newest published candidate cycle (404 = not
 * published yet = QUIET fall-back, board item NEW-1; every other failure stays loud), then
 * ingests missing steps nearest-to-now-first until a cap says stop:
 *
 * - step cap (`ECMWF_MAX_STEPS_PER_TOUR`) and an unaffordable next step: NORMAL stops, info;
 * - byte caps (`ECMWF_TOUR_MAX_BYTES` / `ECMWF_CYCLE_MAX_BYTES`): LOUD stops — a byte ceiling
 *   being hit means reality diverged from the measured ~3.2 MB/step and someone must look;
 * - a contract refusal or a decoder crash: LOUD stops (the crash is the panic class the child
 *   process contains — see `grib/grib-decode-protocol.ts`).
 *
 * Every step is atomic in Postgres (`recordStep`), so a stop at ANY point leaves a resumable,
 * honestly-partial cycle — the partial-cycle policy of the locked COLD-BEHAVIOR table.
 */
export class EcmwfIngestTarget implements MarineWarmupTarget {
  readonly label = 'ecmwf.cycle';

  private readonly logger = new Logger('EcmwfIngest');
  private readonly now: () => number;

  constructor(private readonly deps: EcmwfIngestTargetDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** Never throws — the warmup contract. Every failure is logged and ends the tour early. */
  async refresh(tourDeadline: OperationDeadline): Promise<void> {
    const startedMs = this.now();
    try {
      await this.runTourSlice(tourDeadline);
    } catch (error: unknown) {
      // Everything expected is handled inside; reaching here is OUR bug, and it must be loud
      // without killing the rest of the tour (the warmup service would log it too, but with
      // less context).
      this.deps.metrics.increment('ingest.bug', MARINE_PROVIDER.ecmwf);
      this.logger.error(
        `ingest slice aborted by an unexpected error after ${String(this.now() - startedMs)} ms — ` +
          `${error instanceof Error ? `${error.name}: ${error.message}` : 'unknown'}`,
      );
    }
  }

  private async runTourSlice(tourDeadline: OperationDeadline): Promise<void> {
    const { config } = this.deps;
    if (!config.ecmwf.enabled) return;

    const sliceBudgetMs = Math.min(config.ecmwf.tourBudgetMs, tourDeadline.remainingMs());
    if (sliceBudgetMs < ESTIMATED_STEP_COST_MS) {
      this.logger.log('tour slice too small for one step — yielding to the rest of the tour');
      return;
    }
    const deadline = new OperationDeadline(sliceBudgetMs, this.now);

    const mappedPoints = await this.loadMappedPoints();
    if (mappedPoints === null) return;
    const indices = mappedPoints.map((entry) => entry.mapping.index);

    const selection = await this.selectCycle(deadline, mappedPoints, indices);
    if (selection === null) {
      this.logger.warn(
        'no candidate cycle is published or ingestible right now — nothing to do this tour',
      );
      return;
    }
    if (selection.done) return;

    await this.deps.store.pruneCycles(ECMWF_RETAINED_CYCLES);
  }

  /**
   * Walk candidates newest-first; ingest into the first one that answers. Returns null when no
   * candidate is available, `{ done: true }` after work (or a clean no-op) happened.
   */
  private async selectCycle(
    deadline: OperationDeadline,
    mappedPoints: readonly MappedPoint[],
    indices: readonly number[],
  ): Promise<{ done: boolean } | null> {
    const { config, store } = this.deps;
    const nowDate = new Date(this.now());

    for (const cycle of candidateCycles(nowDate)) {
      const existing = await store.getCycle(cycle);
      const allSteps = cycleSteps(existing?.forecastHours ?? config.ecmwf.forecastHours);

      if (existing?.completedAt != null) {
        // The newest candidate we know is already fully ingested. Nothing newer answered
        // (candidates are walked newest-first), so the tour is a clean no-op.
        this.logger.debug(`cycle ${cycle.toISOString()} already complete — no work`);
        return { done: true };
      }

      const doneSet = new Set(existing?.stepsDone ?? []);
      const missing = allSteps.filter((step) => !doneSet.has(step));
      const ordered = orderStepsForIngest(missing, cycle, nowDate);

      const outcome = await this.ingestSteps({
        cycle,
        orderedSteps: ordered,
        deadline,
        mappedPoints,
        indices,
        cycleBytesAlready: existing?.bytesDownloaded ?? 0,
        isKnownCycle: existing !== null,
      });

      if (outcome === 'cycle_unpublished') {
        // Expected during the 7–9 h publication window: fall back one cycle, quietly.
        this.logger.debug(`cycle ${cycle.toISOString()} not published yet — falling back`);
        continue;
      }
      return { done: true };
    }

    return null;
  }

  private async ingestSteps(run: {
    cycle: Date;
    orderedSteps: readonly number[];
    deadline: OperationDeadline;
    mappedPoints: readonly MappedPoint[];
    indices: readonly number[];
    cycleBytesAlready: number;
    isKnownCycle: boolean;
  }): Promise<'worked' | 'cycle_unpublished' | 'stopped'> {
    const { config, metrics } = this.deps;
    const startedMs = this.now();

    let stepsThisTour = 0;
    let bytesThisTour = 0;
    let firstRequestOfCandidate = !run.isKnownCycle;

    for (const stepHour of run.orderedSteps) {
      if (stepsThisTour >= config.ecmwf.maxStepsPerTour) {
        this.logger.log(
          `step cap reached (${String(stepsThisTour)}/${String(config.ecmwf.maxStepsPerTour)}) — ` +
            `cycle resumes next tour`,
        );
        break;
      }
      if (!run.deadline.canAfford(ESTIMATED_STEP_COST_MS)) {
        this.logger.log('remaining slice cannot afford another step — cycle resumes next tour');
        break;
      }
      if (bytesThisTour >= config.ecmwf.tourMaxBytes) {
        // LOUD (board item / SPEC §9.2): a byte ceiling being hit means the measured per-step
        // cost model is wrong or the provider changed shape — cost protection, human required.
        metrics.event('error', 'ECMWF tour byte cap hit — stopping the tour LOUDLY', {
          provider: MARINE_PROVIDER.ecmwf,
          bytesThisTour,
          capBytes: config.ecmwf.tourMaxBytes,
        });
        break;
      }
      if (run.cycleBytesAlready + bytesThisTour >= config.ecmwf.cycleMaxBytes) {
        metrics.event('error', 'ECMWF cycle byte cap hit — stopping the tour LOUDLY', {
          provider: MARINE_PROVIDER.ecmwf,
          cycleBytes: run.cycleBytesAlready + bytesThisTour,
          capBytes: config.ecmwf.cycleMaxBytes,
        });
        break;
      }

      const step = await this.ingestOneStep({
        cycle: run.cycle,
        stepHour,
        deadline: run.deadline,
        mappedPoints: run.mappedPoints,
        indices: run.indices,
        allowUnpublished: firstRequestOfCandidate,
      });
      firstRequestOfCandidate = false;

      if (step.kind === 'cycle_unpublished') return 'cycle_unpublished';
      if (step.kind === 'stop') return stepsThisTour > 0 ? 'worked' : 'stopped';

      stepsThisTour += 1;
      bytesThisTour += step.bytes;
    }

    if (stepsThisTour > 0) {
      this.logger.log(
        `ingested ${String(stepsThisTour)} step(s) of cycle ${run.cycle.toISOString()} — ` +
          `${String(bytesThisTour)} B in ${String(this.now() - startedMs)} ms`,
      );
    }
    return 'worked';
  }

  private async ingestOneStep(step: {
    cycle: Date;
    stepHour: number;
    deadline: OperationDeadline;
    mappedPoints: readonly MappedPoint[];
    indices: readonly number[];
    allowUnpublished: boolean;
  }): Promise<{ kind: 'ok'; bytes: number } | { kind: 'stop' } | { kind: 'cycle_unpublished' }> {
    const { config, metrics } = this.deps;
    let bytes = 0;

    try {
      const decodedByParam = new Map<EcmwfParam, DecodedGribCells>();
      let packingTemplate: number | null = null;
      let decoderVersion = 'unknown';
      let firstRequest = step.allowUnpublished;

      for (const { stream, params } of STREAM_PARAMS) {
        // 1) The step's `.index` sidecar — text, JSON-LINES, ~2–40 KB.
        const indexOutcome = await this.fetchIndex({
          cycle: step.cycle,
          stream,
          stepHour: step.stepHour,
          deadline: step.deadline,
          missingMeansNoData: firstRequest,
        });
        firstRequest = false;

        if (indexOutcome.kind === 'no_data') return { kind: 'cycle_unpublished' };
        if (indexOutcome.kind !== 'ok') {
          this.logStop('index download failed', step, indexOutcome.kind, indexOutcome.reason);
          return { kind: 'stop' };
        }
        bytes += indexOutcome.value.bytes;

        // 2) Select OUR records and hold ONLY THOSE against the request (board item NEW-3:
        // the index lists ~50 unrelated parameters whose metadata is not our contract).
        const selected = selectIndexRecords(indexOutcome.value.records, params);
        assertIndexRecordsMatchRequest(
          selected,
          indexExpectation(step.cycle, stream, step.stepHour),
        );

        // 3) Byte-range plan (adjacency computed per step, never assumed) and download.
        for (const range of mergeByteRanges(selected)) {
          const rangeOutcome = await this.fetchRange({
            cycle: step.cycle,
            stream,
            stepHour: step.stepHour,
            range,
            deadline: step.deadline,
          });
          if (rangeOutcome.kind !== 'ok') {
            this.logStop('range download failed', step, rangeOutcome.kind, rangeOutcome.reason);
            return { kind: 'stop' };
          }
          bytes += rangeOutcome.value.byteLength;

          // 4) Decode ISOLATED (board item A1): a gribberish panic kills a child, not the API.
          const decoded = await this.deps.decoder.decode({
            bytes: rangeOutcome.value,
            members: range.members,
            referenceTimeUtcMs: step.cycle.getTime(),
            forecastHours: step.stepHour,
            indices: step.indices,
          });
          decoderVersion = decoded.decoderVersion;
          for (const field of decoded.fields) {
            decodedByParam.set(field.param, field);
            packingTemplate = field.dataRepresentationTemplate;
          }
        }
      }

      // 5) Assemble the 30 point samples; a missing parameter here is a plan/decode mismatch.
      const points = this.toRecordPoints(step.mappedPoints, decodedByParam);

      await this.deps.store.recordStep({
        cycleUtc: step.cycle,
        stepHour: step.stepHour,
        stepHours: ECMWF_STEP_HOURS,
        forecastHours: config.ecmwf.forecastHours,
        bytesDownloaded: bytes,
        packingType:
          packingTemplate === null ? 'unknown' : `grib2 template 5.${String(packingTemplate)}`,
        decoderVersion,
        points,
        now: new Date(this.now()),
      });

      return { kind: 'ok', bytes };
    } catch (error: unknown) {
      if (error instanceof EcmwfDecodeCrashError) {
        // THE panic class. The child died so the server did not — but the input that killed it
        // will kill it again, so this is alarm-level evidence for the ecCodes migration
        // trigger (DEC 2026-07-31d), not a transient to shrug at.
        metrics.increment('ingest.decode_crash', MARINE_PROVIDER.ecmwf);
        metrics.event('error', 'ECMWF decode child crashed — panic class contained by isolation', {
          provider: MARINE_PROVIDER.ecmwf,
          cycle: step.cycle.toISOString(),
          stepHour: step.stepHour,
          exitCode: error.exitCode,
          signal: error.signal,
          timedOut: error.timedOut,
        });
        return { kind: 'stop' };
      }
      if (error instanceof EcmwfContractError) {
        // Fail-closed refusal: the provider's bytes are not the product we pinned. Loud —
        // schema drift, not weather.
        metrics.increment('ingest.contract_refusal', MARINE_PROVIDER.ecmwf);
        metrics.event('error', 'ECMWF payload refused by a contract guard', {
          provider: MARINE_PROVIDER.ecmwf,
          cycle: step.cycle.toISOString(),
          stepHour: step.stepHour,
          reason: error.message,
        });
        return { kind: 'stop' };
      }
      throw error;
    }
  }

  private async fetchIndex(request: {
    cycle: Date;
    stream: EcmwfStream;
    stepHour: number;
    deadline: OperationDeadline;
    missingMeansNoData: boolean;
  }): Promise<UpstreamOutcome<{ records: EcmwfIndexRecord[]; bytes: number }>> {
    return await this.requestWithFailover((baseUrl) => ({
      providerId: MARINE_PROVIDER.ecmwf,
      label: `ecmwf.${request.stream}-index`,
      url: buildEcmwfUrl(baseUrl, request.cycle, request.stream, request.stepHour, 'index'),
      deadline: request.deadline,
      limits: this.deps.config.budgets[MARINE_PROVIDER.ecmwf],
      expectedContentType: INDEX_CONTENT_TYPES,
      missingMeansNoData: request.missingMeansNoData,
      parse: (body: string) => ({
        kind: 'ok' as const,
        value: { records: parseEcmwfIndex(body), bytes: Buffer.byteLength(body, 'utf8') },
      }),
    }));
  }

  private async fetchRange(request: {
    cycle: Date;
    stream: EcmwfStream;
    stepHour: number;
    range: EcmwfByteRange;
    deadline: OperationDeadline;
  }): Promise<UpstreamOutcome<Uint8Array>> {
    return await this.requestWithFailover((baseUrl) => ({
      providerId: MARINE_PROVIDER.ecmwf,
      label: `ecmwf.${request.stream}-range`,
      url: buildEcmwfUrl(baseUrl, request.cycle, request.stream, request.stepHour, 'grib2'),
      deadline: request.deadline,
      limits: this.deps.config.budgets[MARINE_PROVIDER.ecmwf],
      responseKind: 'bytes' as const,
      expectedContentType: GRIB_CONTENT_TYPES,
      headers: { Range: toRangeHeader(request.range) },
      // The plan knows the exact byte count; anything else is the wrong answer. This also
      // catches a server ignoring `Range` and answering 200 with the whole multi-MB file.
      maxResponseBytes: request.range.length,
      parse: (body: Uint8Array) => {
        if (body.byteLength !== request.range.length) {
          throw new EcmwfContractError(
            `range answered ${String(body.byteLength)} B where the .index promised ` +
              `${String(request.range.length)} B — refusing bytes whose attribution is unknowable.`,
          );
        }
        return { kind: 'ok' as const, value: body };
      },
    }));
  }

  /**
   * One request against the primary, retried ONCE against the mirror only for a transient
   * failure — the mirror holds the same bytes (verified §M5) but cannot fix our own bad
   * request, a schema surprise, or an exhausted budget, so those pass through untouched.
   */
  private async requestWithFailover<T>(
    build: (baseUrl: string) => UpstreamRequestOptions<T>,
  ): Promise<UpstreamOutcome<T>> {
    const { client, config } = this.deps;
    const primary = await client.request<T>(build(config.ecmwf.baseUrl));
    if (primary.kind !== 'transient' || config.ecmwf.failoverBaseUrl === null) {
      return primary;
    }
    this.logger.warn('primary ECMWF host failed transiently — retrying once against the mirror');
    return await client.request<T>(build(config.ecmwf.failoverBaseUrl));
  }

  private toRecordPoints(
    mappedPoints: readonly MappedPoint[],
    decoded: ReadonlyMap<EcmwfParam, DecodedGribCells>,
  ): RecordStepPoint[] {
    const u10 = requireField(decoded, '10u');
    const v10 = requireField(decoded, '10v');
    const swh = requireField(decoded, 'swh');
    const mwd = requireField(decoded, 'mwd');

    return mappedPoints.map((entry, index) => ({
      marinePointId: entry.point.id,
      gridLatitude: entry.mapping.gridLatitude,
      gridLongitude: entry.mapping.gridLongitude,
      distanceKm: entry.mapping.distanceKm,
      sample: {
        u10: u10.cells[index] ?? null,
        v10: v10.cells[index] ?? null,
        swh: swh.cells[index] ?? null,
        mwd: mwd.cells[index] ?? null,
      },
    }));
  }

  /** Load and grid-map the reference points; a threshold breach is OUR bug and refuses loudly. */
  private async loadMappedPoints(): Promise<readonly MappedPoint[] | null> {
    const points = await this.deps.loadPoints();
    if (points.length === 0) {
      // Same class as the endpoint's empty-table 500: the import never ran. An ingest that
      // silently does nothing forever would mask a broken deployment.
      this.logger.error(
        'marine_points is EMPTY — the M1 import never ran, so there is nothing to ingest for. ' +
          'Run `pnpm db:import:marine-points --phase=load`.',
      );
      return null;
    }

    return points.map((point) => {
      const mapping = mapPointToGrid(point.latitude, point.longitude);
      if (!mapping.withinThreshold) {
        throw new EcmwfContractError(
          `point ${point.slugTr} maps ${String(mapping.distanceKm)} km from its cell centre, ` +
            `over the ${String(mapping.thresholdKm)} km ceiling — OUR grid arithmetic is wrong, ` +
            `refusing to ingest plausible numbers from a possibly wrong cell.`,
        );
      }
      return { point, mapping };
    });
  }

  private logStop(
    what: string,
    step: { cycle: Date; stepHour: number },
    kind: string,
    reason: string,
  ): void {
    // The client already logged the outcome at its own level (loud for client/schema errors,
    // once-per-window for budget); this line adds the ingest context — which cycle and step
    // the tour abandoned. warn, not error: the LOUD half already happened at the source.
    this.logger.warn(
      `${what} (${kind}) at cycle ${step.cycle.toISOString()} step +${String(step.stepHour)}h — ` +
        `tour stops here, the cycle resumes next tour. ${reason}`,
    );
  }
}

function requireField(
  decoded: ReadonlyMap<EcmwfParam, DecodedGribCells>,
  param: EcmwfParam,
): DecodedGribCells {
  const field = decoded.get(param);
  if (field === undefined) {
    throw new EcmwfContractError(
      `decoded step is missing "${param}" although every range reported success — the range ` +
        `plan and the decode result have diverged.`,
    );
  }
  return field;
}
