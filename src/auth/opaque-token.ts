import { randomBytes, randomInt } from 'node:crypto';

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
 */
export function mintVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}
