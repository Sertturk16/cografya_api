import type { CachedRead, UpstreamCacheService } from '../upstream/cache/upstream-cache.service';
import type { OperationDeadline } from '../upstream/operation-deadline';
import type { UpstreamMetrics } from '../upstream/upstream-metrics';
import { compileRun, selectStepIndex, type CompiledRun } from './air-quality-compile';
import { isRunWithinMaxAge, runAgeSeconds } from './air-quality-run-age';
import { ALL_AIR_QUALITY_POLLUTANTS } from './air-quality.types';
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
 * The value handed to `UpstreamCacheService.read` as `deadlineMs`.
 *
 * A documented CODE CONSTANT, not an env variable (Atlas ruling, A2b plan Q1). Marine's
 * equivalent is an env knob because its refresh can genuinely leave the process and reach CMEMS;
 * this leg's refresh reads Postgres and nothing else, so an operator turning this dial would be
 * choosing between "a local query that takes 5 s" and "a local query that takes 3 s" — not a real
 * operational choice, and the repo's rule is to not build knobs for scenarios nobody expects.
 *
 * ## What it actually bounds today: NOTHING (review #84 CR-3)
 * `OperationDeadline` yields an `AbortSignal` that only an HTTP call site can honour, and this
 * leg's `refresh` closure — `() => this.compileFromStore()` — takes no deadline and makes no HTTP
 * call. No `statement_timeout` or TypeORM `maxQueryExecutionTime` is configured either, so a
 * stalled pool is bounded by nothing on this path. That is a REAL gap, it is shared with marine's
 * `EcmwfSeriesReader.readSeries`, and it is filed as a cross-leg follow-up rather than fixed here.
 * The earlier wording ("the request budget handed to …") described a protection that does not
 * exist, which is worse than the gap itself: it tells the next reader to stop looking.
 */
export const AIR_QUALITY_READ_DEADLINE_MS = 5_000;

/**
 * How often the EXIT-side run suppression may repeat its log line.
 *
 * The conditions it reports — a cached run past the age ceiling, a cached payload that does not
 * hold the written shape — are one standing fact per cache entry, but the checks run once per
 * request on a public route: exactly the fan-out `UpstreamMetrics.throttledEvent` exists for
 * (marine round-2 R2-SFH-A). One line a minute keeps the condition visible without letting the
 * reporting of an availability problem become one.
 */
const EXIT_SUPPRESSION_LOG_EVERY_MS = 60_000;

/**
 * How often the R2 normalisation warn may repeat, on either pass.
 *
 * Its OWN constant, deliberately equal in value to the exit-suppression window rather than
 * borrowing it (review #84 CR-9): the two throttles govern unrelated conditions — one an
 * availability signal on the request path, one a data-integrity signal — and sharing a name meant
 * retuning either cadence would silently retune the other.
 */
const R2_NORMALISATION_LOG_EVERY_MS = 60_000;

/** `Array.isArray` without letting `any[]` escape into the callers below. */
function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/** Every entry present and a string — `timesUtc`'s only structural requirement. */
function isStringArray(value: unknown): value is readonly string[] {
  return isArray(value) && value.every((entry) => typeof entry === 'string');
}

/** One cached province's shape, or the reason it cannot be published. */
function describeUnusableProvince(value: unknown, index: number): string | null {
  const label = `provinces[${String(index)}]`;
  if (typeof value !== 'object' || value === null) return `\`${label}\` is not an object`;
  const widened = value as {
    plateCode?: unknown;
    ingestedAtUtc?: unknown;
    gridLatitude?: unknown;
    gridLongitude?: unknown;
    distanceKm?: unknown;
    concentrations?: unknown;
    support?: unknown;
  };
  if (typeof widened.plateCode !== 'string' || widened.plateCode.length === 0) {
    return `\`${label}.plateCode\` is not a non-empty string`;
  }
  if (typeof widened.ingestedAtUtc !== 'string') {
    return `\`${label}.ingestedAtUtc\` is not a string`;
  }
  for (const [name, member] of [
    ['gridLatitude', widened.gridLatitude],
    ['gridLongitude', widened.gridLongitude],
    ['distanceKm', widened.distanceKm],
  ] as const) {
    if (typeof member !== 'number' || !Number.isFinite(member)) {
      return `\`${label}.${name}\` is not a finite number`;
    }
  }
  const concentrations = widened.concentrations;
  const support = widened.support;
  if (typeof concentrations !== 'object' || concentrations === null) {
    return `\`${label}.concentrations\` is not an object`;
  }
  if (typeof support !== 'object' || support === null) {
    return `\`${label}.support\` is not an object`;
  }
  const concentrationMembers = concentrations as Record<string, unknown>;
  const supportMembers = support as Record<string, unknown>;
  for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) {
    if (!isArray(concentrationMembers[pollutant])) {
      return `\`${label}.concentrations.${pollutant}\` is not an array`;
    }
    const verdict = supportMembers[pollutant];
    if (verdict !== 'ok' && verdict !== 'not_supported') {
      return `\`${label}.support.${pollutant}\` is not a support verdict`;
    }
  }
  return null;
}

/**
 * Why a CACHED payload cannot be published, or `null` when EVERY member of `CompiledRun` — and of
 * each province inside it — holds the type it claims.
 *
 * Deliberately the whole shape rather than only the members that could THROW: an omitted
 * `horizonEndUtc` does not crash anything, it publishes `undefined` into a contract field the
 * OpenAPI spec marks required, which the web codegen types as always-present. Both failures have
 * the same cause (a payload from another version) and the same cure, so they get one guard.
 *
 * ## Why the read path validates a value the TYPE already promises (review #84 CR-6)
 * `UpstreamCacheService` validates the cache ENVELOPE and says so in its own docblock: *"It does
 * NOT validate `payload` — that shape belongs to the caller who wrote it and is theirs to parse."*
 * `CompiledRun` is therefore a claim about a PAST write, not a property of the bytes coming back:
 * the key is unversioned (`airq:run:current`), the entry lives up to 12 h, and the module
 * advertises that it survives deploys. A release that changes a `CompiledRun` member leaves the
 * previous version's payload readable by new code — and the unguarded path then did
 * `new Date(runUtc).toISOString()` on it, which throws `RangeError` on an unparseable instant, on
 * the REQUEST path, outside the never-throw refresh closure, with no global exception filter
 * anywhere in `src/`. Median blast radius: up to one value TTL of 100 % 500s on both public
 * endpoints, all 81 provinces, with no self-heal. This is the #73 I9 / #82 I6 class, and #82's
 * resulting rule — *everything a consumer dereferences is validated* — is already a docblock
 * heading on this PR's own base (`marine/cmems/cmems-stac.cache.ts`).
 *
 * ## Whole-payload refusal, not a per-province skip
 * `compileRun` skips one bad ROW because its siblings were written by the same deploy and are
 * fine. Here the cause is a payload written by a DIFFERENT version, so a partial rescue would be
 * guesswork; refusing the whole entry degrades every province honestly to `unavailable`, answers
 * 200 with `no-store`, and heals when the entry expires and today's compile rewrites the key.
 */
function describeUnusableRun(value: CompiledRun): string | null {
  const widened: {
    runUtc?: unknown;
    datasetId?: unknown;
    analysisEndUtc?: unknown;
    stepHours?: unknown;
    timesUtc?: unknown;
    horizonEndUtc?: unknown;
    provinces?: unknown;
  } = value;
  if (typeof widened.runUtc !== 'string' || Number.isNaN(Date.parse(widened.runUtc))) {
    return '`runUtc` is not a parseable instant';
  }
  if (typeof widened.datasetId !== 'string') return '`datasetId` is not a string';
  if (typeof widened.stepHours !== 'number' || !Number.isFinite(widened.stepHours)) {
    return '`stepHours` is not a finite number';
  }
  if (typeof widened.horizonEndUtc !== 'string') return '`horizonEndUtc` is not a string';
  if (widened.analysisEndUtc !== null && typeof widened.analysisEndUtc !== 'string') {
    return '`analysisEndUtc` is neither a string nor null';
  }
  if (!isStringArray(widened.timesUtc) || widened.timesUtc.length === 0) {
    return '`timesUtc` is not a non-empty array of instants';
  }
  if (!isArray(widened.provinces)) return '`provinces` is not an array';
  for (const [index, province] of widened.provinces.entries()) {
    const reason = describeUnusableProvince(province, index);
    if (reason !== null) return reason;
  }
  return null;
}

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
   * The EXIT-side gate over whatever the cache handed back: first the SHAPE (review #84 CR-6),
   * then the run-age ceiling's exit half.
   *
   * Order matters. The shape check runs FIRST because the age check itself dereferences and
   * formats `runUtc`, which is the throw the guard exists to prevent.
   *
   * Both branches run on every read, including fresh hits — so the reporting is quieter than the
   * refresh half's: a throttled line, and no counter (the refresh half owns
   * `airq.run_age_ceiling` / `airq.run_unreadable`; a per-request counter here would report
   * traffic instead of "the condition fired"). The suppression itself applies to every single
   * read; only the repetition of the message is bounded.
   */
  private suppressStaleRun(read: CachedRead<CompiledRun>): CachedRead<CompiledRun> {
    if (read.value === null) return read;

    const unusable = describeUnusableRun(read.value);
    if (unusable !== null) {
      // ERROR, not warn: unlike an aged run this is never a normal operational state — it means a
      // payload we wrote does not hold the shape this code reads, and a human has to look.
      this.metrics.throttledEvent(
        'error',
        'airq.cached-run-unusable',
        EXIT_SUPPRESSION_LOG_EVERY_MS,
        'a CACHED air-quality run does not hold the written shape — publication suppressed',
        { provider: CAMS_ADS_PROVIDER, reason: unusable, origin: read.origin },
      );
      return this.withoutValue(read, 'schema_error', `the cached run is unusable: ${unusable}`);
    }

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
    return this.withoutValue(
      read,
      'transient',
      `cached run ${runUtc.toISOString()} now breaches the ${String(maxAge)} s run-age ` +
        'ceiling — publication suppressed (SPEC §9.4)',
    );
  }

  /**
   * A refused read: the value is gone, and so is every field that DESCRIBED that value.
   *
   * `cacheAgeSeconds` and `validAtUtc` belong to the entry this method just refused to publish
   * (review #84 I1 / CR-11). Spreading them through meant `X-Air-Quality-Cache-Age: 240` could
   * ride an all-`unavailable` body — an operator being told the age of data the response does not
   * contain. Marine ruled the same class out at review #82 I5 (`marine-read-reducers.ts`: only
   * `kind === 'ok'` reads count); this is the same rule applied at the source. The service gates
   * on `kind` as well, so the two halves are belt and braces on purpose.
   */
  private withoutValue(
    read: CachedRead<CompiledRun>,
    kind: 'transient' | 'schema_error',
    reason: string,
  ): CachedRead<CompiledRun> {
    return {
      ...read,
      value: null,
      kind,
      freshness: null,
      cacheAgeSeconds: null,
      validAtUtc: null,
      reason,
    };
  }

  /**
   * Report the POST-CACHE R2 substitutions of ONE request (review #84 I2).
   *
   * Lives on the reader rather than the read service because this class owns the R2 vocabulary:
   * the counter name, the provider label and the throttle window are stated once, and the two
   * passes cannot drift into reporting the same condition two different ways. Called once per
   * request with the whole tally, so 81 hub provinces produce one line, not 81.
   */
  reportPostCacheNormalisation(count: number, runUtc: string): void {
    if (count <= 0) return;
    this.metrics.increment('airq.concentration_normalised', CAMS_ADS_PROVIDER, count);
    this.metrics.throttledEvent(
      'warn',
      'airq.concentration-normalised-post-cache',
      R2_NORMALISATION_LOG_EVERY_MS,
      'CACHED concentrations were negative/non-finite/non-numeric and were null-classified on read',
      { provider: CAMS_ADS_PROVIDER, run: runUtc, values: count, pass: 'post-cache' },
    );
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
      // Counted, not only logged (review #84 SFH-4): every other degradation in this file carries
      // a counter, and the one class that means "the database is unreachable" was the one a
      // dashboard could not see.
      this.metrics.increment('airq.store_read_failed', CAMS_ADS_PROVIDER);
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
      // The all-rows-refused sibling of `ingest.corrupt_row_skipped` (review #84 SFH-4).
      this.metrics.increment('airq.run_unreadable', CAMS_ADS_PROVIDER);
      this.metrics.event('error', 'air-quality run holds no readable series row', {
        provider: CAMS_ADS_PROVIDER,
        run: run.runUtc.toISOString(),
        reason: outcome.reason,
      });
      return { kind: 'schema_error', reason: outcome.reason };
    }

    if (outcome.normalisedValues > 0) {
      // The R2 condition, COMPILE pass. Throttled because a systematically bad run would otherwise
      // log once per refresh with a five-figure count; the first occurrence is always logged. The
      // counter is not throttled — it runs at refresh cadence, so it stays a real magnitude.
      this.metrics.increment(
        'airq.concentration_normalised',
        CAMS_ADS_PROVIDER,
        outcome.normalisedValues,
      );
      this.metrics.throttledEvent(
        'warn',
        'airq.concentration-normalised-compile',
        R2_NORMALISATION_LOG_EVERY_MS,
        'STORED concentrations were negative/non-finite/non-numeric and were null-classified',
        {
          provider: CAMS_ADS_PROVIDER,
          run: run.runUtc.toISOString(),
          values: outcome.normalisedValues,
          pass: 'compile',
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
