import { Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { OperationDeadline } from '../upstream/operation-deadline';
import type { RedisClientPort } from '../upstream/redis/redis-client.port';
import type { UpstreamMetrics } from '../upstream/upstream-metrics';

/**
 * One thing the tour refreshes.
 *
 * The seam M3/M4 plug their provider legs into. In M2 the list is EMPTY on purpose — the lock,
 * the interval and the deadline are real and tested; there is simply nothing to fetch yet, so a
 * tour is a no-op that proves the mechanism rather than a stub that pretends to.
 */
export interface MarineWarmupTarget {
  /** Stable label for logs and counters (`open-meteo.batch`, `cmems.thetao`). */
  readonly label: string;
  /**
   * Refresh this target. MUST respect the deadline it is handed and MUST NOT throw for a provider
   * failure — that is what the upstream client's outcome union is for.
   */
  refresh(deadline: OperationDeadline): Promise<void>;
}

export type WarmupSkipReason =
  /** `MARINE_ENABLED` or `MARINE_WARMUP_ENABLED` is false. */
  | 'disabled'
  /** The previous tour on THIS instance has not finished. */
  | 'overlap'
  /** Another instance holds the Redis lock for this tour. */
  | 'lock_held';

export type WarmupTourResult =
  | { readonly ran: false; readonly reason: WarmupSkipReason }
  | {
      readonly ran: true;
      readonly refreshed: number;
      readonly failed: number;
      /** Targets skipped because the tour's own deadline ran out. */
      readonly skipped: number;
      readonly durationMs: number;
    };

export interface MarineWarmupOptions {
  enabled: boolean;
  intervalSeconds: number;
  deadlineMs: number;
  /** Injected in tests. */
  now?: () => number;
  tokenFactory?: () => string;
}

/** Redis key the tour's cross-instance lock lives under. */
export const WARMUP_LOCK_KEY = 'marine:warmup:lock';

/** Names the scheduler registry knows these timers by — also how a test finds and clears them. */
export const WARMUP_INTERVAL_NAME = 'marine-warmup-interval';
export const WARMUP_BOOT_TIMEOUT_NAME = 'marine-warmup-boot';

/**
 * Delay before the boot tour.
 *
 * Not immediate: application bootstrap already has plenty to do (Postgres pool, migrations check,
 * route registration), and adding the tour's upstream work to that moment makes a cold start
 * slower exactly when a health check is watching. Ten seconds is long enough to be out of the
 * boot storm and short enough that the first visitor still finds a warm cache.
 */
const BOOT_DELAY_MS = 10_000;

/**
 * The warmup tour (SPEC-ADDENDUM §3).
 *
 * ## Why a scheduled job exists at all, against SPEC v1's own principle
 * SPEC v1 said "no scheduled work". Then A1 measured the cold call graph: a cold `/deniz`
 * overview costs 79 upstream requests, realistically 8–15 s. Three requirements collide — no
 * scheduled work · a real number in the first HTML · a fast cold start — and only ONE of them is
 * negotiable. The second is a platform rule (an indexable live-data page must carry a real
 * server-rendered number); the third gates Vera's ISR build. So the first was relaxed, and SPEC
 * v1 had itself pre-approved this exact mechanism for Faz-2 — this only moves it to Faz-1
 * (recorded deviation, AÇIK-1).
 *
 * ## What it is NOT
 * Not a queue, not a worker, not a second entry point, not a new deployable. It is one provider
 * inside the existing Nest process — precisely the thing `ENGINEERING.md` §1's "no BullMQ at
 * day-0" rule leaves room for.
 *
 * ## Multi-instance safety
 * With Redis, each tour takes `marine:warmup:lock` with `SET NX PX <deadline>`; an instance that
 * cannot take it skips the tour entirely. The lock is released by compare-and-delete, never a
 * bare `DEL` — an instance whose lock had already expired would otherwise delete the lock a
 * different instance has since taken, and two tours would hammer the provider with nothing in
 * the logs to show for it. Without Redis there is no lock, because that mode is single-instance
 * by definition and says so loudly at boot.
 *
 * ## Its own deadline
 * 120 s, not the request path's 6 s. Nobody is waiting for this tour; conflating background work
 * with a user request in one budget was SPEC v1's underlying error (§6.4).
 *
 * Constructed by `MarineModule`'s factory (env-derived options, an optional Redis client, and
 * injected clocks for tests). Nest still runs its lifecycle hooks — those are found on the
 * instance, not on the provider style.
 */
export class MarineWarmupService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('MarineWarmup');
  private readonly targets: MarineWarmupTarget[] = [];
  private readonly now: () => number;
  private readonly tokenFactory: () => string;
  private running = false;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly metrics: UpstreamMetrics,
    private readonly redis: RedisClientPort | null,
    private readonly options: MarineWarmupOptions,
  ) {
    this.now = options.now ?? Date.now;
    this.tokenFactory = options.tokenFactory ?? (() => crypto.randomUUID());
  }

  /**
   * Register a target. Called by the provider modules that land in M3/M4.
   *
   * Deliberately additive rather than constructor-injected: the tour must be able to exist and be
   * scheduled before any provider does, which is exactly the M2 state.
   */
  register(target: MarineWarmupTarget): void {
    this.targets.push(target);
  }

  /** Targets currently registered — the seam a test asserts against. */
  get targetCount(): number {
    return this.targets.length;
  }

  onApplicationBootstrap(): void {
    if (!this.options.enabled) {
      this.logger.log('warmup is disabled (MARINE_ENABLED / MARINE_WARMUP_ENABLED) — no timers');
      return;
    }

    const bootTimeout = setTimeout(() => {
      void this.runTour('boot');
    }, BOOT_DELAY_MS);
    this.schedulerRegistry.addTimeout(WARMUP_BOOT_TIMEOUT_NAME, bootTimeout);

    const interval = setInterval(() => {
      void this.runTour('scheduled');
    }, this.options.intervalSeconds * 1000);
    this.schedulerRegistry.addInterval(WARMUP_INTERVAL_NAME, interval);

    this.logger.log(
      `warmup scheduled every ${String(this.options.intervalSeconds)} s ` +
        `(first tour in ${String(BOOT_DELAY_MS / 1000)} s, per-tour deadline ` +
        `${String(this.options.deadlineMs)} ms, lock ${this.redis === null ? 'OFF — single instance' : 'ON'})`,
    );
  }

  onModuleDestroy(): void {
    // Timers are removed explicitly so a test (and a graceful shutdown) does not leave the event
    // loop alive. `deleteInterval`/`deleteTimeout` throw when absent, hence the guarded lookups.
    if (this.schedulerRegistry.doesExist('interval', WARMUP_INTERVAL_NAME)) {
      this.schedulerRegistry.deleteInterval(WARMUP_INTERVAL_NAME);
    }
    if (this.schedulerRegistry.doesExist('timeout', WARMUP_BOOT_TIMEOUT_NAME)) {
      this.schedulerRegistry.deleteTimeout(WARMUP_BOOT_TIMEOUT_NAME);
    }
  }

  /**
   * One tour. Never throws — it is invoked from a timer, where a rejection has no caller and
   * would surface as an unhandled rejection.
   */
  async runTour(trigger: 'boot' | 'scheduled' | 'manual'): Promise<WarmupTourResult> {
    if (!this.options.enabled) return { ran: false, reason: 'disabled' };

    // In-process overlap guard. The Redis lock covers instances; this covers a single instance
    // whose previous tour is still running (a slow provider, a long deadline).
    if (this.running) {
      this.logger.warn(`tour (${trigger}) skipped: the previous tour is still running`);
      return { ran: false, reason: 'overlap' };
    }
    this.running = true;

    const token = this.tokenFactory();
    let holdsLock = false;

    try {
      if (this.redis !== null) {
        try {
          holdsLock = await this.redis.setIfAbsent(WARMUP_LOCK_KEY, token, this.options.deadlineMs);
        } catch (error: unknown) {
          // Redis unreachable: do NOT run. Unlike a cache read (where degrading keeps the site
          // up), running an unlocked tour on every instance multiplies upstream load by the
          // instance count — the exact thing the lock exists to prevent. Skipping is safe: the
          // next tour is 15 minutes away and cached values remain servable for six hours.
          this.metrics.increment('redis.degraded', 'warmup');
          this.logger.error(
            `tour (${trigger}) skipped: the warmup lock could not be taken — ` +
              `${error instanceof Error ? error.message : 'unknown error'}`,
          );
          return { ran: false, reason: 'lock_held' };
        }

        if (!holdsLock) {
          this.logger.debug(`tour (${trigger}) skipped: another instance holds the lock`);
          return { ran: false, reason: 'lock_held' };
        }
      }

      return await this.visitTargets(trigger);
    } finally {
      if (holdsLock && this.redis !== null) {
        await this.redis.deleteIfValueEquals(WARMUP_LOCK_KEY, token).catch((error: unknown) => {
          this.logger.warn(
            `warmup lock release failed; it expires on its own TTL — ` +
              `${error instanceof Error ? error.message : 'unknown error'}`,
          );
          return false;
        });
      }
      this.running = false;
    }
  }

  private async visitTargets(trigger: string): Promise<WarmupTourResult> {
    const startedMs = this.now();
    const deadline = new OperationDeadline(this.options.deadlineMs, this.now);

    let refreshed = 0;
    let failed = 0;
    let skipped = 0;

    for (const target of this.targets) {
      if (deadline.hasExpired()) {
        skipped += 1;
        continue;
      }
      try {
        await target.refresh(deadline);
        refreshed += 1;
      } catch (error: unknown) {
        // A target that throws is a BUG in that target (its contract is to return outcomes, not
        // throw). It must not abort the rest of the tour, and it must not be quiet.
        failed += 1;
        this.logger.error(
          `warmup target "${target.label}" threw — ` +
            `${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    const durationMs = this.now() - startedMs;

    if (this.targets.length === 0) {
      // Expected for the whole of M2: the mechanism runs, there is nothing registered to refresh.
      // Logged at debug so it does not fill the log every 15 minutes, but never silent.
      this.logger.debug(`tour (${trigger}) completed with no registered targets`);
    } else {
      this.logger.log(
        `tour (${trigger}) done in ${String(durationMs)} ms — ` +
          `${String(refreshed)} refreshed, ${String(failed)} failed, ${String(skipped)} skipped`,
      );
    }

    return { ran: true, refreshed, failed, skipped, durationMs };
  }
}
