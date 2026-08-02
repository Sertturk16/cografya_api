import type { CachedRead, UpstreamCacheService } from '../upstream/cache/upstream-cache.service';
import type { OperationDeadline } from '../upstream/operation-deadline';
import type { UpstreamMetrics } from '../upstream/upstream-metrics';
import { compileRun, selectStepIndex, type CompiledRun } from './air-quality-compile';
import { isRunWithinMaxAge, runAgeSeconds } from './air-quality-run-age';
import { CAMS_ADS_PROVIDER, type AirQualityUpstreamConfig } from './air-quality-upstream.config';
import type { AirQualityReadStorePort, AirQualityRunSeriesRow } from './air-quality-read.store';
import type { AirQualityRun } from './entities/air-quality-run.entity';

/**
 * The ONE cache key this leg reads (A2b plan §8.2, a deliberate deviation from SPEC §9.3's
 * per-province key, Atlas-approved).
 *
 * SPEC §9.3 proposed `airq:province:{plateCode}`. One key for the whole run is better here for a
 * reason the SPEC could not see before the store existed: the hub and the detail endpoint MUST
 * compile from the same run and the same product mix, or a visitor moving from `/hava` to
 * `/hava/ankara` can see two different bands for the same province. 81 independent keys expire
 * independently and make that inconsistency window a normal state, and they also mean either an
 * 81-key fan-out per hub request or a second, redundant "list" key. One run key is ~400 KB, one
 * `SET`, one deserialise per refresh.
 */
export const AIR_QUALITY_RUN_CACHE_KEY = 'airq:run:current';

/**
 * The request budget handed to `UpstreamCacheService.read`.
 *
 * A documented CODE CONSTANT, not an env variable (Atlas ruling, A2b plan Q1). Marine's
 * equivalent is an env knob because its refresh can genuinely leave the process and reach CMEMS;
 * this leg's refresh reads Postgres and nothing else, so an operator turning this dial would be
 * choosing between "a local query that takes 5 s" and "a local query that takes 3 s" — not a real
 * operational choice, and the repo's rule is to not build knobs for scenarios nobody expects.
 */
export const AIR_QUALITY_READ_DEADLINE_MS = 5_000;

/**
 * How often the EXIT-side run-age suppression may repeat its warn.
 *
 * The condition it reports is one standing fact per run, but the check runs once per request on a
 * public route — exactly the fan-out `UpstreamMetrics.throttledEvent` exists for (marine round-2
 * R2-SFH-A). One line a minute keeps a stall visible without letting the reporting of an
 * availability problem become one.
 */
const EXIT_SUPPRESSION_LOG_EVERY_MS = 60_000;

/**
 * The air-quality read path — the HALF of this leg a user request may touch.
 *
 * ## `refresh` NEVER goes to the network, and NEVER throws
 * The closure handed to `UpstreamCacheService.read` compiles a stored run out of Postgres. That is
 * the whole trick: single-flight, negative TTLs, stale-while-revalidate and the cache-age header
 * all arrive from M2 unchanged, while SPEC §10's "no endpoint ever waits for ADS" holds by
 * construction — there is no code path from here to an HTTP client at all (asserted in e2e with a
 * counting `fetch` spy). The never-throw contract covers the WHOLE closure body, store I/O
 * included: a Postgres blip maps to `transient` (loud event, short negative TTL); rows that do not
 * hold the written shape are SKIPPED so one corrupt province cannot darken the other eighty; and
 * only when no readable row is left does the read degrade to `schema_error`.
 *
 * ## `CamsContractError` is deliberately NOT used here (A2b decision D-A2b-3, Atlas-accepted)
 * Marine throws and catches its own contract error on this path. This leg does not: a bad row in
 * OUR store is not a record of the PROVIDER's contract, and raising `airq.contract_refusal` from a
 * read would corrupt the ingest's diagnosis stream — the counter that answers "is CAMS drifting?"
 * would start counting our own storage faults. The guard returns a STRING reason instead, and the
 * outcome is an ordinary `schema_error`.
 *
 * ## The THIRD ceiling lives here, and is applied on BOTH sides (SPEC §9.4)
 * `now − runUtc > AIR_QUALITY_RUN_MAX_AGE_SECONDS` suppresses publication loudly. Applying it only
 * inside `refresh` would leave stale-while-revalidate serving a value written BEFORE the breach
 * for up to `AIR_QUALITY_STALE_MAX_SECONDS` — the measured marine lesson (#76 SFH-3). The two
 * sides report differently on purpose: the refresh side OWNS the `airq.run_age_ceiling` counter
 * (it fires at refresh cadence, bounded by single-flight and the negative TTL), while the exit
 * side only logs, throttled, because it runs once per request.
 */
export class AirQualitySeriesReader {
  private readonly now: () => number;

  constructor(
    private readonly cache: UpstreamCacheService,
    private readonly store: AirQualityReadStorePort,
    private readonly config: AirQualityUpstreamConfig,
    private readonly metrics: UpstreamMetrics,
    now?: () => number,
  ) {
    this.now = now ?? Date.now;
  }

  /** Read the current publishable run through the shared cache. */
  async readRun(deadline?: OperationDeadline): Promise<CachedRead<CompiledRun>> {
    const read = await this.cache.read<CompiledRun>({
      key: AIR_QUALITY_RUN_CACHE_KEY,
      providerId: CAMS_ADS_PROVIDER,
      ttls: this.config.ttls,
      ceilings: this.config.ceilings,
      deadlineMs: AIR_QUALITY_READ_DEADLINE_MS,
      deadline,
      refresh: () => this.compileFromStore(),
    });
    return this.suppressStaleRun(read);
  }

  /**
   * The EXIT half of the third ceiling: a CACHED run that has aged past the ceiling since it was
   * compiled is suppressed here.
   *
   * Runs on every read, including fresh hits — so the reporting is quieter than the refresh
   * half's: throttled warn, and the counter is NOT incremented (the refresh half owns it). The
   * suppression itself still applies to every single read; only the repetition of the message is
   * bounded.
   */
  private suppressStaleRun(read: CachedRead<CompiledRun>): CachedRead<CompiledRun> {
    if (read.value === null) return read;
    const runUtc = new Date(read.value.runUtc);
    const nowDate = new Date(this.now());
    const maxAge = this.config.runMaxAgeSeconds;
    if (isRunWithinMaxAge(runUtc, nowDate, maxAge)) return read;

    this.metrics.throttledEvent(
      'warn',
      'airq.run-age-ceiling-exit',
      EXIT_SUPPRESSION_LOG_EVERY_MS,
      'air-quality run-age ceiling suppressed a CACHED run on exit',
      {
        provider: CAMS_ADS_PROVIDER,
        run: runUtc.toISOString(),
        ageSeconds: Math.round(runAgeSeconds(runUtc, nowDate)),
        maxAgeSeconds: maxAge,
        origin: read.origin,
      },
    );
    return {
      ...read,
      value: null,
      kind: 'transient',
      freshness: null,
      reason:
        `cached run ${runUtc.toISOString()} now breaches the ${String(maxAge)} s run-age ` +
        'ceiling — publication suppressed (SPEC §9.4)',
    };
  }

  /** The `refresh` closure body: Postgres → compiled run, or an honest non-ok outcome. */
  private async compileFromStore(): Promise<
    | { kind: 'ok'; value: CompiledRun; validAtMs: number }
    | { kind: 'transient'; reason: string }
    | { kind: 'schema_error'; reason: string }
  > {
    // Store I/O gets its OWN arm (the marine CR2R-1 lesson): the closure's contract is
    // never-throw, and a driver blip on the cold path would otherwise escape as a 500. Any throw
    // here is overwhelmingly the driver, so it maps to `transient` — a blip heals on the next
    // refresh — with a loud event. Classification of row CONTENT happens below, not here.
    let newestRun: AirQualityRun | null;
    let rows: AirQualityRunSeriesRow[];
    try {
      newestRun = await this.store.newestServiceableRun();
      rows = newestRun === null ? [] : await this.store.seriesForRun(newestRun.runUtc);
    } catch (error: unknown) {
      this.metrics.event('error', 'air-quality store read failed — degrading, never 500', {
        provider: CAMS_ADS_PROVIDER,
        reason: error instanceof Error ? `${error.name}: ${error.message}` : 'unknown',
      });
      return {
        kind: 'transient',
        reason: 'the air-quality store could not be read — retried on the next refresh',
      };
    }

    const run = newestRun;
    if (run === null) {
      // `transient` (short negative TTL), NOT `no_data` (which is a day): "the ingest has not
      // landed a run yet" is a state the very next tour can fix, and a day-long suppression would
      // hide the recovery.
      return {
        kind: 'transient',
        reason: 'no servable air-quality run is stored yet — the scheduled ingest fills this',
      };
    }

    const nowDate = new Date(this.now());
    const maxAge = this.config.runMaxAgeSeconds;
    if (!isRunWithinMaxAge(run.runUtc, nowDate, maxAge)) {
      // The REFRESH half of the third ceiling — it owns the counter. LOUD: a stalled ingest is an
      // operational event that must be seen before a student sees a four-day-old forecast.
      this.metrics.increment('airq.run_age_ceiling', CAMS_ADS_PROVIDER);
      this.metrics.event('warn', 'air-quality run-age ceiling suppressed publication', {
        provider: CAMS_ADS_PROVIDER,
        run: run.runUtc.toISOString(),
        ageSeconds: Math.round(runAgeSeconds(run.runUtc, nowDate)),
        maxAgeSeconds: maxAge,
      });
      return {
        kind: 'transient',
        reason:
          `newest servable run ${run.runUtc.toISOString()} is ` +
          `${String(Math.round(runAgeSeconds(run.runUtc, nowDate)))} s old, over the ` +
          `${String(maxAge)} s run-age ceiling — publication suppressed (SPEC §9.4)`,
      };
    }

    const outcome = compileRun({
      run: {
        runUtc: run.runUtc,
        forecastHours: run.forecastHours,
        analysisHours: run.analysisHours,
        datasetId: run.datasetId,
      },
      rows,
    });

    for (const skip of outcome.skipped) {
      // Never silent, and never fatal: `ingest.corrupt_row_skipped` is the existing leg-neutral
      // counter (the provider dimension is the label), and one bad province must not darken 80.
      this.metrics.increment('ingest.corrupt_row_skipped', CAMS_ADS_PROVIDER);
      this.metrics.event(
        'error',
        'air-quality stored series row is unreadable — province skipped',
        {
          provider: CAMS_ADS_PROVIDER,
          run: run.runUtc.toISOString(),
          plateCode: skip.plateCode,
          reason: skip.reason,
        },
      );
    }

    if (outcome.kind === 'schema_error') {
      this.metrics.event('error', 'air-quality run holds no readable series row', {
        provider: CAMS_ADS_PROVIDER,
        run: run.runUtc.toISOString(),
        reason: outcome.reason,
      });
      return { kind: 'schema_error', reason: outcome.reason };
    }

    if (outcome.normalisedValues > 0) {
      // The R2 condition. Throttled because a systematically bad run would otherwise log once per
      // refresh with a five-figure count; the first occurrence is always logged.
      this.metrics.throttledEvent(
        'warn',
        'airq.concentration-normalised',
        EXIT_SUPPRESSION_LOG_EVERY_MS,
        'stored concentrations were negative/non-finite and were null-classified on read',
        {
          provider: CAMS_ADS_PROVIDER,
          run: run.runUtc.toISOString(),
          values: outcome.normalisedValues,
        },
      );
    }

    // `validAtMs` is the step this run publishes AT COMPILE TIME — it is what M2's `validAt`
    // ceiling measures. The step actually SERVED is re-selected per request after the cache, so
    // the published instant never freezes for a TTL.
    const stepIndex = selectStepIndex(outcome.run.timesUtc, nowDate.getTime());
    const validAtIso = stepIndex === null ? undefined : outcome.run.timesUtc[stepIndex];
    if (validAtIso === undefined) {
      return { kind: 'schema_error', reason: 'the compiled run carries no publishable step' };
    }
    return { kind: 'ok', value: outcome.run, validAtMs: new Date(validAtIso).getTime() };
  }
}
