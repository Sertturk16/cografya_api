// CONTROL-F (temporary, revert-to-red evidence for SEC84-P1): buildTrackerKey below no longer
// calls createHmac, so this import is unused for the duration of the control.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { constantTimeTokenMatch } from '../security/constant-time-token';

/**
 * SEC84-P1 — the two-axis visitor identity `TrustedClientThrottlerGuard.getTracker` resolves.
 *
 * **Two axes, kept apart on purpose.** The PEER axis is the address the api is entitled to read
 * off the connection itself — the raw socket peer with `TRUSTED_PROXY_HOPS=0` (today's
 * behaviour, unchanged), or the address the single trusted L7 terminator supplied with
 * `TRUSTED_PROXY_HOPS=1` (`DEC 2026-08-26o`). The FORWARDED axis is a visitor address a caller
 * (the web BFF) explicitly forwards, and it is believed ONLY when that caller also authenticates
 * itself with `VISITOR_FORWARD_TOKEN` — a header carrying that token proves identity to THIS
 * module; it grants no throttle exemption anywhere (`trusted-client.ts`'s `shouldSkip` reads a
 * different variable and is untouched by this file).
 *
 * Every function here is pure — no I/O, no crypto RNG, no clock — so the resolution logic is
 * unit-tested exhaustively (`visitor-tracker.spec.ts`), the same shape `trusted-client.ts`
 * already established for `isTrustedClientRequest`.
 */

/** The visitor address a trusted forwarder reports, per SEC84-P1 §A. Node lowercases incoming
 * header keys, so this constant is lowercase to match `req.headers[...]`. */
export const VISITOR_ADDRESS_HEADER = 'x-visitor-address';

/** Authenticates the caller as a trusted forwarder — the ONLY thing this header proves. It never
 * grants a throttle exemption; `shouldSkip` never reads it. */
export const VISITOR_FORWARD_TOKEN_HEADER = 'x-visitor-forward-token';

/**
 * The longest legal textual IPv4/IPv6 form this module accepts (SEC84-P1 §A, decided and
 * binding). A value longer than this is refused before any parsing is attempted.
 */
export const MAX_VISITOR_ADDRESS_LENGTH = 45;

/**
 * The closed set of reasons `resolveVisitorIdentity` may fall back to the peer identity for.
 * Exactly seven members — the guard logs each AT MOST ONCE PER PROCESS (a `Set` over this union,
 * never a growing map), so the log surface is structurally bounded (§F).
 */
export type TrackerFallbackReason =
  | 'forward-token-multi-valued'
  | 'forward-token-mismatch'
  | 'authenticated-forwarder-without-address'
  | 'address-multi-valued'
  | 'address-malformed'
  | 'non-public-address-in-production'
  | 'peer-address-malformed';

/** A raw HTTP header value as Node hands it to us: absent, one string, or several (sent twice). */
export type RawHeaderValue = string | string[] | undefined;

export interface ResolveVisitorIdentityInput {
  /** Express's `req.ip` — under `TRUSTED_PROXY_HOPS=1` this is what the trusted terminator
   * supplied (SEC84-P1 §C); under `0` it is the raw socket peer. */
  readonly resolvedPeer: string | undefined;
  /** `req.socket?.remoteAddress` — the fallback when `resolvedPeer` fails validation, because
   * `proxy-addr` hands back an UNVALIDATED header string (measured, §C). */
  readonly rawSocketAddress: string | undefined;
  readonly forwardTokenHeader: RawHeaderValue;
  readonly addressHeader: RawHeaderValue;
  /** `VISITOR_FORWARD_TOKEN` as read from the validated env; `undefined`/empty means the
   * forwarding mechanism does not exist yet (today's behaviour, exactly). */
  readonly configuredForwardToken: string | undefined;
  /** `NODE_ENV === 'production'` — gates the private/loopback rejection list on the FORWARDED
   * axis only (§C step 9); the peer axis never applies it (§C step 1). */
  readonly isProduction: boolean;
}

export interface VisitorIdentityResult {
  readonly identity: string;
  readonly source: 'peer' | 'forwarded';
  readonly reason?: TrackerFallbackReason;
}

/**
 * `"a, b"` style rejection is closed at the format level: no list, no comma, no second header
 * instance, no port, no brackets, no zone id, no CIDR suffix, no whitespace. Validation is
 * `node:net`'s `isIP()`, never a hand-written regex (§A). A value containing a percent sign
 * (the zone-id form, e.g. `fe80::1%eth0`) is rejected BEFORE `isIP` is consulted, because `isIP`
 * would otherwise ACCEPT it (measured: `isIP('fe80::1%eth0') === 6`) and a zone id would split
 * one visitor across buckets.
 *
 * Normalisation: lowercase, then strip a leading `::ffff:` when the remainder is a valid IPv4 —
 * so a dual-stack edge and a plain-IPv4 edge produce the same bucket. Full IPv6 zero-compression
 * canonicalisation is deliberately NOT attempted (risk R-IPV6, accepted in the plan): the
 * forwarded value is written by infrastructure, not by the visitor, so a single edge emits a
 * single consistent textual form.
 *
 * Returns the normalised address, or `null` when the candidate does not pass. Shared by BOTH the
 * peer axis (§C step 1) and the forwarded axis (§A/§C step 8) — reusing one path is the point:
 * `req.ip` under `trust proxy` is itself a header-derived string `proxy-addr` does NOT validate,
 * so an unvalidated peer would mint a fresh bucket per garbage input exactly like an unvalidated
 * forwarded header would.
 */
export function normaliseAddressCandidate(raw: string): string | null {
  if (raw.length === 0 || raw.length > MAX_VISITOR_ADDRESS_LENGTH) return null;
  if (raw.includes(',')) return null;
  if (raw.includes('%')) return null;

  const lowered = raw.toLowerCase();
  if (isIP(lowered) === 0) return null;

  if (lowered.startsWith('::ffff:')) {
    const mapped = lowered.slice('::ffff:'.length);
    if (isIP(mapped) === 4) return mapped;
  }

  return lowered;
}

/** IPv4 ranges the forwarded axis refuses in production (§C step 9). `100.64.0.0/10` (CGNAT) is
 * DELIBERATELY absent — real ISP subscribers are served from it. */
const IPV4_PRIVATE_RANGES: ReadonlyArray<{ readonly base: string; readonly prefix: number }> = [
  { base: '0.0.0.0', prefix: 32 },
  { base: '10.0.0.0', prefix: 8 },
  { base: '127.0.0.0', prefix: 8 },
  { base: '169.254.0.0', prefix: 16 },
  { base: '172.16.0.0', prefix: 12 },
  { base: '192.168.0.0', prefix: 16 },
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = (value << 8) + octet;
  }
  return value >>> 0;
}

function isPrivateIpv4(address: string): boolean {
  const target = ipv4ToInt(address);
  if (target === null) return false;
  return IPV4_PRIVATE_RANGES.some(({ base, prefix }) => {
    const baseInt = ipv4ToInt(base);
    if (baseInt === null) return false;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (target & mask) === (baseInt & mask);
  });
}

/** IPv6 unique-local (`fc00::/7`) and link-local (`fe80::/10`) prefixes, plus the two exact
 * literal forms `::` and `::1` — checked on the already-lowercased, non-canonicalised textual
 * form (R-IPV6: no zero-compression normalisation is attempted). */
function isPrivateIpv6(address: string): boolean {
  if (address === '::' || address === '::1') return true;
  const firstTwo = address.slice(0, 2);
  if (firstTwo === 'fc' || firstTwo === 'fd') return true;
  const firstThree = address.slice(0, 3);
  return (
    firstThree === 'fe8' || firstThree === 'fe9' || firstThree === 'fea' || firstThree === 'feb'
  );
}

/**
 * The closed rejection list for the FORWARDED axis in production (§C step 9): loopback, private,
 * link-local, unique-local, unspecified. `address` must already be `normaliseAddressCandidate`'d
 * (lowercased, `::ffff:`-stripped) — this function does not validate shape.
 */
function isNonPublicAddress(address: string): boolean {
  return isIP(address) === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address);
}

interface PeerResolution {
  readonly peerIdentity: string;
  readonly peerReason?: TrackerFallbackReason;
}

/**
 * §C step 1's ladder, in isolation: `resolvedPeer` if it validates; otherwise
 * `rawSocketAddress` if IT validates, carrying `peer-address-malformed` because reaching this
 * fallback only happens when the header-derived `req.ip` failed section A's checks; otherwise
 * the literal `'unknown-peer'` — one shared bucket, MORE restrictive than any real address, never
 * less — carrying the same reason, because both inputs having failed validation is a stronger
 * instance of the same degraded-peer condition, and the closed union has no second code for it.
 *
 * The range rule (step 9) is deliberately NOT applied here: with `TRUSTED_PROXY_HOPS=0` the peer
 * legitimately is a private/loopback address in development, and with `1` a private value means
 * the terminator is on the same host, which is normal.
 */
function resolvePeerIdentity(
  resolvedPeer: string | undefined,
  rawSocketAddress: string | undefined,
): PeerResolution {
  if (resolvedPeer !== undefined) {
    const normalised = normaliseAddressCandidate(resolvedPeer);
    if (normalised !== null) return { peerIdentity: normalised };
  }

  if (rawSocketAddress !== undefined) {
    const normalised = normaliseAddressCandidate(rawSocketAddress);
    if (normalised !== null) {
      return { peerIdentity: normalised, peerReason: 'peer-address-malformed' };
    }
  }

  return { peerIdentity: 'unknown-peer', peerReason: 'peer-address-malformed' };
}

/**
 * The full resolution order of §C, binding. Returns the peer identity by default, and the
 * FORWARDED identity only when every one of these holds, checked in this order: a
 * `VISITOR_FORWARD_TOKEN` is configured; the caller presented it exactly once (not zero, not an
 * array) and it matches (constant-time); the caller also presented `x-visitor-address` exactly
 * once; that value passes {@link normaliseAddressCandidate}; and — in production only — the
 * normalised value is not on the private/loopback/link-local rejection list.
 *
 * A fallback to the peer identity is NEVER a 4xx of its own (§ "Security and failure behaviour")
 * — this function only ever returns an identity, and the caller (`TrustedClientThrottlerGuard`)
 * is what turns a REPEATED identity into a 429, never this resolution itself.
 *
 * **Reason composition, stated because the plan text leaves it as an inference rather than a
 * restated table.** §C items 2 and 4 ("configured token unset"; "forward token header absent")
 * name no reason of their own and are the TWO cases §F calls "normal" and says are never logged
 * — so both DEFER to whatever step 1 already computed for `peerIdentity` (`undefined` on a valid
 * `resolvedPeer`, `'peer-address-malformed'` only when step 1 itself had to fall back). Items
 * 3/5/6/7/8/9 each carry their OWN specific reason about the FORWARDING attempt itself, and that
 * reason always takes priority over the peer axis's own (a caller who attempted forwarding and
 * failed gets a reason naming THAT failure, not an unrelated peer-resolution note). This is a
 * deliberate reading of an ordering the plan states as a table of independent branches without
 * spelling out this precedence; Phase 2 records it here rather than inventing a silent default.
 */
export function resolveVisitorIdentity(input: ResolveVisitorIdentityInput): VisitorIdentityResult {
  const { peerIdentity, peerReason } = resolvePeerIdentity(
    input.resolvedPeer,
    input.rawSocketAddress,
  );
  const peerResult = (reason?: TrackerFallbackReason): VisitorIdentityResult =>
    reason !== undefined
      ? { identity: peerIdentity, source: 'peer', reason }
      : { identity: peerIdentity, source: 'peer' };

  const { configuredForwardToken } = input;
  if (configuredForwardToken === undefined || configuredForwardToken === '') {
    return peerResult(peerReason);
  }

  const forwardToken = input.forwardTokenHeader;
  if (Array.isArray(forwardToken)) {
    return peerResult('forward-token-multi-valued');
  }
  if (forwardToken === undefined) {
    return peerResult(peerReason);
  }
  if (!constantTimeTokenMatch(forwardToken, configuredForwardToken)) {
    return peerResult('forward-token-mismatch');
  }

  // From here the caller is an authenticated forwarder: the peer axis is deliberately
  // overridden, because on a BFF-proxied request the true peer is the BFF, not the visitor.
  const addressHeader = input.addressHeader;
  if (addressHeader === undefined) {
    return peerResult('authenticated-forwarder-without-address');
  }
  if (Array.isArray(addressHeader)) {
    return peerResult('address-multi-valued');
  }

  const normalisedAddress = normaliseAddressCandidate(addressHeader);
  if (normalisedAddress === null) {
    return peerResult('address-malformed');
  }

  if (input.isProduction && isNonPublicAddress(normalisedAddress)) {
    return peerResult('non-public-address-in-production');
  }

  return { identity: normalisedAddress, source: 'forwarded' };
}

/**
 * The tracker key handed to `@nestjs/throttler`'s `generateKey` — an HMAC-SHA256 of
 * `throttle:v1:<identity>` under `salt`, hex-encoded. Pure (the salt is an argument), so it is
 * unit-testable without reaching into the guard.
 *
 * Why HMAC under a random salt rather than a plain digest: an unsalted hash over the IPv4 space
 * is trivially brute-forced, so it would be hygiene theatre. A PER-PROCESS salt (minted once at
 * guard construction, never logged, never persisted, never configurable) makes the value
 * meaningless outside the process — which costs nothing, because the in-memory throttler store is
 * per-process too and a restart already resets it. The `throttle:v1:` domain tag follows this
 * repo's existing rule for HMAC inputs (`token-digest.ts`: every caller prefixes a fixed domain
 * tag) — `src/auth/token-digest.ts` itself is deliberately NOT imported here, because
 * `src/common/**` importing `src/auth/**` would invert the layering.
 */
export function buildTrackerKey(salt: Buffer, identity: string): string {
  // CONTROL-F (temporary, revert-to-red evidence for SEC84-P1): returns the identity unchanged
  // instead of the HMAC digest.
  void salt;
  return identity;
}
