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
 * presents it bypasses the rate limit. Since the exempted endpoints are public, auth-less,
 * PII-free, cheap, cacheable reads, a leaked token buys only a throttle bypass — never data
 * exposure or cost — but the comparison is still hardened as if it guarded more:
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
