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
 * **"cheap" is no longer true either, and that one needs a real argument** (CBS-P2 E2).
 * `GET /api/elevation/profile` is the first public read that can cost genuine upstream work: on a
 * cold cache it fetches up to `ELEVATION_MAX_TILES_PER_REQUEST` tiles from a third-party bucket.
 * The conclusion is again unchanged, and here is why, because "it is probably fine" is not an
 * argument about a bypass secret:
 *   - **Nothing presents the token on that path.** The only holder is the web SSG build, which
 *     renders no profile: the profile is drawn by a visitor's interaction and reaches this API
 *     through a thin web proxy route handler that deliberately does NOT forward the token and DOES
 *     forward the real client IP (Atlas ruling AK-25 md.3). So the exemption and this endpoint do
 *     not meet in any live call path.
 *   - **The expensive guards are token-BLIND.** The per-request tile ceiling and the provider
 *     budget are enforced inside the upstream client and know nothing about throttling, so an
 *     exempt caller cannot exceed either. What the exemption can bypass is only the per-client
 *     REQUEST rate — the weakest of that endpoint's four brakes, and the one an attacker could
 *     evade anyway by changing IP.
 * The residual risk of a leaked token is therefore "more requests against a cache that mostly
 * answers them for free", not "unbounded provider cost". If a future endpoint's cost survives its
 * own budget guard, this paragraph is where that stops being true and the exemption needs a
 * per-route opt-out rather than another exception.
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
