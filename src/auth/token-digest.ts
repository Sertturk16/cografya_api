import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * SHA-256 digest of `input`, as raw bytes.
 *
 * Deliberately returns a `Buffer`, never hex/base64: every caller stores the result in a
 * `bytea` column (`sessions.token_hash`, `password_reset_tokens.token_hash`) and the
 * `octet_length(...) = 32` CHECK constraints (§4.1) assume the raw 32-byte form, not its
 * 64-character hex encoding.
 */
export function sha256(input: string | Buffer): Buffer {
  return createHash('sha256').update(input).digest();
}

/**
 * HMAC-SHA256 digest of `input` under `pepper`, as raw bytes.
 *
 * `AUTH_HMAC_PEPPER` (§11) is shared across purposes on purpose (S8): every caller MUST
 * prefix `input` with a fixed domain tag (`"pending:"` for §5.3's verification code,
 * `"rate:"` for §9.2's rate-limit subject) so the same pepper cannot be replayed from one
 * purpose into another — two different domain-tagged inputs never collide on the same
 * plaintext by construction.
 *
 * The verification tag reads `"pending:"` rather than the earlier `"verify:"` because the id it
 * binds changed with the table: it is the `pending_registrations` row's own primary key, not a
 * `users.id` (`SEC136-C1`). The tag names the domain, so it moved with the domain.
 */
export function hmacSha256(pepper: string | Buffer, input: string | Buffer): Buffer {
  return createHmac('sha256', pepper).update(input).digest();
}

/**
 * Constant-time byte comparison for two digests.
 *
 * Returns `false` — never throws — on a length mismatch. `crypto.timingSafeEqual` throws
 * `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` when the buffers differ in length, and letting that
 * propagate would let a caller comparing an attacker-controlled digest against a stored one
 * learn the stored digest's length from whether the call throws — a side channel this
 * function exists specifically to close.
 */
export function constantTimeEquals(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
