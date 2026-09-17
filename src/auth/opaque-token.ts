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
 * ## What decides the fixed code, and why it is the transport rather than the environment
 *
 * This used to branch on `nodeEnv === 'development'`, with `env.schema.ts` refusing to boot a
 * production deployment on `MAIL_TRANSPORT=noop` so the two could never meet. That refusal is
 * gone (owner, 2026-09-17): AWS SES is sandboxed pending a verified sending domain, so `ses`
 * cannot deliver from this deployment at all, and the rule's only remaining effect was stopping
 * the API from booting.
 *
 * So the decision moved to the thing it was always really about. **A deployment that sends no
 * mail has no way to deliver a random code** — the code exists only in an email nobody receives,
 * and every registration is stuck at the same step. A fixed code is not a weakening of that
 * setup, it is the only thing that makes it usable.
 *
 * Reading `MAIL_TRANSPORT` instead of `NODE_ENV` also means there is nothing to remember. The
 * fixed path cannot outlive the condition that justifies it: the moment this deployment is
 * pointed at a real transport, codes are random again, with no flag to unset and no line to
 * delete. Gating on an environment name, or on a separate `ALLOW_FIXED_CODE`-style switch, both
 * leave a fixed code that survives the day mail starts working.
 *
 * **This is a real reduction in assurance, and it is bounded.** On a noop deployment anyone who
 * knows an address can register with it and clear `emailVerifiedAt` without holding the mailbox.
 * It does NOT reach password reset: that mints `randomBytes(32)` through {@link mintOpaqueToken},
 * which this branch does not touch, so on noop that flow is unusable rather than guessable.
 *
 * `nodeEnv` stays in the signature and stays validated-snapshot-only. It no longer decides this
 * branch, but the reasoning it carried is the reason `transport` is passed the same way: from
 * `ConfigService<Env, true>.get(…, { infer: true })`, the object `env.schema.ts`'s `validate`
 * produced ONCE at boot — never a live `process.env` read, which `src/openapi/preview-env.ts`
 * already mutates as a side effect of spec generation.
 *
 * `opaque-token.spec.ts` pins both directions: `noop` returns the fixed code in every
 * environment including production, and `ses` takes the `randomInt` branch — proven by observing
 * the mocked `randomInt`'s value flow through, not merely that the result differs from
 * `'123456'`, which a 1-in-10^6 coincidence could pass.
 */
export function mintVerificationCode(
  nodeEnv: Env['NODE_ENV'],
  transport: Env['MAIL_TRANSPORT'],
): string {
  if (transport === 'noop') {
    return '123456';
  }
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}
