import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * HTTP header a trusted first-party caller (today: the web SSG build) presents to be
 * exempted from the global rate limit. The header NAME is not a secret — the secret is
 * the VALUE, matched against `INTERNAL_REQUEST_TOKEN` (env, zod-validated). Node lowercases
 * incoming header keys, so this constant is lowercase to match `req.headers[...]`.
 */
export const INTERNAL_REQUEST_HEADER = 'x-internal-request-token';

/**
 * Decide whether a request is the trusted first-party build client and may skip the global
 * throttle. This is the security-critical core of the exemption, kept as a pure function so
 * it is unit-tested exhaustively (the `computePopulationDensity` / `buildClimate` precedent).
 *
 * The exemption's whole security rests on the SECRECY of `configuredToken`: any caller that
 * presents it bypasses the rate limit. The exempted endpoints are public, auth-less, cheap,
 * cacheable reads, so a leaked token buys only a throttle bypass — never data exposure or cost —
 * but the comparison is still hardened as if it guarded more:
 *
 * **"PII-free" was part of that sentence and is no longer true** (PR #110 review, `SEC110-I2`):
 * `GET /api/books/{slug}` publishes `authorNames`, two named individuals, by owner ruling. The
 * conclusion is unchanged and the reason is worth stating rather than assuming — those names are
 * already public on the book's cover and on the endpoint itself, which needs no token, so a leaked
 * token exposes nothing that anonymous traffic cannot read at 120 req/min anyway. What WOULD change
 * the conclusion is personal data reachable only through this exemption; there is none, and the
 * safe-method restriction in the guard is what keeps it that way.
 *
 *   - **Fail-closed:** with NO server-side secret configured, nothing is trusted — every
 *     request stays subject to the global limit. An absent presented token is likewise never
 *     trusted. The exemption does not exist until a secret is deliberately set.
 *   - **Constant-time:** both sides are reduced to fixed-length SHA-256 digests and compared
 *     with `timingSafeEqual`. A plain `===` on a bypass secret is a timing oracle; digesting
 *     also means the comparison never leaks the secret's length.
 */
export function isTrustedClientRequest(
  presentedToken: string | undefined,
  configuredToken: string | undefined,
): boolean {
  if (configuredToken === undefined || configuredToken === '' || presentedToken === undefined) {
    return false;
  }

  const presentedDigest = createHash('sha256').update(presentedToken).digest();
  const configuredDigest = createHash('sha256').update(configuredToken).digest();
  return timingSafeEqual(presentedDigest, configuredDigest);
}
