import { Logger } from '@nestjs/common';
import type { OperationDeadline } from '../../upstream/operation-deadline';
import type { CachedRead, UpstreamCacheService } from '../../upstream/cache/upstream-cache.service';
import type { UpstreamMetrics } from '../../upstream/upstream-metrics';
import type { MarinePoint } from '../entities/marine-point.entity';
import type { MarineUpstreamConfig } from '../marine-upstream.config';
import { MARINE_PROVIDER } from '../marine-upstream.config';
import { cycleAgeSeconds, isCycleWithinMaxAge } from './ecmwf-cycle';
import { compileEcmwfSeries, type EcmwfCompiledSeries } from './ecmwf-series-compile';
import type { EcmwfIngestStorePort } from './ecmwf-ingest.store';

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
 * ## `refresh` NEVER goes to the network
 * The closure handed to `UpstreamCacheService.read` compiles the newest stored cycle out of
 * Postgres — that is the whole trick. Single-flight, negative TTLs, stale-while-revalidate and
 * `X-Marine-Cache-Age` all arrive from M2 unchanged, while the COLD-BEHAVIOR table's "a user
 * request never triggers an ECMWF call" holds by construction: there is no code path from here
 * to the HTTP client at all (asserted by e2e with a counting fetch).
 *
 * ## The THIRD staleness ceiling lives here (SPEC §9.4)
 * `now − cycleUtc > ECMWF_CYCLE_MAX_AGE_SECONDS` suppresses publication LOUDLY. Neither M2
 * ceiling can see this failure: a two-day-old cycle still yields a step whose valid time is
 * ≈ now, and `fetchedAtUtc` here is the compile moment, which is always fresh. The check is a
 * pure function in `ecmwf-cycle.ts`, applied per read — `src/upstream` is not generalised
 * (dispatch-carries rule b).
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
    return await this.cache.read<EcmwfPointSeriesRead>({
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
  }

  /** The `refresh` closure body: Postgres → compiled series, or an honest non-ok outcome. */
  private async compileFromStore(
    point: Pick<MarinePoint, 'id' | 'slugTr'>,
  ): Promise<
    | { kind: 'ok'; value: EcmwfPointSeriesRead; validAtMs: number }
    | { kind: 'transient'; reason: string }
  > {
    const newest = await this.store.newestSeriesForPoint(point.id);
    if (newest === null) {
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
    if (!isCycleWithinMaxAge(newest.cycle.cycleUtc, nowDate, maxAge)) {
      // The third ceiling, breached: values exist but may not be published. LOUD — a stalled
      // ingest is an operational event that must be seen before a student sees stale wind.
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

    const { series, droppedStepsAfterHole } = compileEcmwfSeries({
      stored: newest.series.values,
      support: newest.series.support,
      cycleUtc: newest.cycle.cycleUtc,
      now: nowDate,
    });
    if (droppedStepsAfterHole > 0) {
      // Never silent: a hole means the ascending fill was interrupted; the tail exists in the
      // store and will re-attach once the missing step lands.
      this.logger.warn(
        `series for ${point.slugTr} has a step hole — serving the contiguous prefix, ` +
          `${String(droppedStepsAfterHole)} later step(s) withheld until the hole fills`,
      );
    }

    return {
      kind: 'ok',
      value: {
        series,
        gridLatitude: newest.series.gridLatitude,
        gridLongitude: newest.series.gridLongitude,
        distanceKm: newest.series.distanceKm,
      },
      validAtMs: series.validAtMs,
    };
  }
}
