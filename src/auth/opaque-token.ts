import { randomBytes, randomInt } from 'node:crypto';
import { type Env } from '../config/env.schema';

/**
 * 256-bit opaque bearer token, base64url-encoded.
 *
 * Used for both the refresh token (§5.2.1) and the password-reset token (§5.4): the string
 * itself carries no structure and is never decoded — only its SHA-256 digest
 * (`token-digest.ts`) is ever stored, in `sessions.token_hash` / `password_reset_tokens.token_hash`.
 * 256 bits of `crypto.randomBytes` entropy is not a dictionary/rainbow-table target, so unlike
 * the verification code below it needs no pepper.
 */
export function mintOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * A 6-digit, zero-padded numeric verification code (§5.3).
 *
 * `crypto.randomInt(0, 1_000_000)` uses rejection sampling internally, so — unlike
 * `Math.floor(Math.random() * 1_000_000)` — it introduces no modulo bias across the range.
 * `Math.random` is forbidden for anything security-relevant in this module. The range is
 * `[0, 999_999]` inclusive, so `'000000'` is a valid code and callers must not treat a
 * leading-zero code as falsy/empty.
 *
 * **`nodeEnv` is the caller's ALREADY-VALIDATED `NODE_ENV`, never read from `process.env` here
 * (the parked stash version did, and that is the one thing this signature exists to make
 * impossible).** Mirrors `resolveDocsExposure` (`src/openapi/docs-gate.ts`) — the repo's own
 * precedent for exactly this class of decision (production vs. not, decided from the validated
 * enum, never inlined as a raw env read at the call site). The caller obtains this value from
 * `ConfigService<Env, true>.get('NODE_ENV', { infer: true })` (`EmailVerificationService`'s
 * constructor), which resolves it from `internalConfig[VALIDATED_ENV_PROPNAME]` — the object
 * `env.schema.ts`'s `validate` produced ONCE at boot — and returns that snapshot even if
 * something later reassigns `process.env.NODE_ENV` (`@nestjs/config`'s `ConfigService.get`
 * checks the validated snapshot BEFORE it ever falls back to a live `process.env` read; measured
 * against `@nestjs/config@4.0.4`'s `config.service.js`). That immunity is not theoretical in
 * this repo: `src/openapi/preview-env.ts` already does `process.env.NODE_ENV ??= 'development'`
 * as a side effect of the OpenAPI spec-generation tool, so a raw `process.env.NODE_ENV` read
 * anywhere in this process is not a value one module can trust stays what boot decided — the
 * validated `ConfigService` snapshot is the only read that does.
 *
 * Two independent guarantees compose to make the fixed `'123456'` path unreachable by accident:
 * (1) `NODE_ENV` carries no default in `env.schema.ts` — a deployment that forgets to set it
 * fails to boot at all, before this function is ever reachable, rather than silently landing on
 * either branch; (2) once booted, this function only ever sees the validated snapshot value, so
 * nothing that mutates the live `process.env.NODE_ENV` afterward can flip which branch a running
 * process takes. `opaque-token.spec.ts` pins both the positive case (`nodeEnv === 'development'`
 * returns the fixed code) and the negative one (`'test'`/`'production'` take the `randomInt`
 * branch, proven by observing the mocked `randomInt`'s return value flow through — not merely
 * that the result differs from `'123456'`, which a 1-in-10^6 coincidence could still pass).
 */
export function mintVerificationCode(nodeEnv: Env['NODE_ENV']): string {
  if (nodeEnv === 'development') {
    return '123456';
  }
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}
