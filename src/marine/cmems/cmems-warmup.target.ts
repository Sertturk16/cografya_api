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

/**
 * The value sweep's guaranteed share of the CMEMS slice, expressed as a divisor: one third of the
 * slice is fenced off BEFORE the resolution phase starts (review #117, SFH117-I1).
 *
 * ## Why the phase needed a fence at all
 * Giving the catalogue its own 25 s cap (M1) made ONE hanging product's ask cost
 * 25 000 + 250 + 25 000 = 50 250 ms of the 60 000 ms slice, against 12 250 ms before it. The
 * resolution phase and the 78-key value sweep shared that slice UNDIVIDED, so a hanging catalogue
 * — a different provider surface from the WMTS the values come from — left the sweep with nothing
 * and every key counted `deadlineSkipped`. A failed re-ask does not move `storedAtMs`
 * (`cmems-value.reader.ts` returns false without writing), so through a catalogue outage all four
 * products stay due on EVERY tour instead of re-arming every 6 h: the starvation is indefinite
 * rather than one tour, and after `MARINE_STALE_MAX_SECONDS` every point publishes `unavailable`
 * while the WMTS endpoint and the stored dataset ids are both perfectly healthy. That is exactly
 * the promise `cmems-stac.cache.ts` writes down for itself — "a STAC outage must not darken 78
 * value keys whose ids are still perfectly valid" — and ENGINEERING.md §3.5's fail-soft rule.
 *
 * ## Why one third, and why the phase keeps the larger share
 * The measured full 78-key sweep is ~8 s warm (SPEC-ADDENDUM §2.5); a third of the default 60 s
 * slice is 20 s, 2.5× that, and a RATIO keeps its meaning when an operator retunes
 * `CMEMS_TOUR_BUDGET_MS` — a fixed millisecond reserve would not. The remaining two thirds stay
 * with the resolution phase deliberately, because the priority order is unchanged: a missed sweep
 * costs STALENESS and the next tour repairs it (value TTL 3 600 s against a 900 s interval),
 * while a missed resolution costs DARKNESS (measured 21 of 30 points, 14 min 45 s). At the
 * defaults 40 s still holds a full 25 s first attempt plus a ~14.75 s retry, and both measured
 * catalogue medians (3.52 s / 4.65 s) sit far inside that.
 */
const SWEEP_RESERVE_DIVISOR = 3;

/**
 * The resolution phase's own budget inside a slice of `sliceMs` — the sweep's reserve is its
 * complement, `sliceMs - cmemsResolutionBudgetMs(sliceMs)`. Exported so the arithmetic itself is
 * unit-testable rather than only observable through a tour.
 *
 * The floor of 1 keeps `OperationDeadline`'s positive-budget contract at a 1 ms slice, the only
 * input where the reserve rounds up to the whole slice; nothing completes at that size either way.
 */
export function cmemsResolutionBudgetMs(sliceMs: number): number {
  return Math.max(1, sliceMs - Math.ceil(sliceMs / SWEEP_RESERVE_DIVISOR));
}

/** One unit of sweep work. */
interface SweepEntry {
  readonly point: CmemsPointRef;
  readonly field: CmemsLayerField;
}

/** Every selector one product document serves — what a resolution call is made for. */
type ProductSelectors = readonly {
  readonly key: string;
  readonly selector: CmemsDatasetSelector;
}[];

/** What one tour's slice did — the summary log's shape, and what the unit tests assert. */
export interface CmemsTourSummary {
  resolutionsRefreshed: number;
  resolutionsFailed: number;
  /**
   * Products the resolution phase left behind because its sub-budget expired (review #82
   * M-VAL-1) — "never asked at all", as opposed to `resolutionsFailed`'s "asked and lost".
   */
  resolutionsSkipped: number;
  /**
   * Second asks issued this tour for a product whose resolution was MISSING (never for a stale
   * one). Counted because a successful retry is otherwise invisible — `resolutionsFailed` drops
   * back to 0 and no line would name the extra provider call this target chose to make.
   *
   * "Missing" is `stacCache.get` answering `null`, which covers THREE states and not one: never
   * stored, a degraded Redis read, and a corrupt/legacy entry (`cmems-stac.cache.ts`). Retrying
   * is right in all three — the value path reads the same `null` and publishes `transient` — but
   * a reader should not take a non-zero count here as proof the fault is CMEMS's: during a Redis
   * read outage `redis.degraded` and the cache's own throttled WARN are the disambiguator
   * (review #117, SFH117-M4).
   */
  resolutionsRetried: number;
  refreshed: number;
  failed: number;
  skippedFresh: number;
  suppressedByNegative: number;
  deadlineSkipped: number;
  forcedReresolves: number;
}

/**
 * The CMEMS warmup target (plan §4.3) — the SECOND target on the marine tour, behind the ECMWF
 * ingest. Per tour it (1) re-asks the STAC catalogue for any stale product resolution and (2)
 * sweeps the stale/missing value keys (≤78 calls). Intermediate tours are no-ops by
 * construction: a 3 600 s value TTL against a 900 s tour interval means only every fourth tour
 * finds anything due (ADDENDUM §3.4).
 *
 * ## Catalogue volume — ASKS and HTTP calls are different numbers (review #117, CODE117-M2)
 * The resolution phase makes ≤4 ASKS (five selectors share four product documents) plus at most
 * one RETRY per product whose resolution is missing, so ≤8 asks. One ask is up to TWO HTTP
 * attempts inside the shared client (`MAX_ATTEMPTS`), so the provider sees ≤16 catalogue calls
 * from that phase. There is a THIRD call site — the 400-triggered self-heal below, gated to once
 * per product per tour — which puts the worst tour at ≤12 asks / ≤24 HTTP calls, against a
 * 20 000/day provider ceiling (`marine-upstream.config.ts`). Stating the unit matters because an
 * operator sizing provider politeness off "≤8" would under-count by 2×.
 *
 * ## Its own slice of the tour, and the split INSIDE that slice
 * `CMEMS_TOUR_BUDGET_MS`, clipped by the tour's remaining budget (`min(slice, remainingMs())`)
 * — the ECMWF target runs first and this target may not eat what the tour has left, nor
 * vice versa (the env schema cross-checks the two slices against the tour deadline at boot).
 * The slice is then SPLIT: the resolution phase runs on its own sub-budget
 * ({@link cmemsResolutionBudgetMs}) so a hanging catalogue cannot starve the value sweep, which
 * keeps the remainder as a floor — never as a cap, so a fast resolution phase simply leaves the
 * sweep more. The 400-heal is the one catalogue call that runs on the SLICE deadline rather than
 * the sub-budget, because it happens inside a sweep worker; bounding it is a queued follow-up
 * (review #117, SFH117-M1), not something this split covers.
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
  private readonly selectorsByProduct: ReadonlyMap<string, ProductSelectors>;

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
    // The resolution phase gets a SUB-BUDGET of the slice, never the whole of it: whatever a
    // hanging catalogue does with its share, the value sweep still has its reserve when the
    // phase returns (SWEEP_RESERVE_DIVISOR carries the reasoning). Both deadlines start here, so
    // the sub-budget can only ever expire before the slice does.
    const resolutionPhase = new OperationDeadline(cmemsResolutionBudgetMs(sliceMs), now);

    const summary: CmemsTourSummary = {
      resolutionsRefreshed: 0,
      resolutionsFailed: 0,
      resolutionsSkipped: 0,
      resolutionsRetried: 0,
      refreshed: 0,
      failed: 0,
      skippedFresh: 0,
      suppressedByNegative: 0,
      deadlineSkipped: 0,
      forcedReresolves: 0,
    };

    try {
      this.gate.beginTour();
      await this.refreshResolutions(resolutionPhase, summary);
      await this.sweepValues(slice, summary);
    } catch (error: unknown) {
      // A provider fault never lands here (outcomes, not throws) — this is OUR bug, counted
      // loudly and swallowed so the tour's other targets are unaffected.
      this.options.metrics.event('error', 'CMEMS warmup target failed unexpectedly', {
        provider: MARINE_PROVIDER.cmems,
        reason: error instanceof Error ? `${error.name}: ${error.message}` : 'unknown',
      });
    }

    // The SCALE of a resolution failure, at a level a WARN/ERROR sweep can see (the SST fix, M3).
    // The counters were already published on the LOG line below and only there, so the one field
    // that says "21 points went dark" was invisible to every alert that greps for warnings. At
    // most one line per tour, so no throttle: this is a 15-minute cadence by construction.
    //
    // The message states the DIFFERENCE rather than a single consequence, because the two cases
    // do not have the same one: a product whose resolution was MISSING publishes `unavailable`
    // on every point it serves until a later tour lands one, while a failed re-ask of a stored
    // resolution changes nothing at all — the stored one keeps serving. The failing product is
    // NOT named here on purpose: the shared client already logs `upstream call failed` at WARN
    // with `label: cmems.stac.<productId>` for each one. What was missing was the count.
    //
    // `deadlineSkipped` rides along (review #117, SFH117-I1): it is the field that says whether
    // the VALUE sweep got to run this tour, and it was published only on the LOG line below —
    // so the one number distinguishing "the catalogue is degraded" from "the catalogue took the
    // whole tour and no value refreshed either" was invisible to a WARN/ERROR sweep. The
    // sub-budget above makes the second case much harder to reach; this makes it audible when
    // it happens anyway.
    if (summary.resolutionsFailed > 0) {
      this.options.metrics.event(
        'warn',
        'CMEMS STAC resolution failed this tour — a MISSING resolution darkens every point of ' +
          'its product until a later tour lands one; a failed re-ask of a stored resolution ' +
          'keeps the stored one (see the per-call `upstream call failed` lines for which product)',
        {
          provider: MARINE_PROVIDER.cmems,
          resolutionsFailed: summary.resolutionsFailed,
          resolutionsRefreshed: summary.resolutionsRefreshed,
          resolutionsSkipped: summary.resolutionsSkipped,
          resolutionsRetried: summary.resolutionsRetried,
          deadlineSkipped: summary.deadlineSkipped,
        },
      );
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
   *
   * ## MISSING is not STALE, and only one of them is retried (the SST fix, M2)
   * The two states arrive at the same `due` and had the same handling, while their consequences
   * are opposite. A failed re-ask of a STALE resolution costs nothing: the stored one keeps
   * serving for its seven-day retention. A failed ask for a MISSING one darkens every point the
   * product serves until a LATER tour resolves it — measured on 2026-08-17 at 21 of 30 points
   * for 14 min 45 s, since the request path deliberately refuses to fetch STAC inline
   * (`cmems-value.reader.ts`). So a missing resolution gets ONE more ask in the same tour.
   *
   * ## Why the retries run as a SECOND PASS rather than immediately
   * The budget is bounded. Retrying in place would put a failed product's SECOND ask ahead of a
   * product that has not been asked ONCE — and a first ask is always worth more than a second.
   * The second pass also re-checks the deadline, so an exhausted budget simply skips it and the
   * product is counted failed (not `resolutionsSkipped`, which means "never asked at all").
   *
   * ## What the retry actually gets, stated honestly (review #117, SFH117-M5)
   * Its budget is whatever the FIRST pass left of this phase's sub-budget, not another 25 s: for
   * the incident this was written for — one product's catalogue call HANGING — the first ask has
   * already spent the phase, so the retry is skipped entirely and the product is counted failed.
   * The retry pays off on a FAST failure (5xx, refused connection, malformed document), where the
   * budget is intact and a second draw from the provider's queue is a real second chance; 13 of
   * the 20 measured draws finished under 6 s.
   *
   * `deadline` is the phase's own sub-budget when this runs inside a tour ({@link refresh}); the
   * unit tests hand it a bare deadline to pin the pass structure in isolation.
   */
  async refreshResolutions(deadline: OperationDeadline, summary?: CmemsTourSummary): Promise<void> {
    const missingAndFailed: { productId: string; selectors: ProductSelectors }[] = [];

    for (const [productId, selectors] of this.selectorsByProduct) {
      if (deadline.hasExpired()) {
        // Counted, not silently returned (review #82 M-VAL-1): the map iterates in a FIXED
        // order, so an exhausted budget starves the SAME trailing products every tour. That
        // defence used to add "with defaults it cannot bite (the resolution phase is ≤4 cheap
        // calls)" — no longer true at a 25 s catalogue cap, where ONE hanging product spends the
        // whole phase and the other three land here. The counter is what makes that visible
        // instead of leaving invisibly-null layers (S1 / FU-SST-NEG-STARVE stays open).
        if (summary !== undefined) summary.resolutionsSkipped += 1;
        continue;
      }
      const stored = await this.options.stacCache.get(productId);
      const due =
        stored === null ||
        this.options.stacCache.isStale(stored, this.options.config.cmems.stacTtlSeconds);
      if (!due) continue;
      const landed = await this.options.reader.forceResolveProduct(productId, selectors, deadline);
      if (landed) {
        if (summary !== undefined) summary.resolutionsRefreshed += 1;
        continue;
      }
      if (stored === null) {
        // Deliberately counted NEITHER way yet — this product's outcome is decided by the
        // second pass below, which keeps `resolutionsFailed` from having to be decremented.
        missingAndFailed.push({ productId, selectors });
        continue;
      }
      if (summary !== undefined) summary.resolutionsFailed += 1;
    }

    for (const { productId, selectors } of missingAndFailed) {
      if (deadline.hasExpired()) {
        if (summary !== undefined) summary.resolutionsFailed += 1;
        continue;
      }
      if (summary !== undefined) summary.resolutionsRetried += 1;
      // No extra backoff here: the shared client already paused between its own two attempts,
      // and this is a fresh draw from the provider's queue rather than a hammer.
      //
      // The retry is deliberately NOT gated on the first ask's outcome KIND — `forceResolveProduct`
      // collapses every non-`ok` outcome to `false`, so a `client_error` (a wrong product id) or a
      // `schema_error` (a document that will parse identically) is re-asked exactly like a timeout,
      // which is the only kind that can benefit (review #117, CODE117-M3). What bounds that is the
      // CIRCUIT BREAKER, not this loop: five consecutive non-ok outcomes open it and the later
      // products' retries then cost no provider call at all, while a `rate_limited` first ask opens
      // it immediately. Narrowing the retry to `transient` means returning the outcome instead of a
      // boolean from `forceResolveProduct` — a reader-API change, queued rather than taken here.
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
      resolutionsRetried: 0,
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
