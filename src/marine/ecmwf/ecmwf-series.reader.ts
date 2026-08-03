import { Logger } from '@nestjs/common';
import type { OperationDeadline } from '../../upstream/operation-deadline';
import type { CachedRead, UpstreamCacheService } from '../../upstream/cache/upstream-cache.service';
import type { UpstreamMetrics } from '../../upstream/upstream-metrics';
import type { MarinePoint } from '../entities/marine-point.entity';
import type { MarineUpstreamConfig } from '../marine-upstream.config';
import { MARINE_PROVIDER } from '../marine-upstream.config';
import { cycleAgeSeconds, isCycleWithinMaxAge } from './ecmwf-cycle';
import {
  compileEcmwfSeries,
  selectPublishableCycle,
  type EcmwfCompiledSeries,
} from './ecmwf-series-compile';
import { assertParallel } from './ecmwf-series-merge';
import { ECMWF_RETAINED_CYCLES } from './ecmwf.constants';
import { EcmwfContractError } from './ecmwf.errors';
import type { EcmwfIngestStorePort, NewestPointSeries } from './ecmwf-ingest.store';

/** What one read hands the M4 endpoints: the compiled series plus its cell metadata. */
export interface EcmwfPointSeriesRead {
  readonly series: EcmwfCompiledSeries;
  readonly gridLatitude: number;
  readonly gridLongitude: number;
  readonly distanceKm: number;
}

/**
 * How often the EXIT-side suppression may repeat its warn (round-2 R2-SFH-A). The condition it
 * reports is a single standing fact per cycle, but the check runs once per request on a public
 * route — the exact fan-out `UpstreamMetrics.throttledEvent` exists for. One line a minute keeps
 * the stall visible without letting the reporting become its own availability problem.
 */
const EXIT_SUPPRESSION_LOG_EVERY_MS = 60_000;

/**
 * Why a stored candidate row cannot be read — or `null` when it holds the written shape.
 *
 * The rows arrive from a schemaless jsonb column plus a relation join, so their runtime shape is
 * an assumption, not a type. The checks are written against a widened view on purpose — the
 * entity types CLAIM these fields exist, which is exactly what cannot be trusted here.
 *
 * EVERY member the compile path dereferences is covered (round-3 R3-CR-1: the original guard
 * checked only `cycleUtc` and `steps`, so a `values` missing one of the four sample arrays
 * passed it, died as a TypeError inside `assertParallel`, rethrew by design and 500'd the cold
 * path with no negative-TTL suppression): the cycle relation, the five `values` arrays, the four
 * `support` verdicts, and the parallel/ascending stored invariant itself.
 */
function describeUnreadableCandidate(candidate: NewestPointSeries): string | null {
  const widened: {
    cycle?: { cycleUtc?: unknown } | null;
    series?: { values?: unknown; support?: unknown } | null;
  } = candidate;
  if (!(widened.cycle?.cycleUtc instanceof Date)) {
    return 'the cycle relation or its cycleUtc is missing';
  }
  const values = widened.series?.values;
  if (typeof values !== 'object' || values === null) return '`values` is not an object';
  const valueMembers = values as Record<string, unknown>;
  for (const member of ['steps', 'u10', 'v10', 'swh', 'mwd'] as const) {
    if (!Array.isArray(valueMembers[member])) return `\`values.${member}\` is not an array`;
  }
  const support = widened.series?.support;
  if (typeof support !== 'object' || support === null) return '`support` is not an object';
  const supportMembers = support as Record<string, unknown>;
  for (const member of ['u10', 'v10', 'swh', 'mwd'] as const) {
    if (typeof supportMembers[member] !== 'string') return `\`support.${member}\` is not a verdict`;
  }
  try {
    assertParallel(candidate.series.values);
  } catch (error: unknown) {
    if (error instanceof EcmwfContractError) return error.message;
    throw error; // a non-contract throw out of a pure invariant check is OUR bug.
  }
  return null;
}

/** The cycle label for a skip event — readable even when the cycle relation itself is broken. */
function cycleLabelOf(candidate: NewestPointSeries): string {
  const widened: { cycle?: { cycleUtc?: unknown } | null } = candidate;
  const cycleUtc = widened.cycle?.cycleUtc;
  return cycleUtc instanceof Date ? cycleUtc.toISOString() : 'unknown';
}

/**
 * The ECMWF read path (yeni-M3 SPEC §9.3) — the HALF of the leg a request may touch.
 *
 * ## `refresh` NEVER goes to the network — and never throws
 * The closure handed to `UpstreamCacheService.read` compiles a stored cycle out of Postgres —
 * that is the whole trick. Single-flight, negative TTLs, stale-while-revalidate and
 * `X-Marine-Cache-Age` all arrive from M2 unchanged, while the COLD-BEHAVIOR table's "a user
 * request never triggers an ECMWF call" holds by construction: there is no code path from here
 * to the HTTP client at all (asserted by e2e with a counting fetch). The never-throw contract
 * covers the WHOLE closure body, store I/O included (review #76 SFH-7 + round-2 CR2R-1):
 * a Postgres blip maps to `transient` (loud event, 60 s negative TTL); an unreadable stored row
 * is SKIPPED with an alarm-level event and counter so a corrupt retained row cannot darken a
 * point whose other cycles are fine (round-3 R3-SFH-7), degrading to `schema_error` only when
 * EVERY retained row is unreadable; and only a genuine bug rethrows — a cold-path read must
 * degrade the widget, never 500 the page.
 *
 * ## Which cycle serves the read
 * The newest retained cycles for the point compete under the cycle-precedence policy
 * (`selectPublishableCycle`, review #76 CR-1): the longest published run wins, newest breaks
 * ties. A newly-publishing cycle therefore cannot collapse the served horizon while a complete
 * cycle is still retained and within the age ceiling.
 *
 * ## The THIRD staleness ceiling lives here (SPEC §9.4) — and is applied on BOTH sides
 * `now − cycleUtc > ECMWF_CYCLE_MAX_AGE_SECONDS` suppresses publication LOUDLY. Neither M2
 * ceiling can see this failure: a two-day-old cycle still yields a step whose valid time is
 * ≈ now, and `fetchedAtUtc` here is the compile moment, which is always fresh. The check runs
 * inside the refresh closure AND on the value coming OUT of the cache: a suppression outcome is
 * `transient`, and M2's stale-while-revalidate would otherwise keep serving the pre-breach
 * cached value for up to `ECMWF_STALE_MAX_SECONDS` — the exact stall the ceiling exists to
 * expose (review #76 SFH-3). The check is a pure function in `ecmwf-cycle.ts` — `src/upstream`
 * is not generalised (dispatch-carries rule b).
 *
 * The two sides deliberately report DIFFERENTLY (round-2 R2-SFH-A): the exit side runs once per
 * public-route request, so it logs through a throttle and does NOT touch the
 * `ingest.cycle_age_ceiling` counter — the counter belongs to the refresh side alone, which
 * single-flight + the negative TTL bound to refresh cadence. During a genuine stall the refresh
 * side fires within one cache TTL of the breach, so no signal is lost; the counter stays "the
 * ceiling fired", never a traffic-proportional number.
 *
 * ## `fetchedAtUtc` semantics, stated honestly
 * On this path it means "when this series was COMPILED from the store", not "when the bytes
 * left ECMWF". The true provenance moment is `modelRunAtUtc` (the cycle), which is published on
 * the value and is what the ceiling above governs.
 */
export class EcmwfSeriesReader {
  private readonly logger = new Logger('EcmwfSeriesReader');
  private readonly now: () => number;

  constructor(
    private readonly cache: UpstreamCacheService,
    private readonly store: EcmwfIngestStorePort,
    private readonly config: MarineUpstreamConfig,
    private readonly metrics: UpstreamMetrics,
    now?: () => number,
  ) {
    this.now = now ?? Date.now;
  }

  /**
   * Read one point's series through the shared cache. `deadline` is the caller's request
   * budget when several keys share one request (M4); the refresh itself is Postgres-only, so the
   * `AbortSignal` it carries has no call site to honour it here — the seam matches the M2
   * contract exactly, and the budget becomes real if this refresh ever grows an outbound call.
   *
   * What bounds a stalled query on this path is one level down (review #84 CR-3, the cross-leg
   * half A2b's `AirQualitySeriesReader` shares): `DATABASE_STATEMENT_TIMEOUT_MS` in
   * `src/database/data-source-options.ts` sets a pool-wide `statement_timeout`, so Postgres
   * cancels an over-running statement and returns its connection to the pool rather than letting
   * it be held until the pool drains. That promise is *"no query hangs forever"*, not *"this read
   * finishes inside the marine request deadline"* — the ceiling sits far above any read budget
   * because the same pool carries the ECMWF ingest writes.
   */
  async readSeries(
    point: Pick<MarinePoint, 'id' | 'slugTr'>,
    deadline?: OperationDeadline,
  ): Promise<CachedRead<EcmwfPointSeriesRead>> {
    const read = await this.cache.read<EcmwfPointSeriesRead>({
      key: `marine:ecmwf:series:${point.slugTr}`,
      providerId: MARINE_PROVIDER.ecmwf,
      ttls: this.config.ttls,
      ceilings: {
        // The ECMWF store refreshes 6-hourly by nature; the shared marine stale ceiling is
        // tuned for hourly point APIs. Its own knob (SPEC §12), same mechanism.
        staleMaxSeconds: this.config.ecmwf.staleMaxSeconds,
        validAtMaxAgeSeconds: this.config.ceilings.validAtMaxAgeSeconds,
      },
      deadlineMs: this.config.requestDeadlineMs,
      deadline,
      refresh: () => Promise.resolve(this.compileFromStore(point)),
    });
    return this.suppressStaleCycle(read);
  }

  /**
   * The exit half of the third ceiling: a CACHED series whose model cycle has aged past the
   * ceiling since it was compiled is suppressed here — stale-while-revalidate must not outlive
   * the ceiling (SPEC §9.4, review #76 SFH-3).
   *
   * This runs on EVERY read, including fresh cache hits, so its reporting is deliberately
   * quieter than the refresh half's (round-2 R2-SFH-A): the warn is throttled (the standing
   * condition is one fact, not one fact per request) and the `ingest.cycle_age_ceiling` counter
   * is NOT incremented here — the refresh half owns it, at refresh cadence. The suppression
   * itself is still applied to every read; only the repetition of the report is bounded.
   */
  private suppressStaleCycle(
    read: CachedRead<EcmwfPointSeriesRead>,
  ): CachedRead<EcmwfPointSeriesRead> {
    if (read.value === null) return read;
    const cycleUtc = new Date(read.value.series.modelRunAtUtc);
    const nowDate = new Date(this.now());
    const maxAge = this.config.ecmwf.cycleMaxAgeSeconds;
    if (isCycleWithinMaxAge(cycleUtc, nowDate, maxAge)) return read;

    this.metrics.throttledEvent(
      'warn',
      'ecmwf.cycle-age-ceiling-exit',
      EXIT_SUPPRESSION_LOG_EVERY_MS,
      'ECMWF cycle-age ceiling suppressed a CACHED series on exit',
      {
        provider: MARINE_PROVIDER.ecmwf,
        cycle: cycleUtc.toISOString(),
        ageSeconds: Math.round(cycleAgeSeconds(cycleUtc, nowDate)),
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
        `cached series compiled from cycle ${cycleUtc.toISOString()} now breaches the ` +
        `${String(maxAge)} s cycle-age ceiling — publication suppressed (SPEC §9.4)`,
    };
  }

  /** The `refresh` closure body: Postgres → compiled series, or an honest non-ok outcome. */
  private async compileFromStore(
    point: Pick<MarinePoint, 'id' | 'slugTr'>,
  ): Promise<
    | { kind: 'ok'; value: EcmwfPointSeriesRead; validAtMs: number }
    | { kind: 'transient'; reason: string }
    | { kind: 'schema_error'; reason: string }
  > {
    // The store I/O has its OWN arm (round-2 CR2R-1): the closure's contract is never-throw,
    // and this read used to sit above the try — a Postgres blip on the cold path escaped the
    // closure and became a 500. Any throw here is overwhelmingly the driver (the method is one
    // trivial find), so it maps to `transient` (60 s negative TTL — a blip heals on the next
    // refresh) with a loud event; classification of ROW CONTENT happens below, not here.
    let candidates: NewestPointSeries[];
    try {
      candidates = await this.store.recentSeriesForPoint(point.id, ECMWF_RETAINED_CYCLES);
    } catch (error: unknown) {
      this.metrics.event('error', 'ECMWF store read failed — degrading to transient, never 500', {
        provider: MARINE_PROVIDER.ecmwf,
        point: point.slugTr,
        reason: error instanceof Error ? `${error.name}: ${error.message}` : 'unknown',
      });
      return {
        kind: 'transient',
        reason: 'the ECMWF store could not be read — retried on the next refresh',
      };
    }

    try {
      if (candidates.length === 0) {
        // `transient` (60 s negative TTL), NOT `no_data` (24 h): "the ingest has not landed a
        // cycle yet" is a state the very next warmup tour can fix, and a day-long suppression
        // would hide the recovery.
        return {
          kind: 'transient',
          reason: 'no ingested ECMWF cycle holds this point yet — the scheduled ingest fills this',
        };
      }

      // jsonb is schemaless: a row that is not the written shape would otherwise die as a
      // TypeError on the raw accesses below — indistinguishable from a bug, escaping the
      // never-throw closure as a cold-path 500 (CR2R-1, round-3 R3-CR-1). Unreadable rows are
      // SKIPPED loudly instead of failing the read: one corrupt retained row must not darken a
      // point whose other cycles are fine (round-3 R3-SFH-7). Only when NO readable row remains
      // does the read degrade to `schema_error` — and any TypeError that still escapes really
      // is a bug and really does rethrow.
      const readable = candidates.filter((candidate) => {
        const refusal = describeUnreadableCandidate(candidate);
        if (refusal === null) return true;
        this.metrics.increment('ingest.corrupt_row_skipped', MARINE_PROVIDER.ecmwf);
        this.metrics.event('error', 'ECMWF stored series row is unreadable — candidate skipped', {
          provider: MARINE_PROVIDER.ecmwf,
          point: point.slugTr,
          cycle: cycleLabelOf(candidate),
          reason: refusal,
        });
        return false;
      });
      if (readable.length === 0) {
        throw new EcmwfContractError(
          `every retained ECMWF series row for ${point.slugTr} is unreadable — jsonb is ` +
            `schemaless and no stored row holds the written shape.`,
        );
      }

      const nowDate = new Date(this.now());
      const maxAge = this.config.ecmwf.cycleMaxAgeSeconds;
      const usable = readable.filter((candidate) =>
        isCycleWithinMaxAge(candidate.cycle.cycleUtc, nowDate, maxAge),
      );
      const newest = readable[0];
      if (usable.length === 0 && newest !== undefined) {
        // The third ceiling, breached by every retained cycle: values exist but may not be
        // published. LOUD — a stalled ingest is an operational event that must be seen before a
        // student sees stale wind. This is the refresh half; it OWNS the counter (R2-SFH-A).
        this.metrics.increment('ingest.cycle_age_ceiling', MARINE_PROVIDER.ecmwf);
        this.metrics.event('warn', 'ECMWF cycle-age ceiling suppressed publication', {
          provider: MARINE_PROVIDER.ecmwf,
          cycle: newest.cycle.cycleUtc.toISOString(),
          ageSeconds: Math.round(cycleAgeSeconds(newest.cycle.cycleUtc, nowDate)),
          maxAgeSeconds: maxAge,
        });
        return {
          kind: 'transient',
          reason:
            `newest ingested cycle ${newest.cycle.cycleUtc.toISOString()} is ` +
            `${String(Math.round(cycleAgeSeconds(newest.cycle.cycleUtc, nowDate)))} s old, over ` +
            `the ${String(maxAge)} s cycle-age ceiling — publication suppressed (SPEC §9.4)`,
        };
      }

      const winnerIndex = selectPublishableCycle(
        usable.map((candidate) => ({
          cycleUtc: candidate.cycle.cycleUtc,
          steps: candidate.series.values.steps,
        })),
        nowDate,
      );
      const winner = winnerIndex === null ? undefined : usable[winnerIndex];
      if (winner === undefined) {
        // Rows exist but none holds a publishable step — the same "not yet" state as no rows.
        return {
          kind: 'transient',
          reason: 'no retained ECMWF cycle holds a publishable step for this point yet',
        };
      }
      return this.compileWinner(point, winner, nowDate);
    } catch (error: unknown) {
      if (error instanceof EcmwfContractError) {
        // Every retained row unreadable (the throw above), or a compile-time refusal on a row
        // the shape guard admitted. The refresh contract is never-throw: surfaced as
        // schema_error (alarm-level log + its own negative TTL), never as a 500 on the M4
        // request path (review #76 SFH-7, round-2 CR2R-1, round-3 R3-CR-1).
        this.metrics.event('error', 'ECMWF stored series refused by a contract guard on read', {
          provider: MARINE_PROVIDER.ecmwf,
          point: point.slugTr,
          reason: error.message,
        });
        return { kind: 'schema_error', reason: error.message };
      }
      throw error; // a real bug must stay a bug — rethrow, never relabel.
    }
  }

  private compileWinner(
    point: Pick<MarinePoint, 'id' | 'slugTr'>,
    winner: NewestPointSeries,
    nowDate: Date,
  ): { kind: 'ok'; value: EcmwfPointSeriesRead; validAtMs: number } {
    const { series, withheldSteps } = compileEcmwfSeries({
      stored: winner.series.values,
      support: winner.series.support,
      cycleUtc: winner.cycle.cycleUtc,
      now: nowDate,
    });
    if (withheldSteps > 0) {
      // Never silent: a hole means the ascending fill was interrupted; the withheld steps exist
      // in the store and re-attach once the missing step lands.
      this.logger.warn(
        `series for ${point.slugTr} has a step hole — serving the run nearest to now, ` +
          `${String(withheldSteps)} step(s) withheld until the hole fills`,
      );
    }

    return {
      kind: 'ok',
      value: {
        series,
        gridLatitude: winner.series.gridLatitude,
        gridLongitude: winner.series.gridLongitude,
        distanceKm: winner.series.distanceKm,
      },
      validAtMs: series.validAtMs,
    };
  }
}
