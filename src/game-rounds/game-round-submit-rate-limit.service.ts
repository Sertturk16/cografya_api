import { Injectable } from '@nestjs/common';
// A VALUE import, not `import type` — mirrors `AuthRateLimitService`'s own noted reason:
// Nest's constructor-injection resolves this parameter via `emitDecoratorMetadata`'s
// `design:paramtypes`, which needs the real class reference in the compiled output.
import { DataSource } from 'typeorm';

const ONE_SECOND_MS = 1_000;
const ONE_MINUTE_MS = 60 * ONE_SECOND_MS;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

/**
 * The ceiling this service enforces (UYELIK-09 fix-round-2, ruled remedy —
 * `UYELIK-09-owner-review-ledger.md` §2.1): 300 submissions per user per rolling hour window,
 * ~24× tighter than the previously-unbounded rate this closes (`SEC145-I1`/`VAL145-I1`), and
 * measured to clear this package's own `test/game-rounds.e2e-spec.ts` file-run volume for a
 * single user (~26 POSTs before this fix-round, ~32 after it, both far under 300 — see that
 * file's own "the per-user submission rate limit" describe block).
 *
 * A pure numeric comparison, not a schema CHECK (the migration's own docblock) — changing this
 * number later needs no migration.
 */
export const GAME_ROUND_SUBMIT_RATE_LIMIT = {
  limit: 300,
  windowMs: ONE_HOUR_MS,
} as const;

/** One `consume` call's result. */
export interface GameRoundSubmitRateLimitOutcome {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

/**
 * Thrown when the rate-limit counter query returns a result shape `consume` cannot interpret —
 * the same named, fail-closed hazard `AuthRateLimitUnavailableError` guards for the identity-axis
 * limiter, reused here rather than duplicated as an unnamed generic `Error` so a future caller
 * cannot swallow it into a silent "proceed anyway".
 */
export class GameRoundSubmitRateLimitUnavailableError extends Error {
  constructor() {
    super('game-round-submit-rate-limit counter query returned an unexpected result shape.');
    this.name = 'GameRoundSubmitRateLimitUnavailableError';
  }
}

/**
 * The per-user submission rate limiter behind `POST /api/game-rounds`
 * (`GameRoundSubmitRateLimitGuard`, UYELIK-09 fix-round-2). Fixed-window, keyed on
 * `(user_id, window_start)`, persisted in `game_round_submit_rate_limits` — see that table's own
 * migration docblock for why this is a NEW, game-rounds-owned table and not a reuse of
 * `AuthRateLimitService`/`auth_rate_limits`.
 *
 * **Fixed-window, not sliding-log** — the same accepted trade-off `AuthRateLimitService` states
 * for its own counter (a caller can burst up to 2× the cap across a window boundary); at a
 * 300/hour ceiling that trade-off is immaterial to the class of abuse this closes (unbounded
 * growth from one account fanned out across many IPs).
 *
 * **No pruning scheduler** — every call to `consume` first deletes its OWN user's expired
 * windows, a small delete bounded by `user_id`, rather than a background sweep
 * (`ENGINEERING.md` §1/§12).
 *
 * **This limits the RATE of growth, not an absolute row cap** — remedy-validation's own finding
 * (`145-remedy-validation-SEC145-I1.json`, REMEDY QUESTION 1): a fixed-window rate limiter on any
 * axis bounds how fast the class of abuse (`SEC145-I1`'s multi-IP fan-out) can add rows, not the
 * total that can ever exist over an account's lifetime — the same accepted shape every throttle in
 * this repo already has, stated explicitly here rather than implied.
 */
@Injectable()
export class GameRoundSubmitRateLimitService {
  constructor(private readonly dataSource: DataSource) {}

  async consume(userId: string): Promise<GameRoundSubmitRateLimitOutcome> {
    const nowMs = Date.now();
    const windowStartMs =
      Math.floor(nowMs / GAME_ROUND_SUBMIT_RATE_LIMIT.windowMs) *
      GAME_ROUND_SUBMIT_RATE_LIMIT.windowMs;
    const windowStart = new Date(windowStartMs);

    // Bounded cleanup of this SAME user's stale windows — never a corpus-wide sweep.
    await this.dataSource.query(
      `DELETE FROM "game_round_submit_rate_limits" WHERE "user_id" = $1 AND "window_start" < $2`,
      [userId, windowStart],
    );

    const rows = await this.dataSource.query<{ attempt_count: number }[]>(
      `INSERT INTO "game_round_submit_rate_limits" ("user_id", "window_start", "attempt_count", "updated_at")
       VALUES ($1, $2, 1, now())
       ON CONFLICT ("user_id", "window_start")
       DO UPDATE SET "attempt_count" = "game_round_submit_rate_limits"."attempt_count" + 1,
                     "updated_at" = now()
       RETURNING "attempt_count"`,
      [userId, windowStart],
    );

    // Fail-CLOSED on an unexpected result shape — identical reasoning to
    // `AuthRateLimitService.consume`'s own guard: reading this as "zero attempts so far" would
    // silently turn this limiter into an unlimited one.
    const rawAttemptCount = rows[0]?.attempt_count;
    if (typeof rawAttemptCount !== 'number' || !Number.isFinite(rawAttemptCount)) {
      throw new GameRoundSubmitRateLimitUnavailableError();
    }
    const attemptCount = rawAttemptCount;
    const allowed = attemptCount <= GAME_ROUND_SUBMIT_RATE_LIMIT.limit;
    const retryAfterSeconds = allowed
      ? 0
      : Math.max(
          0,
          Math.ceil((windowStartMs + GAME_ROUND_SUBMIT_RATE_LIMIT.windowMs - nowMs) / 1000),
        );

    return { allowed, retryAfterSeconds };
  }
}
