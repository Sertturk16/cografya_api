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
 * The ECMWF read path (yeni-M3 SPEC §9.3) — the HALF of the leg a request may touch.
 *
 * ## `refresh` NEVER goes to the network — and never throws
 * The closure handed to `UpstreamCacheService.read` compiles a stored cycle out of Postgres —
 * that is the whole trick. Single-flight, negative TTLs, stale-while-revalidate and
 * `X-Marine-Cache-Age` all arrive from M2 unchanged, while the COLD-BEHAVIOR table's "a user
 * request never triggers an ECMWF call" holds by construction: there is no code path from here
 * to the HTTP client at all (asserted by e2e with a counting fetch). A corrupt stored row is
 * mapped to `schema_error` with a loud event rather than thrown, because the refresh closure's
 * contract is never-throw and a jsonb fault must degrade the widget, never 500 the page
 * (review #76 SFH-7).
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
   * budget when several keys share one request (M4); the refresh itself is Postgres-only and
   * cheap, so it matters little here — but the seam matches the M2 contract exactly.
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
   * ceiling since it was compiled is suppressed here, exactly as loudly as the refresh half —
   * stale-while-revalidate must not outlive the ceiling (SPEC §9.4, review #76 SFH-3).
   */
  private suppressStaleCycle(
    read: CachedRead<EcmwfPointSeriesRead>,
  ): CachedRead<EcmwfPointSeriesRead> {
    if (read.value === null) return read;
    const cycleUtc = new Date(read.value.series.modelRunAtUtc);
    const nowDate = new Date(this.now());
    const maxAge = this.config.ecmwf.cycleMaxAgeSeconds;
    if (isCycleWithinMaxAge(cycleUtc, nowDate, maxAge)) return read;

    this.metrics.increment('ingest.cycle_age_ceiling', MARINE_PROVIDER.ecmwf);
    this.metrics.event('warn', 'ECMWF cycle-age ceiling suppressed a CACHED series on exit', {
      provider: MARINE_PROVIDER.ecmwf,
      cycle: cycleUtc.toISOString(),
      ageSeconds: Math.round(cycleAgeSeconds(cycleUtc, nowDate)),
      maxAgeSeconds: maxAge,
      origin: read.origin,
    });
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
    const candidates = await this.store.recentSeriesForPoint(point.id, ECMWF_RETAINED_CYCLES);
    if (candidates.length === 0) {
      // `transient` (60 s negative TTL), NOT `no_data` (24 h): "the ingest has not landed a
      // cycle yet" is a state the very next warmup tour can fix, and a day-long suppression
      // would hide the recovery.
      return {
        kind: 'transient',
        reason: 'no ingested ECMWF cycle holds this point yet — the scheduled ingest fills this',
      };
    }

    const nowDate = new Date(this.now());
    const maxAge = this.config.ecmwf.cycleMaxAgeSeconds;
    const usable = candidates.filter((candidate) =>
      isCycleWithinMaxAge(candidate.cycle.cycleUtc, nowDate, maxAge),
    );
    const newest = candidates[0];
    if (usable.length === 0 && newest !== undefined) {
      // The third ceiling, breached by every retained cycle: values exist but may not be
      // published. LOUD — a stalled ingest is an operational event that must be seen before a
      // student sees stale wind.
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

    try {
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
        // A corrupt stored row (jsonb is schemaless — a short array, unordered steps). The
        // refresh contract is never-throw: surfaced as schema_error (alarm-level log + its own
        // negative TTL), never as a 500 on the M4 request path (review #76 SFH-7).
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
