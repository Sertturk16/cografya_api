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
 *
 * ## ⚠️ TEMPORARY: the fixed code is live on any noop deployment (owner, 2026-09-17)
 *
 * AWS SES is sandboxed pending a verified sending domain (T-019), so production runs
 * `MAIL_TRANSPORT=noop` and a random code is delivered nowhere — every registration stalls at
 * the same step. The owner accepted a fixed code to unblock that, KNOWING what it costs, with
 * the restoration written to be one deletion and one uncomment.
 *
 * **What it costs, precisely.** `test/auth-security.e2e-spec.ts`'s `C1` pins a finding this repo
 * classified CRITICAL and fixed: before that rework, whoever registered an address FIRST owned
 * its credentials, and the victim who later confirmed their own mailbox activated the attacker's
 * password on their own verified address. The fix was that each candidate carries its OWN code,
 * so consuming the victim's code materialises the victim's account. **A shared fixed code undoes
 * exactly that** — two candidates for one address hold the same code, so the victim's own code
 * matches the attacker's candidate and the attacker's password becomes the account.
 *
 * It is a loaded gun, and today there is nobody to shoot: the deployment is on a bare IP, is not
 * announced and has no users (the recorded risk posture). That is the whole of the argument for
 * accepting it, and it expires the day the domain lands.
 *
 * **`nodeEnv !== 'test'` is not a way of hiding this from CI.** It is what keeps `C1` honest: the
 * e2e suite keeps minting DISTINCT codes, so it keeps proving the property it was written for
 * instead of being loosened to accommodate a temporary branch. The consequence to be clear about
 * is that C1 therefore does NOT cover the production configuration while this block exists —
 * the protection is knowingly absent there, not verified there.
 */
export function mintVerificationCode(
  nodeEnv: Env['NODE_ENV'],
  transport: Env['MAIL_TRANSPORT'],
): string {
  // ── TODO(T-019): DELETE THIS BLOCK when the domain lands and MAIL_TRANSPORT=ses delivers ──
  // Then uncomment the original condition below and the secure behaviour is back with no other
  // edit anywhere. Deleting this block alone is a complete, correct restoration: the `randomInt`
  // fallthrough is the original's own else-path.
  if (nodeEnv !== 'test' && transport === 'noop') {
    return '123456';
  }
  // ── The original, kept verbatim rather than rewritten from memory later ──
  // if (nodeEnv === 'development') {
  //   return '123456';
  // }
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}
