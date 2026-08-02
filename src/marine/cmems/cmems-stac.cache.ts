import type { RedisClientPort } from '../../upstream/redis/redis-client.port';
import type { UpstreamMetrics } from '../../upstream/upstream-metrics';
import { MARINE_PROVIDER } from '../marine-upstream.config';
import type { CmemsProductResolution } from './cmems-stac';

/**
 * Storage for the STAC dataset-id resolutions (plan §3.2): one entry per product,
 * `marine:cmems:stac:{productId}`, refreshed by the warmup tour, read by the value-refresh
 * path and by `/layers` — NEVER written from a request.
 *
 * ## Why this is marine-local and not an `UpstreamCacheService` key — a different POLICY
 * The value cache's policy is "a value past its ceilings must not be published, and a failed
 * refresh writes a suppressing negative entry". A resolution wants the OPPOSITE on both counts:
 *  - a STALE resolution is still the best available answer — dataset ids rotate rarely, and a
 *    STAC outage must not darken 78 value keys whose ids are still perfectly valid. So an entry
 *    here is served regardless of age; `CMEMS_STAC_TTL_SECONDS` only decides when the warmup
 *    RE-ASKS, never when serving stops.
 *  - a RETIRED id heals through the 400-triggered forced re-resolution (`cmems-reresolve.ts`),
 *    which needs an unconditional OVERWRITE — a primitive the read-through cache deliberately
 *    does not offer. The overwrite is unconditional for metadata and every re-resolved id; the
 *    ONE exception is a selection REGRESSING to null, which the per-selector downgrade guard
 *    holds back (same stale-beats-nothing policy, applied per selector — review #82 I3).
 * This is therefore not the A-2 "guard copy" class the plan rejects (no ceiling/freshness logic
 * is duplicated — there are no ceilings here, by policy); it is a second, smaller cache with
 * different rules, stated once.
 *
 * ## Fail-soft, like every cache in this repo
 * A Redis fault degrades to a miss (read) or a dropped write — loudly, never a 500: the value
 * path then answers `transient` for the affected product and the next tour re-resolves.
 */

/** One stored resolution, with the moment it was resolved (drives the warmup's re-ask cadence). */
export interface StoredCmemsResolution {
  readonly resolution: CmemsProductResolution;
  readonly storedAtMs: number;
}

/**
 * Physical retention: 7 days. Far above the 6 h re-ask cadence on purpose — retention is only
 * a bound against abandoned keys, while serving stale is the POLICY (see the module docblock).
 * A resolution older than this without a single successful tour refresh means the tour has been
 * broken for a week, and at that point an honest `unavailable` beats a week-old id.
 */
const RETENTION_SECONDS = 7 * 24 * 3_600;

function resolutionKey(productId: string): string {
  return `marine:cmems:stac:${productId}`;
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

/** One stored `selections[]` entry, checked as deep as any consumer dereferences it. */
function isStoredSelection(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.selectorKey !== 'string') return false;
  const selection = entry.selection;
  if (typeof selection !== 'object' || selection === null) return false;
  return isStringOrNull((selection as Record<string, unknown>).datasetId);
}

/**
 * Structural check over what came back from Redis — the entry crosses a process boundary.
 *
 * ## Everything a consumer dereferences is validated (review #82 I6 — the #73 I9 `toIso` class)
 * Retention is 7 days — longer than a deploy cycle — so a version that renames a resolution
 * field leaves the OLD shape live for up to a week. The contract is "a corrupt or legacy entry
 * is a MISS" (the next tour re-resolves and overwrites); a validator shallower than the
 * consumers turns that miss into a TypeError that escapes the refresh closure and 500s the
 * always-on `/layers` and the value endpoints instead. Checked exactly as deep as consumption:
 * `temporalExtent.startUtc/endUtc` (`selectCmemsTime`, `/layers` d1), `updateFrequency` /
 * `admpUpdatedUtc` / `license` / `doi` (`/layers` d2–d3, attribution), and every
 * `selections[i].selection.datasetId` (`selectedDatasetId`, the merge guard below).
 */
function isStoredResolution(value: unknown): value is StoredCmemsResolution {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (!Number.isFinite(entry.storedAtMs)) return false;
  const resolution = entry.resolution;
  if (typeof resolution !== 'object' || resolution === null) return false;
  const fields = resolution as Record<string, unknown>;
  if (typeof fields.productId !== 'string') return false;
  if (typeof fields.license !== 'string') return false;
  if (!isStringOrNull(fields.doi)) return false;
  if (!isStringOrNull(fields.updateFrequency)) return false;
  if (!isStringOrNull(fields.admpUpdatedUtc)) return false;
  const extent = fields.temporalExtent;
  if (typeof extent !== 'object' || extent === null) return false;
  const bounds = extent as Record<string, unknown>;
  if (!isStringOrNull(bounds.startUtc) || !isStringOrNull(bounds.endUtc)) return false;
  return Array.isArray(fields.selections) && fields.selections.every(isStoredSelection);
}

export class CmemsStacResolutionCache {
  /** In-process fallback for the Redis-less development mode — four keys, a plain Map is right. */
  private readonly memory = new Map<string, StoredCmemsResolution>();

  constructor(
    private readonly redis: RedisClientPort | null,
    private readonly metrics: UpstreamMetrics,
    private readonly now: () => number = Date.now,
  ) {}

  async get(productId: string): Promise<StoredCmemsResolution | null> {
    if (this.redis === null) {
      return this.memory.get(resolutionKey(productId)) ?? null;
    }
    let raw: string | null;
    try {
      raw = await this.redis.get(resolutionKey(productId));
    } catch (error: unknown) {
      this.degraded('read', productId, error);
      return null;
    }
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isStoredResolution(parsed)) {
        this.degraded('validate', productId, new Error('stored resolution has the wrong shape'));
        return null;
      }
      return parsed;
    } catch (error: unknown) {
      // Corrupt entry = miss; the next tour re-resolves and overwrites — self-healing.
      this.degraded('parse', productId, error);
      return null;
    }
  }

  /**
   * Overwrite the stored resolution — the primitive the 400-triggered forced re-resolution
   * needs. Metadata and every NON-NULL selection overwrite unconditionally; a selection that
   * REGRESSED to null keeps its previous dataset id (see the merge guard below, review #82 I3).
   */
  async set(productId: string, resolution: CmemsProductResolution): Promise<void> {
    const previous = await this.get(productId);
    const entry: StoredCmemsResolution = {
      resolution: this.withSelectionDowngradeGuard(previous?.resolution ?? null, resolution),
      storedAtMs: this.now(),
    };
    if (this.redis === null) {
      this.memory.set(resolutionKey(productId), entry);
      return;
    }
    try {
      await this.redis.setWithTtl(
        resolutionKey(productId),
        JSON.stringify(entry),
        RETENTION_SECONDS * 1000,
      );
    } catch (error: unknown) {
      this.degraded('write', productId, error);
    }
  }

  /** `true` when the warmup should RE-ASK the catalogue (never a reason to stop serving). */
  isStale(entry: StoredCmemsResolution, stacTtlSeconds: number): boolean {
    return (this.now() - entry.storedAtMs) / 1000 > stacTtlSeconds;
  }

  /**
   * Per-selector downgrade guard (review #82 I3, closing code-reviewer M5's call path too).
   *
   * "Stale beats no resolution" protected only TOTAL fetch failures (`forceResolveProduct`
   * keeps the old entry when the fetch is not ok). A PARTIAL regression slipped through it: a
   * transiently malformed item list in an otherwise-good STAC document resolved a
   * previously-working selector to `null`, and the unconditional overwrite then silently
   * regressed that basin's field to `schema_error` until the next successful full match — the
   * 400-heal never fires for it (it keys on `client_error`). The same policy therefore applies
   * per selector: a selection that regressed to null keeps the previous non-null dataset id,
   * loudly. If the id is GENUINELY retired, its values 400 and the retired-dataset heal takes
   * over — a loud, bounded path, unlike the silent darkening this guard removes.
   */
  private withSelectionDowngradeGuard(
    previous: CmemsProductResolution | null,
    next: CmemsProductResolution,
  ): CmemsProductResolution {
    if (previous === null) return next;
    const selections = next.selections.map((entry) => {
      if (entry.selection.datasetId !== null) return entry;
      const prior = previous.selections.find(
        (candidate) => candidate.selectorKey === entry.selectorKey,
      );
      if (prior === undefined || prior.selection.datasetId === null) return entry;
      this.metrics.event(
        'warn',
        'CMEMS selector regressed to null — keeping the previous dataset id (stale beats no resolution)',
        {
          provider: MARINE_PROVIDER.cmems,
          product: next.productId,
          selector: entry.selectorKey,
          keptDatasetId: prior.selection.datasetId,
          regressionReason: entry.selection.reason,
        },
      );
      return { selectorKey: entry.selectorKey, selection: prior.selection };
    });
    return { ...next, selections };
  }

  private degraded(operation: string, productId: string, error: unknown): void {
    this.metrics.increment('redis.degraded', 'cmems-stac');
    this.metrics.throttledEvent(
      'warn',
      `cmems-stac-cache:${operation}`,
      60_000,
      'CMEMS STAC resolution cache degraded',
      {
        operation,
        productId,
        reason: error instanceof Error ? error.message : 'unknown',
      },
    );
  }
}
