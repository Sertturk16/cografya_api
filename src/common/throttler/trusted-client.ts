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
 * **"public, auth-less" stopped being true, this paragraph is where that was supposed to be caught,
 * and it was not** (`SEC136-I3`, PR #136 review). UYELIK-02 PR-2 landed
 * `GET /api/auth/session` — the repo's first NON-public GET: it carries `@UseGuards(AccessTokenGuard)`
 * and returns `id`, `firstName`, `accountRole` for the authenticated caller. The safe-method
 * restriction did not keep it out, because a METHOD is not a statement about what a route reads, and
 * the sentence above silently became false. The correction is the one this file already named as the
 * right shape ("the exemption needs a per-route opt-out rather than another exception"), so the
 * remedy is a narrowing rather than a new exception:
 *   - `GET /api/auth/session` carries `@NoTrustedClientExemption()` (`throttler-metadata.ts`), which
 *     `TrustedClientThrottlerGuard.shouldSkip` reads FIRST and answers `false` to. The route is
 *     therefore back under the global 120/min the plan's throttle table always claimed for it.
 *   - The claim this paragraph makes is now bounded to what it can defend: **every endpoint the
 *     exemption still covers is public and auth-less.** Any future authenticated or PII-bearing
 *     route must carry the same marker, and adding one without it is the regression this paragraph
 *     exists to stop for the second time.
 *   - `@SkipThrottle()` is NOT the tool for this and must not be reached for: it removes the
 *     throttle, which is the opposite of what a PII route needs.
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
 *   - **The expensive guards are token-BLIND.** Both are enforced BELOW the throttle layer and know
 *     nothing about it: the provider budget inside the shared upstream client
 *     (`UpstreamHttpClient.attemptLoop` consumes it before every attempt) and the per-request tile
 *     ceiling in `ElevationProfileService.compute`, which refuses before any fetch. An auditor
 *     checking this argument should find each where it is named — the ceiling never reaches the
 *     shared client at all (review #124, CODE124-M5). What the exemption can bypass is only the
 *     REQUEST rate, the weakest of that endpoint's four brakes. Note what that rate is NOT today:
 *     `ThrottlerGuard` tracks on `req.ip` and this service sets no `trust proxy`, so behind a proxy
 *     it is one shared bucket rather than a per-visitor one — a deliberately deferred first-deploy
 *     item (DEC 2026-08-15f D2, recorded in `ENGINEERING.md` §3.1), not something this exemption
 *     changes in either direction (review #124, SEC124-I1).
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
