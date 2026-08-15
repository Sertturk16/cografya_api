import { Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { OperationDeadline } from './operation-deadline';
import type { RedisClientPort } from './redis/redis-client.port';
import type { UpstreamMetrics } from './upstream-metrics';

/**
 * One thing the tour refreshes.
 *
 * The seam a provider leg plugs into. An EMPTY target list is a legitimate state — the lock, the
 * interval and the deadline are real and tested; with nothing registered a tour is a no-op that
 * proves the mechanism rather than a stub that pretends to (the whole of marine M2).
 */
export interface ScheduledWarmupTarget {
  /** Stable label for logs and counters (`ecmwf.cycle`, `cmems.thetao`). */
  readonly label: string;
  /**
   * Refresh this target. MUST respect the deadline it is handed and MUST NOT throw for a provider
   * failure — that is what the upstream client's outcome union is for.
   */
  refresh(deadline: OperationDeadline): Promise<void>;
}

export type WarmupSkipReason =
  /** This tour's `enabled` option is false (marine: `MARINE_ENABLED` / `MARINE_WARMUP_ENABLED`). */
  | 'disabled'
  /** The previous tour on THIS instance has not finished. */
  | 'overlap'
  /** Another instance holds the Redis lock for this tour — a healthy, expected skip. */
  | 'lock_held'
  /**
   * Redis could not answer, so no lock could be taken and the tour was skipped.
   *
   * Its own value, not `lock_held`: the decision is the same but the SITUATION is not, and a
   * result that claims another instance holds a lock nobody holds would send whoever reads it
   * (or a future metric) looking for a peer that does not exist.
   */
  | 'redis_unavailable';

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

export interface ScheduledWarmupOptions {
  /**
   * Identity of this tour (`marine`, `air-quality`).
   *
   * EVERY name-bearing thing the tour touches is derived from it — the Redis lock key, both
   * scheduler-registry timer names, the logger context and the `redis.degraded` counter label —
   * so two legs running in one process cannot silently share a lock or collide on a timer name.
   * It is a code-level literal chosen by the module that constructs the tour, never user input.
   */
  name: string;
  enabled: boolean;
  /**
   * The env variable names that turn this tour off, printed verbatim in the `disabled` log line
   * (`MARINE_ENABLED / MARINE_WARMUP_ENABLED`).
   *
   * REQUIRED, not optional, and that is the whole point of the field (PR #78 CR-1): there are
   * exactly two construction sites, and an optional field would let the second one silently
   * inherit the first one's env names — an operator reading "warmup is disabled
   * (MARINE_ENABLED / …)" while looking for why AIR-QUALITY is dark. Being made to say it is
   * cheaper than being misled once.
   */
  disabledBy: string;
  /**
   * How the boot line describes the ABSENCE of a cross-instance lock, when that absence is a
   * DECISION rather than a deployment fact.
   *
   * Without it a `null` Redis client always prints "OFF — single instance", which is true of the
   * marine and air-quality legs (no Redis configured ⇒ one instance by definition) and false of a
   * leg that was handed `null` on purpose while Redis is provisioned and every other tour locks
   * through it. An operator reading that line would conclude the deployment is single-instance and
   * be wrong about the whole process (#111 SEC111-I2, validator's fix caveat).
   *
   * Set it to the reason; leave it unset to keep the deployment-fact wording.
   */
  locklessReason?: string;
  intervalSeconds: number;
  deadlineMs: number;
  /** Injected in tests. */
  now?: () => number;
  tokenFactory?: () => string;
}

/**
 * Redis key a tour's cross-instance lock lives under. `marine` → `marine:warmup:lock`.
 *
 * A function rather than a constant because the key IS the leg boundary: two legs sharing one key
 * would make each one skip the other's tours, with nothing in the logs to show for it.
 */
export function warmupLockKey(name: string): string {
  return `${name}:warmup:lock`;
}

/** Name the scheduler registry knows the interval by — also how a test finds and clears it. */
export function warmupIntervalName(name: string): string {
  return `${name}-warmup-interval`;
}

/** Name the scheduler registry knows the delayed boot tour by. */
export function warmupBootTimeoutName(name: string): string {
  return `${name}-warmup-boot`;
}

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
 * A scheduled warmup tour (marine SPEC-ADDENDUM §3, generalised).
 *
 * ## One class, one instance per leg
 * The DISCIPLINE lives here once — a mis-copied lock key silently multiplies upstream load by the
 * instance count, which is exactly the class of bug a second copy of this file would introduce.
 * The INSTANCE, however, is per leg: each leg gets its own `name`, and therefore its own lock,
 * its own timers, its own interval and its own deadline. That keeps a leg's kill switch meaning
 * "this leg schedules nothing" (not "this leg registers no targets while the timer still runs")
 * and stops one leg's bad day from eating another leg's tour budget.
 *
 * ## Why a scheduled job exists at all, against marine SPEC v1's own principle
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
 * With Redis, each tour takes its own `<name>:warmup:lock` with `SET NX PX <deadline>`; an
 * instance that cannot take it skips the tour entirely. The lock is released by compare-and-delete,
 * never a bare `DEL` — an instance whose lock had already expired would otherwise delete the lock
 * a different instance has since taken, and two tours would hammer the provider with nothing in
 * the logs to show for it. Without Redis there is no lock, because that mode is single-instance
 * by definition and says so loudly at boot.
 *
 * A leg may also pass `null` DELIBERATELY, and one does: the book purge tour makes no upstream call
 * and its DELETE is idempotent, so the lock protects nothing there while a Redis fault would
 * suspend a retention obligation. Such a leg states its reason through
 * {@link ScheduledWarmupOptions.locklessReason}, so the boot line does not report a provisioned
 * deployment as single-instance.
 *
 * ## Its own deadline
 * The tour's `deadlineMs` (marine: 120 s), not the request path's 6 s. Nobody is waiting for this
 * tour; conflating background work with a user request in one budget was SPEC v1's underlying
 * error (§6.4).
 *
 * Constructed by the OWNING leg's module factory (env-derived options, an optional Redis client,
 * and injected clocks for tests). Nest still runs its lifecycle hooks — those are found on the
 * instance, not on the provider style.
 */
export class ScheduledWarmupService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger: Logger;
  private readonly lockKey: string;
  private readonly intervalName: string;
  private readonly bootTimeoutName: string;
  private readonly targets: ScheduledWarmupTarget[] = [];
  private readonly now: () => number;
  private readonly tokenFactory: () => string;
  private running = false;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly metrics: UpstreamMetrics,
    private readonly redis: RedisClientPort | null,
    private readonly options: ScheduledWarmupOptions,
  ) {
    this.logger = new Logger(`Warmup:${options.name}`);
    this.lockKey = warmupLockKey(options.name);
    this.intervalName = warmupIntervalName(options.name);
    this.bootTimeoutName = warmupBootTimeoutName(options.name);
    this.now = options.now ?? Date.now;
    this.tokenFactory = options.tokenFactory ?? (() => crypto.randomUUID());
  }

  /**
   * Register a target. Called by the leg's own provider module.
   *
   * Deliberately additive rather than constructor-injected: the tour must be able to exist and be
   * scheduled before any provider does, which is exactly the state marine M2 shipped in.
   */
  register(target: ScheduledWarmupTarget): void {
    this.targets.push(target);
  }

  /** Targets currently registered — the seam a test asserts against. */
  get targetCount(): number {
    return this.targets.length;
  }

  onApplicationBootstrap(): void {
    if (!this.options.enabled) {
      // The env names come from the leg that built this instance (CR-1). Marine passes exactly
      // the pair it has always printed, so its line stays byte-identical — pinned by a test.
      this.logger.log(`warmup is disabled (${this.options.disabledBy}) — no timers`);
      return;
    }

    const bootTimeout = setTimeout(() => {
      void this.runTour('boot');
    }, BOOT_DELAY_MS);
    this.schedulerRegistry.addTimeout(this.bootTimeoutName, bootTimeout);

    const interval = setInterval(() => {
      void this.runTour('scheduled');
    }, this.options.intervalSeconds * 1000);
    this.schedulerRegistry.addInterval(this.intervalName, interval);

    this.logger.log(
      `warmup scheduled every ${String(this.options.intervalSeconds)} s ` +
        `(first tour in ${String(BOOT_DELAY_MS / 1000)} s, per-tour deadline ` +
        `${String(this.options.deadlineMs)} ms, lock ${this.describeLock()})`,
    );
  }

  /** `ON`, the stated reason this tour is deliberately unlocked, or the deployment fact. */
  private describeLock(): string {
    if (this.redis !== null) return 'ON';
    return this.options.locklessReason ?? 'OFF — single instance';
  }

  onModuleDestroy(): void {
    // Timers are removed explicitly so a test (and a graceful shutdown) does not leave the event
    // loop alive. `deleteInterval`/`deleteTimeout` throw when absent, hence the guarded lookups.
    if (this.schedulerRegistry.doesExist('interval', this.intervalName)) {
      this.schedulerRegistry.deleteInterval(this.intervalName);
    }
    if (this.schedulerRegistry.doesExist('timeout', this.bootTimeoutName)) {
      this.schedulerRegistry.deleteTimeout(this.bootTimeoutName);
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
          holdsLock = await this.redis.setIfAbsent(this.lockKey, token, this.options.deadlineMs);
        } catch (error: unknown) {
          // Redis unreachable: do NOT run. Unlike a cache read (where degrading keeps the site
          // up), running an unlocked tour on every instance multiplies upstream load by the
          // instance count — the exact thing the lock exists to prevent. Skipping is safe: the
          // next tour is one interval away and cached values stay servable far longer than that.
          // The counter is labelled with the leg's `name`, not a shared 'warmup': with two legs a
          // single label cannot answer WHICH leg lost Redis, which is the only question it exists
          // to answer.
          this.metrics.increment('redis.degraded', this.options.name);
          this.logger.error(
            `tour (${trigger}) skipped: the warmup lock could not be taken — ` +
              `${error instanceof Error ? error.message : 'unknown error'}`,
          );
          return { ran: false, reason: 'redis_unavailable' };
        }

        if (!holdsLock) {
          this.logger.debug(`tour (${trigger}) skipped: another instance holds the lock`);
          return { ran: false, reason: 'lock_held' };
        }
      }

      return await this.visitTargets(trigger);
    } finally {
      if (holdsLock && this.redis !== null) {
        await this.redis.deleteIfValueEquals(this.lockKey, token).catch((error: unknown) => {
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
      // Expected while a leg's kill switch is off: the mechanism runs, there is nothing registered
      // to refresh. Logged at debug so it does not fill the log every interval, but never silent.
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
