import { Injectable } from '@nestjs/common';
// A VALUE import, not `import type` — Nest's constructor-injection resolves this parameter
// via `emitDecoratorMetadata`'s `design:paramtypes`, which needs the real class reference to
// exist in the compiled output (a type-only import erases it, and Nest then sees `Function`
// instead of `DataSource` and cannot resolve the provider — measured via `pnpm
// openapi:generate`, which boots the whole `AppModule`).
import { DataSource } from 'typeorm';
import { AuthSecretsProvider } from './auth-secrets.provider';
import { AUTH_RATE_LIMIT_RULES, type AuthRateLimitScope } from './auth.types';
import { hmacSha256 } from './token-digest';

/** `allowed: false` carries how long the CALLER should wait before the window frees up. */
export interface AuthRateLimitOutcome {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

/**
 * Thrown when the rate-limit counter query returns a result shape `consume` cannot interpret
 * (PR-2, §3.4(a) / `TA135R2-I1` ≡ `SEC135R2-M2`).
 *
 * A NAMED class rather than a bare `Error`, following this package's own pattern
 * (`AccessTokenVerificationError`, `PasswordHashingError`, `PasswordHashVerificationError`): the
 * fail-closed intent used to be encoded only in prose ("this method has no `catch`, so throwing
 * here propagates"), which a caller could still catch generically and turn into a fail-OPEN
 * "limiter unavailable, proceed anyway" swallow without the type system objecting
 * (`SEC135R2-M2`'s named hazard). PR-2's five service callers are the first callers this class
 * exists to bind (Y16, D19): none of them may swallow this into "proceed anyway". Argument-less
 * constructor and a fixed message —
 * the message never carries a scope, a subject hash or any other call-site value, matching the
 * message this class replaces.
 */
export class AuthRateLimitUnavailableError extends Error {
  constructor() {
    super('Rate-limit counter query returned an unexpected result shape.');
    this.name = 'AuthRateLimitUnavailableError';
  }
}

/**
 * The identity-axis rate limiter (§9.2, D10/D11/D12): fixed-window, keyed on
 * `(scope, subjectHash, windowStart)`, persisted in `auth_rate_limits` — the counter of
 * record (SPEC §2.3: Redis is an accelerator layered in later, not built this turn).
 *
 * **Fixed-window, not sliding-log (D10).** Accepted trade-off: a caller can burst up to 2×
 * the cap across a window boundary. Sliding-log removes that but keeps N rows per subject
 * for these caps (3/24h … 10/15min) that gain does not justify.
 *
 * **The counter increments even for an address that is not registered (D11).** A limiter
 * that only counted known addresses would itself be an existence oracle — "the counter did
 * not move" would mean "this address does not exist". `subjectHash` never stores the raw
 * address: `HMAC-SHA256(AUTH_HMAC_PEPPER, "rate:" + scope + ":" + canonicalEmail)`.
 *
 * **No pruning scheduler (D12).** Every call to `consume` first deletes its OWN subject's
 * expired windows — a small, bounded delete — rather than running a background sweep
 * (`ENGINEERING.md` §1/§12: no scheduled machinery without a real need).
 */
@Injectable()
export class AuthRateLimitService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly secrets: AuthSecretsProvider,
  ) {}

  async consume(scope: AuthRateLimitScope, canonicalEmail: string): Promise<AuthRateLimitOutcome> {
    const rule = AUTH_RATE_LIMIT_RULES[scope];
    const nowMs = Date.now();
    const windowStartMs = Math.floor(nowMs / rule.windowMs) * rule.windowMs;
    const windowStart = new Date(windowStartMs);
    const subjectHash = hmacSha256(this.secrets.getHmacPepper(), `rate:${scope}:${canonicalEmail}`);

    // Bounded cleanup of this SAME subject's stale windows — never a corpus-wide sweep.
    await this.dataSource.query(
      `DELETE FROM "auth_rate_limits" WHERE "scope" = $1 AND "subject_hash" = $2 AND "window_start" < $3`,
      [scope, subjectHash, windowStart],
    );

    const rows = await this.dataSource.query<{ attempt_count: number }[]>(
      `INSERT INTO "auth_rate_limits" ("scope", "subject_hash", "window_start", "attempt_count", "updated_at")
       VALUES ($1, $2, $3, 1, now())
       ON CONFLICT ("scope", "subject_hash", "window_start")
       DO UPDATE SET "attempt_count" = "auth_rate_limits"."attempt_count" + 1, "updated_at" = now()
       RETURNING "attempt_count"`,
      [scope, subjectHash, windowStart],
    );

    // Fail-CLOSED on an unexpected result shape. `rows[0]` is missing, or `attempt_count` is
    // not a finite number, exactly when the underlying driver stops returning a bare row array
    // for this statement (e.g. a future refactor that turns this INSERT into an
    // `UPDATE … RETURNING` — TypeORM's `PostgresQueryRunner` keys the `[rows, rowCount]` vs.
    // bare-`rows` shape off the command tag, and UPDATE/DELETE take the tuple branch the DELETE
    // five lines above already exercises). Reading that as "zero attempts so far" would silently
    // turn every identity-axis limiter (LOGIN_EMAIL, REGISTER_EMAIL, PASSWORD_RESET_EMAIL …)
    // into an unlimited one. This method has no `catch`, so throwing here propagates to the
    // caller instead of returning `allowed: true` — the same fail-closed posture the write path
    // above already has.
    const rawAttemptCount = rows[0]?.attempt_count;
    if (typeof rawAttemptCount !== 'number' || !Number.isFinite(rawAttemptCount)) {
      throw new AuthRateLimitUnavailableError();
    }
    const attemptCount = rawAttemptCount;
    const allowed = attemptCount <= rule.limit;
    const retryAfterSeconds = allowed
      ? 0
      : Math.max(0, Math.ceil((windowStartMs + rule.windowMs - nowMs) / 1000));

    return { allowed, retryAfterSeconds };
  }
}
