import type { RedisClientPort } from '../../upstream/redis/redis-client.port';
import type { UpstreamMetrics } from '../../upstream/upstream-metrics';
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
 *    does not offer.
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

/** Structural check over what came back from Redis — the entry crosses a process boundary. */
function isStoredResolution(value: unknown): value is StoredCmemsResolution {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (!Number.isFinite(entry.storedAtMs)) return false;
  const resolution = entry.resolution;
  if (typeof resolution !== 'object' || resolution === null) return false;
  const fields = resolution as Record<string, unknown>;
  return typeof fields.productId === 'string' && Array.isArray(fields.selections);
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

  /** Unconditional overwrite — the primitive the 400-triggered forced re-resolution needs. */
  async set(productId: string, resolution: CmemsProductResolution): Promise<void> {
    const entry: StoredCmemsResolution = { resolution, storedAtMs: this.now() };
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
