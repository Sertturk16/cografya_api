import type { UpstreamCacheService } from '../../upstream/cache/upstream-cache.service';
import { OperationDeadline } from '../../upstream/operation-deadline';
import type { ScheduledWarmupTarget } from '../../upstream/scheduled-warmup.service';
import type { UpstreamMetrics } from '../../upstream/upstream-metrics';
import type { MarineUpstreamConfig } from '../marine-upstream.config';
import { MARINE_PROVIDER } from '../marine-upstream.config';
import { ForcedReresolveGate, isRetiredDatasetSignal } from './cmems-reresolve';
import type { CmemsDatasetSelector } from './cmems-routing';
import { CMEMS_BASIN_ROUTING, CMEMS_SELECTOR_ENTRIES, cmemsWaveSupport } from './cmems-routing';
import type { CmemsStacResolutionCache } from './cmems-stac.cache';
import type { CmemsPointRef, CmemsValueReader } from './cmems-value.reader';
import { cmemsValueKey } from './cmems-value.reader';
import type { CmemsLayerField } from './cmems.constants';

/**
 * Concurrency of the value sweep (SPEC-ADDENDUM §2.5, verbatim): four in-flight calls keeps a
 * 78-call sweep at ~8 s warm while never presenting the provider more parallel connections
 * than a single polite client.
 */
const SWEEP_CONCURRENCY = 4;

/** One unit of sweep work. */
interface SweepEntry {
  readonly point: CmemsPointRef;
  readonly field: CmemsLayerField;
}

/** What one tour's slice did — the summary log's shape, and what the unit tests assert. */
export interface CmemsTourSummary {
  resolutionsRefreshed: number;
  resolutionsFailed: number;
  /** Products the resolution phase left behind because the slice expired (review #82 M-VAL-1). */
  resolutionsSkipped: number;
  refreshed: number;
  failed: number;
  skippedFresh: number;
  suppressedByNegative: number;
  deadlineSkipped: number;
  forcedReresolves: number;
}

/**
 * The CMEMS warmup target (plan §4.3) — the SECOND target on the marine tour, behind the ECMWF
 * ingest. Per tour it (1) re-asks the STAC catalogue for any stale product resolution (≤4
 * calls — five selectors share four product documents) and (2) sweeps the stale/missing value
 * keys (≤78 calls). Intermediate tours are no-ops by construction: a 3 600 s value TTL against
 * a 900 s tour interval means only every fourth tour finds anything due (ADDENDUM §3.4).
 *
 * ## Its own slice of the tour
 * `CMEMS_TOUR_BUDGET_MS`, clipped by the tour's remaining budget (`min(slice, remainingMs())`)
 * — the ECMWF target runs first and this target may not eat what the tour has left, nor
 * vice versa (the env schema cross-checks the two slices against the tour deadline at boot).
 *
 * ## How a value is refreshed — fetch first, persist through the cache
 * The sweep calls the provider DIRECTLY (`reader.refreshValue`) and then persists the outcome
 * by handing `UpstreamCacheService.read` an already-resolved closure. Why not plain
 * `cache.read` with the live closure: for a STALE key that path answers immediately and
 * revalidates fire-and-forget, so a 78-key sweep would launch up to 78 untracked background
 * fetches — the §2.5 concurrency bound would be a fiction. Pre-fetching keeps every provider
 * call awaited inside the four sweep workers, makes the outcome kind visible for the
 * 400-triggered self-heal below, and still persists through the ONE shared persist path
 * (TTLs, negative entries and retention all decided by the cache service, never re-implemented
 * here). The pre-resolved closure means no second provider call on any `read` branch.
 *
 * One accepted looseness in that trade (review #82 M2, documented decision): on the
 * steady-state STALE path `read` answers from cache and persists this outcome via its
 * fire-and-forget background revalidation, so the write can land milliseconds after the tour
 * summary logs, and a lost cross-instance single-flight race discards this worker's outcome in
 * favour of the lock holder's own fresh write. Both windows are bounded and lose no data a
 * reader could miss (the winning writer persists a value at least as new); growing a bare
 * "persist" primitive on the shared cache to close them would buy nothing a user can observe.
 *
 * ## The 400-XML self-heal (plan §3.2 — the retired-dataset rotation)
 * A `client_error` with HTTP 400 out of a sweep fetch is the retired-dataset signature; the
 * product's STAC resolution is then force-refreshed AT MOST ONCE PER TOUR
 * (`ForcedReresolveGate` — storm protection). Entries later in the SAME sweep already read the
 * overwritten resolution, so recovery typically begins within the tour; the keys that failed
 * before the re-resolve heal on the next tour once their `client_error` negative TTL lapses —
 * the "15-minute class" ADDENDUM §6.6 asks for, instead of a silently emptying page.
 *
 * ## Never throws
 * The tour contract: a provider fault is an outcome, an unexpected exception is caught, counted
 * loudly and swallowed so the ECMWF leg's tour result is never poisoned by this target.
 */
export class CmemsWarmupTarget implements ScheduledWarmupTarget {
  readonly label = 'cmems.values';

  private readonly gate = new ForcedReresolveGate();
  private readonly selectorsByProduct: ReadonlyMap<
    string,
    readonly { readonly key: string; readonly selector: CmemsDatasetSelector }[]
  >;

  constructor(
    private readonly options: {
      readonly reader: CmemsValueReader;
      readonly stacCache: CmemsStacResolutionCache;
      readonly cache: UpstreamCacheService;
      readonly config: MarineUpstreamConfig;
      readonly metrics: UpstreamMetrics;
      readonly loadPoints: () => Promise<CmemsPointRef[]>;
      readonly now?: () => number;
    },
  ) {
    const grouped = new Map<string, { key: string; selector: CmemsDatasetSelector }[]>();
    for (const entry of CMEMS_SELECTOR_ENTRIES) {
      const list = grouped.get(entry.selector.productId) ?? [];
      list.push({ key: entry.key, selector: entry.selector });
      grouped.set(entry.selector.productId, list);
    }
    this.selectorsByProduct = grouped;
  }

  async refresh(deadline: OperationDeadline): Promise<void> {
    const now = this.options.now ?? Date.now;
    const sliceMs = Math.min(this.options.config.cmems.tourBudgetMs, deadline.remainingMs());
    if (sliceMs <= 0) return;
    const slice = new OperationDeadline(sliceMs, now);

    const summary: CmemsTourSummary = {
      resolutionsRefreshed: 0,
      resolutionsFailed: 0,
      resolutionsSkipped: 0,
      refreshed: 0,
      failed: 0,
      skippedFresh: 0,
      suppressedByNegative: 0,
      deadlineSkipped: 0,
      forcedReresolves: 0,
    };

    try {
      this.gate.beginTour();
      await this.refreshResolutions(slice, summary);
      await this.sweepValues(slice, summary);
    } catch (error: unknown) {
      // A provider fault never lands here (outcomes, not throws) — this is OUR bug, counted
      // loudly and swallowed so the tour's other targets are unaffected.
      this.options.metrics.event('error', 'CMEMS warmup target failed unexpectedly', {
        provider: MARINE_PROVIDER.cmems,
        reason: error instanceof Error ? `${error.name}: ${error.message}` : 'unknown',
      });
    }

    this.options.metrics.event('log', 'CMEMS warmup slice done', {
      provider: MARINE_PROVIDER.cmems,
      ...summary,
    });
  }

  /**
   * Phase 1: re-ask the catalogue for every product whose stored resolution is missing or
   * older than `CMEMS_STAC_TTL_SECONDS`. A failed re-ask KEEPS the old resolution — serving a
   * stale dataset id beats darkening a basin over a catalogue blip (`cmems-stac.cache.ts`).
   */
  async refreshResolutions(deadline: OperationDeadline, summary?: CmemsTourSummary): Promise<void> {
    for (const [productId, selectors] of this.selectorsByProduct) {
      if (deadline.hasExpired()) {
        // Counted, not silently returned (review #82 M-VAL-1): the map iterates in a FIXED
        // order, so an exhausted slice starves the SAME trailing products every tour — with
        // defaults it cannot bite (the resolution phase is ≤4 cheap calls), but a lowered
        // `CMEMS_TOUR_BUDGET_MS` must show up in the summary, not as invisibly-null layers.
        if (summary !== undefined) summary.resolutionsSkipped += 1;
        continue;
      }
      const stored = await this.options.stacCache.get(productId);
      const due =
        stored === null ||
        this.options.stacCache.isStale(stored, this.options.config.cmems.stacTtlSeconds);
      if (!due) continue;
      const landed = await this.options.reader.forceResolveProduct(productId, selectors, deadline);
      if (summary !== undefined) {
        if (landed) summary.resolutionsRefreshed += 1;
        else summary.resolutionsFailed += 1;
      }
    }
  }

  /** Phase 2: the value sweep — four workers over the due (point, field) pairs. */
  async sweepValues(deadline: OperationDeadline, summary?: CmemsTourSummary): Promise<void> {
    const counters = summary ?? {
      resolutionsRefreshed: 0,
      resolutionsFailed: 0,
      resolutionsSkipped: 0,
      refreshed: 0,
      failed: 0,
      skippedFresh: 0,
      suppressedByNegative: 0,
      deadlineSkipped: 0,
      forcedReresolves: 0,
    };
    const points = await this.options.loadPoints();
    const queue: SweepEntry[] = [];
    for (const point of points) {
      queue.push({ point, field: 'seaSurfaceTemperature' });
      if (cmemsWaveSupport(point.seaBasin) === 'supported') {
        queue.push({ point, field: 'waveHeight' });
        queue.push({ point, field: 'waveDirection' });
      }
    }

    const workers = Array.from({ length: SWEEP_CONCURRENCY }, () =>
      this.sweepWorker(queue, deadline, counters),
    );
    await Promise.all(workers);
  }

  private async sweepWorker(
    queue: SweepEntry[],
    deadline: OperationDeadline,
    counters: CmemsTourSummary,
  ): Promise<void> {
    for (;;) {
      const entry = queue.shift();
      if (entry === undefined) return;
      if (deadline.hasExpired()) {
        counters.deadlineSkipped += 1;
        continue;
      }
      try {
        await this.sweepOne(entry, deadline, counters);
      } catch (error: unknown) {
        // Review #82 I4: an unexpected exception in ONE entry must fail that entry, not this
        // worker. Under `Promise.all` a rejecting worker would surface at the top-level catch
        // while its three siblings kept running — mutating the summary counters and issuing
        // live provider calls AFTER the tour's "done" log had already fired. A provider fault
        // never lands here (outcomes, not throws), so this is OUR bug: counted, throttled
        // (a systematic bug would otherwise print once per entry), and the sweep continues.
        counters.failed += 1;
        this.options.metrics.throttledEvent(
          'error',
          'cmems.sweep-entry-failed',
          60_000,
          'CMEMS sweep entry failed unexpectedly — worker continues',
          {
            provider: MARINE_PROVIDER.cmems,
            point: entry.point.slugTr,
            field: entry.field,
            reason: error instanceof Error ? `${error.name}: ${error.message}` : 'unknown',
          },
        );
      }
    }
  }

  private async sweepOne(
    entry: SweepEntry,
    deadline: OperationDeadline,
    counters: CmemsTourSummary,
  ): Promise<void> {
    const { point, field } = entry;
    const peeked = await this.options.reader.peekValue(point, field);

    if (peeked.kind === 'ok' && peeked.freshness === 'fresh') {
      counters.skippedFresh += 1;
      return;
    }
    // A binding negative suppresses the refresh — for a bare negative (`origin: 'peeked'`,
    // non-ok kind) and for the stale-value-plus-negative state peek labels
    // `stale_after_failure`. The outcome-typed TTLs (no_data 24 h, transient 60 s, …) are the
    // whole point of the per-field key split; the sweep must respect them, not race them.
    if (
      peeked.origin === 'stale_after_failure' ||
      (peeked.kind !== 'ok' && peeked.origin === 'peeked')
    ) {
      counters.suppressedByNegative += 1;
      return;
    }

    const outcome = await this.options.reader.refreshValue(point, field, deadline);
    if (outcome.kind === 'ok') counters.refreshed += 1;
    else counters.failed += 1;

    // Persist through the ONE shared path — the pre-resolved closure makes this free of any
    // second provider call regardless of which branch `read` takes (see the class docblock).
    await this.options.cache.read({
      key: cmemsValueKey(field, point.slugTr),
      providerId: MARINE_PROVIDER.cmems,
      ttls: this.options.config.ttls,
      ceilings: this.options.config.ceilings,
      deadlineMs: this.options.config.requestDeadlineMs,
      refresh: () => Promise.resolve(outcome),
    });

    // The retired-dataset self-heal: exactly HTTP 400 (`httpStatus` is carried structurally
    // since review #80) — a 403/422 is a different problem a re-resolution cannot fix.
    if (
      isRetiredDatasetSignal(outcome.kind) &&
      outcome.kind === 'client_error' &&
      outcome.httpStatus === 400
    ) {
      const productId = this.productIdFor(point, field);
      if (productId === null) return;
      const selectors = this.selectorsByProduct.get(productId);
      if (selectors === undefined) {
        // Unreachable by construction (both maps derive from the same static routing table) —
        // but the old `?? []` fallback here was WORSE than unreachable (review #82 CR-M6/I3):
        // force-resolving with ZERO selectors would store a resolution whose empty selection
        // list replaces a good one and darkens the whole product. Checked BEFORE the gate so
        // the once-per-tour heal budget is not burned on a no-op.
        this.options.metrics.event('error', 'CMEMS self-heal found no selectors for product', {
          provider: MARINE_PROVIDER.cmems,
          product: productId,
          point: point.slugTr,
          field,
        });
        return;
      }
      if (this.gate.tryAcquire(productId)) {
        const landed = await this.options.reader.forceResolveProduct(
          productId,
          selectors,
          deadline,
        );
        counters.forcedReresolves += 1;
        this.options.metrics.event('warn', 'CMEMS 400 triggered a forced STAC re-resolution', {
          provider: MARINE_PROVIDER.cmems,
          product: productId,
          landed,
          point: point.slugTr,
          field,
        });
      }
    }
  }

  /** The product a (basin, field) routes to — the same static table the fetch itself used. */
  private productIdFor(point: CmemsPointRef, field: CmemsLayerField): string | null {
    const route = CMEMS_BASIN_ROUTING[point.seaBasin];
    const selector = field === 'seaSurfaceTemperature' ? route.seaSurfaceTemperature : route.wave;
    return selector?.productId ?? null;
  }
}
