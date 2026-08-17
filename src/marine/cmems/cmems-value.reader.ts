import type { CachedRead, UpstreamCacheService } from '../../upstream/cache/upstream-cache.service';
import type { OperationDeadline } from '../../upstream/operation-deadline';
import type { UpstreamMetrics } from '../../upstream/upstream-metrics';
import type { UpstreamOutcome } from '../../upstream/upstream.types';
import { isOk } from '../../upstream/upstream.types';
import type { MarinePoint } from '../entities/marine-point.entity';
import type { MarineUpstreamConfig } from '../marine-upstream.config';
import { MARINE_PROVIDER } from '../marine-upstream.config';
import type { CmemsClient } from './cmems-client';
import type { CmemsPointValue } from './cmems-response';
import type { CmemsDatasetSelector } from './cmems-routing';
import { CMEMS_BASIN_ROUTING, cmemsSelectorKey } from './cmems-routing';
import type { CmemsStacResolutionCache } from './cmems-stac.cache';
import { selectCmemsTime } from './cmems-time';
import type { CmemsLayerField } from './cmems.constants';

/**
 * The Redis key of one cached CMEMS value — `marine:cmems:value:{layerField}:{slug}` (plan
 * §4.2). One key per (point, variable), deliberately: the M2 outcome-typed negative TTLs
 * (`no_data` 24 h ≠ `transient` 60 s) and the Marmara `not_supported` skip both act per FIELD,
 * so a per-point composite key could not carry them. 30 points → 78 keys (24 × 3 + 6 × 1).
 * The slug is OUR seeded `slug_tr`, never a request string verbatim — the endpoints look the
 * point up first and derive the key from the entity.
 */
export function cmemsValueKey(field: CmemsLayerField, slugTr: string): string {
  return `marine:cmems:value:${field}:${slugTr}`;
}

/** The subset of a point the CMEMS read path needs. */
export type CmemsPointRef = Pick<MarinePoint, 'slugTr' | 'latitude' | 'longitude' | 'seaBasin'>;

/**
 * The CMEMS read path (marine M4b): peek for the batch endpoint, read-through for the
 * single-point endpoints, and the bare refresh for the warmup sweep.
 *
 * ## Where the provider call may happen (KİLİTLİ COLD-BEHAVIOR table)
 * - {@link peekValue} — never. The `overview` endpoint composes 78 of these and must not wait
 *   for upstream under any circumstance.
 * - {@link readValue} — inline, but ONLY for this point's own ≤3 keys, under the caller's ONE
 *   shared `OperationDeadline` (6 s). This is the table's explicitly permitted cold-conditions
 *   allowance.
 * - {@link refreshValue} — the warmup sweep's unit of work; bounded by the tour slice.
 *
 * ## No STAC call ever happens on a request path
 * The refresh closure PEEKS the resolution cache; a product that has never been resolved yields
 * `transient` ("the tour resolves it") rather than a catalogue fetch a user would wait for.
 */
export class CmemsValueReader {
  constructor(
    private readonly cache: UpstreamCacheService,
    private readonly client: CmemsClient,
    private readonly stacCache: CmemsStacResolutionCache,
    private readonly config: MarineUpstreamConfig,
    private readonly metrics: UpstreamMetrics,
    private readonly now: () => number = Date.now,
  ) {}

  /** Read-only: ceilings + freshness label, no refresh, no negative writes (U-1). */
  peekValue(point: CmemsPointRef, field: CmemsLayerField): Promise<CachedRead<CmemsPointValue>> {
    return this.cache.peek<CmemsPointValue>({
      key: cmemsValueKey(field, point.slugTr),
      providerId: MARINE_PROVIDER.cmems,
      ttls: this.config.ttls,
      ceilings: this.config.ceilings,
    });
  }

  /**
   * Read-through for the single-point endpoints: a cold key refreshes inline under the
   * caller's shared request deadline; a warm one is served with the full M2 semantics
   * (negative TTLs, stale-while-revalidate, ceilings).
   */
  readValue(
    point: CmemsPointRef,
    field: CmemsLayerField,
    deadline: OperationDeadline,
  ): Promise<CachedRead<CmemsPointValue>> {
    return this.cache.read<CmemsPointValue>({
      key: cmemsValueKey(field, point.slugTr),
      providerId: MARINE_PROVIDER.cmems,
      ttls: this.config.ttls,
      ceilings: this.config.ceilings,
      deadlineMs: this.config.requestDeadlineMs,
      deadline,
      refresh: (refreshDeadline) => this.refreshValue(point, field, refreshDeadline),
    });
  }

  /**
   * One provider fetch for one (point, field) — the refresh-closure body, also called directly
   * by the warmup sweep (which persists the outcome itself so its concurrency stays bounded).
   *
   * Never throws for a provider fault (the closure contract): every failure is an outcome.
   */
  async refreshValue(
    point: CmemsPointRef,
    field: CmemsLayerField,
    deadline: OperationDeadline,
  ): Promise<UpstreamOutcome<CmemsPointValue>> {
    const route = CMEMS_BASIN_ROUTING[point.seaBasin];
    const selector = field === 'seaSurfaceTemperature' ? route.seaSurfaceTemperature : route.wave;
    if (selector === null) {
      // Unreachable by construction: every caller consults `cmemsWaveSupport` first and skips
      // the call entirely (`not_supported` is published from routing, never from a fetch). If
      // this fires, OUR routing broke — loud, and no provider call is made.
      this.metrics.event('error', 'CMEMS value refresh asked for an unsupported basin field', {
        provider: MARINE_PROVIDER.cmems,
        point: point.slugTr,
        field,
      });
      return {
        kind: 'client_error',
        reason: `no CMEMS dataset serves ${field} in basin ${point.seaBasin} — routing bug`,
      };
    }

    const stored = await this.stacCache.get(selector.productId);
    if (stored === null) {
      // 60 s negative TTL, then the warmup's resolution phase fills this — a request never
      // waits for a STAC fetch (plan §3.2: no STAC call on the request path).
      //
      // ## Why this branch has to say something (FU-SST-UNAVAIL)
      // Three branches in this function reach no provider and so pass through none of
      // `UpstreamHttpClient.record`'s per-kind log lines; this was the only one that ALSO
      // emitted no signal of its own (the two around it each log their own ERROR). Downstream
      // the field is typically published `unavailable` with a POPULATED `fetchedAtUtc` (the
      // negative entry's own write time) while `MarineValueDto` carries no `reason`, so the
      // only copy of the explanation lived inside a Redis value that expires in 60 s. Measured
      // cost of that silence: a cold `/api/marine/points/{slug}/conditions` answered
      // `unavailable` in 25 ms and added exactly ZERO log lines — indistinguishable from a
      // provider outage.
      //
      // WARN, not ERROR: for the first seconds after boot this is the EXPECTED transitional
      // state (the tour resolves the catalogue at t+10 s), and an ERROR here would bury a real
      // fault in routine noise. Throttled per PRODUCT, because a 78-key sweep would otherwise
      // turn one fact into 78 lines — the same REASONING as the clamp signal below, but not
      // its shape: the clamp carries product-scoped labels only, while `point`/`field` here
      // are one sample of up to ~30 suppressed siblings on the same product, which is the
      // `cmems.sweep-entry-failed` pattern (`cmems-warmup.target.ts`). The message says so,
      // because a per-key label under a per-product throttle otherwise reads as a per-point
      // fault. It also states what this branch DECIDED rather than what a later layer will
      // publish: on the stale-while-revalidate path the visitor has already been answered with
      // a real stale value, and a line claiming `unavailable` would be false exactly there.
      this.metrics.throttledEvent(
        'warn',
        `cmems.stac-unresolved:${selector.productId}`,
        60_000,
        'CMEMS value refresh has no STAC resolution yet — answering transient without a call ' +
          '(throttled per product; point/field name one sample)',
        {
          provider: MARINE_PROVIDER.cmems,
          product: selector.productId,
          point: point.slugTr,
          field,
        },
      );
      return {
        kind: 'transient',
        reason:
          `no STAC resolution for ${selector.productId} yet — the warmup tour resolves the ` +
          `catalogue; value refreshes wait for it rather than fetching STAC inline`,
      };
    }

    const datasetId = this.selectedDatasetId(stored.resolution.selections, selector);
    if (datasetId === null) {
      // Fail-closed selection (§3.2): the catalogue no longer carries a set matching our
      // selector. schema_error = alarm class + its own negative TTL; NEVER a "nearest similar".
      this.metrics.event('error', 'CMEMS selector resolved no dataset — publishing unavailable', {
        provider: MARINE_PROVIDER.cmems,
        product: selector.productId,
        selector: cmemsSelectorKey(selector),
        point: point.slugTr,
        field,
      });
      return {
        kind: 'schema_error',
        reason:
          `STAC resolution for ${selector.productId} holds no dataset for selector ` +
          `${cmemsSelectorKey(selector)} — fail-closed (plan §3.2)`,
      };
    }

    const time = selectCmemsTime(this.now(), stored.resolution.temporalExtent);
    if (time.clamped) {
      // The promised `clamped` signal (review #81 M-SFH-1): a clamp at the shared horizon edge
      // is routine, but a STANDING clamp means the product's extent has stopped advancing —
      // the throttle keeps a 78-key sweep from turning one fact into 78 lines.
      this.metrics.throttledEvent(
        'warn',
        `cmems.time-clamped:${selector.productId}`,
        60_000,
        'CMEMS time selection clamped into the resolved temporal extent',
        {
          provider: MARINE_PROVIDER.cmems,
          product: selector.productId,
          selectedTime: time.timeIso,
          extentEndUtc: stored.resolution.temporalExtent.endUtc,
        },
      );
    }

    return this.client.fetchPointValue({
      field,
      latitude: point.latitude,
      longitude: point.longitude,
      // Static routing table + STAC resolver output ONLY — never request-shaped (M-SEC-1).
      datasetPath: `${selector.productId}/${datasetId}`,
      maxGridDistanceKm: route.maxGridDistanceKm,
      timeIso: time.timeIso,
      validAtMs: time.validAtMs,
      deadline,
    });
  }

  /**
   * Force-refresh one product's STAC resolution and overwrite the stored one — the 400-XML
   * self-heal's action half (`cmems-reresolve.ts` is the decision half). Returns `true` when a
   * fresh resolution landed.
   */
  async forceResolveProduct(
    productId: string,
    selectors: readonly { readonly key: string; readonly selector: CmemsDatasetSelector }[],
    deadline: OperationDeadline,
  ): Promise<boolean> {
    const outcome = await this.client.fetchProductResolution({ productId, selectors, deadline });
    if (!isOk(outcome)) return false;
    await this.stacCache.set(productId, outcome.value);
    return true;
  }

  private selectedDatasetId(
    selections: readonly {
      readonly selectorKey: string;
      readonly selection: { readonly datasetId: string | null };
    }[],
    selector: CmemsDatasetSelector,
  ): string | null {
    const key = cmemsSelectorKey(selector);
    const entry = selections.find((candidate) => candidate.selectorKey === key);
    return entry?.selection.datasetId ?? null;
  }
}
