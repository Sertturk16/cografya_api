import { describe, expect, it } from '@jest/globals';
import {
  buildTrackerKey,
  resolveVisitorIdentity,
  type ResolveVisitorIdentityInput,
} from './visitor-tracker';

/**
 * Pure, DB-free coverage of SEC84-P1's two-axis identity resolution. Every branch of §C's
 * resolution order is asserted as a SINGLE object (`identity` + `source` + `reason` together),
 * so a wrong reason cannot hide behind a right identity — the same discipline
 * `trusted-client.spec.ts` already uses for the exemption's own decision.
 */

// A 44-char visible-ASCII stand-in, the shape `openssl rand -hex 32` produces. Not a secret.
const CONFIGURED_TOKEN = 'visitor-forward-token-0123456789-abcdefghij';

function baseInput(
  overrides: Partial<ResolveVisitorIdentityInput> = {},
): ResolveVisitorIdentityInput {
  return {
    resolvedPeer: '203.0.113.99',
    rawSocketAddress: '203.0.113.99',
    forwardTokenHeader: undefined,
    addressHeader: undefined,
    configuredForwardToken: undefined,
    isProduction: false,
    ...overrides,
  };
}

/** The "authenticated forwarder" shape every address-validation case below shares: a valid,
 * matching forward token, varying only the address header under test. */
function authenticatedInput(address: string | string[] | undefined): ResolveVisitorIdentityInput {
  return baseInput({
    configuredForwardToken: CONFIGURED_TOKEN,
    forwardTokenHeader: CONFIGURED_TOKEN,
    addressHeader: address,
  });
}

describe("resolveVisitorIdentity — §C's decision ladder", () => {
  it("no configured token → peer, the resolved peer, no reason (today's behaviour exactly)", () => {
    expect(resolveVisitorIdentity(baseInput())).toEqual({
      identity: '203.0.113.99',
      source: 'peer',
    });
  });

  it('token configured, forward-token header absent → peer, no reason (every direct caller)', () => {
    expect(resolveVisitorIdentity(baseInput({ configuredForwardToken: CONFIGURED_TOKEN }))).toEqual(
      { identity: '203.0.113.99', source: 'peer' },
    );
  });

  it('array-valued forward-token header (sent twice) → peer, forward-token-multi-valued', () => {
    expect(
      resolveVisitorIdentity(
        baseInput({
          configuredForwardToken: CONFIGURED_TOKEN,
          forwardTokenHeader: [CONFIGURED_TOKEN, CONFIGURED_TOKEN],
        }),
      ),
    ).toEqual({ identity: '203.0.113.99', source: 'peer', reason: 'forward-token-multi-valued' });
  });

  it('a non-matching forward-token header → peer, forward-token-mismatch', () => {
    expect(
      resolveVisitorIdentity(
        baseInput({
          configuredForwardToken: CONFIGURED_TOKEN,
          forwardTokenHeader: `${CONFIGURED_TOKEN}-wrong`,
        }),
      ),
    ).toEqual({ identity: '203.0.113.99', source: 'peer', reason: 'forward-token-mismatch' });
  });

  it('authenticated forwarder, address header absent → peer, authenticated-forwarder-without-address', () => {
    expect(resolveVisitorIdentity(authenticatedInput(undefined))).toEqual({
      identity: '203.0.113.99',
      source: 'peer',
      reason: 'authenticated-forwarder-without-address',
    });
  });

  it('authenticated forwarder, array-valued address header → peer, address-multi-valued', () => {
    expect(resolveVisitorIdentity(authenticatedInput(['203.0.113.10', '203.0.113.11']))).toEqual({
      identity: '203.0.113.99',
      source: 'peer',
      reason: 'address-multi-valued',
    });
  });

  it.each<[string, string]>([
    ['a comma-separated list', '203.0.113.5,1.2.3.4'],
    ['a value longer than the 45-character maximum', 'a'.repeat(46)],
    ["the zone-id form — the case Node's isIP would otherwise ACCEPT", 'fe80::1%eth0'],
    ['non-IP garbage', 'not-an-ip'],
  ])('authenticated forwarder, %s address → peer, address-malformed', (_label, address) => {
    expect(resolveVisitorIdentity(authenticatedInput(address))).toEqual({
      identity: '203.0.113.99',
      source: 'peer',
      reason: 'address-malformed',
    });
  });

  it('authenticated forwarder, a valid IPv4 address → forwarded', () => {
    expect(resolveVisitorIdentity(authenticatedInput('203.0.113.10'))).toEqual({
      identity: '203.0.113.10',
      source: 'forwarded',
    });
  });

  it('authenticated forwarder, a valid IPv6 address → forwarded', () => {
    expect(resolveVisitorIdentity(authenticatedInput('2001:db8::1'))).toEqual({
      identity: '2001:db8::1',
      source: 'forwarded',
    });
  });

  it('an IPv4-mapped IPv6 form resolves to the SAME identity as the plain IPv4 form', () => {
    const mapped = resolveVisitorIdentity(authenticatedInput('::ffff:203.0.113.5'));
    const plain = resolveVisitorIdentity(authenticatedInput('203.0.113.5'));
    expect(mapped).toEqual({ identity: '203.0.113.5', source: 'forwarded' });
    expect(mapped).toEqual(plain);
  });

  it('an uppercase IPv6 form resolves to the SAME identity as its lowercase form', () => {
    const upper = resolveVisitorIdentity(authenticatedInput('2001:DB8::1'));
    const lower = resolveVisitorIdentity(authenticatedInput('2001:db8::1'));
    expect(upper).toEqual({ identity: '2001:db8::1', source: 'forwarded' });
    expect(upper).toEqual(lower);
  });

  describe.each<[string, string]>([
    ['0.0.0.0', '0.0.0.0'],
    ['10.0.0.0/8', '10.1.2.3'],
    ['127.0.0.0/8', '127.0.0.1'],
    ['169.254.0.0/16', '169.254.1.1'],
    ['172.16.0.0/12', '172.20.1.1'],
    ['192.168.0.0/16', '192.168.1.1'],
    ['::', '::'],
    ['::1', '::1'],
    ['fc00::/7', 'fd12:3456::1'],
    ['fe80::/10', 'fe80::1'],
  ])('the %s rejection-list range', (_label, address) => {
    it('is refused in production — peer, non-public-address-in-production', () => {
      expect(
        resolveVisitorIdentity({ ...authenticatedInput(address), isProduction: true }),
      ).toEqual({
        identity: '203.0.113.99',
        source: 'peer',
        reason: 'non-public-address-in-production',
      });
    });

    it('is accepted OUTSIDE production — forwarded (the local-dev/e2e-harness case)', () => {
      expect(
        resolveVisitorIdentity({ ...authenticatedInput(address), isProduction: false }),
      ).toEqual({ identity: address.toLowerCase(), source: 'forwarded' });
    });
  });

  it('100.64.0.0/10 (CGNAT) is accepted under BOTH isProduction values — deliberately not on the rejection list', () => {
    const cgnatAddress = '100.64.1.1';
    expect(
      resolveVisitorIdentity({ ...authenticatedInput(cgnatAddress), isProduction: true }),
    ).toEqual({ identity: cgnatAddress, source: 'forwarded' });
    expect(
      resolveVisitorIdentity({ ...authenticatedInput(cgnatAddress), isProduction: false }),
    ).toEqual({ identity: cgnatAddress, source: 'forwarded' });
  });

  describe('the peer axis (§C step 1) in isolation — exercised with no forwarding token configured', () => {
    it('a valid resolvedPeer is used as-is', () => {
      expect(
        resolveVisitorIdentity(
          baseInput({ resolvedPeer: '198.51.100.7', rawSocketAddress: '198.51.100.7' }),
        ),
      ).toEqual({ identity: '198.51.100.7', source: 'peer' });
    });

    it('a malformed resolvedPeer falls through to a valid rawSocketAddress, reason peer-address-malformed', () => {
      // The case that exists because `proxy-addr` hands back an UNVALIDATED header string.
      expect(
        resolveVisitorIdentity(
          baseInput({ resolvedPeer: 'not-an-ip', rawSocketAddress: '198.51.100.8' }),
        ),
      ).toEqual({ identity: '198.51.100.8', source: 'peer', reason: 'peer-address-malformed' });
    });

    it('both resolvedPeer and rawSocketAddress malformed collapses onto the shared unknown-peer bucket', () => {
      expect(
        resolveVisitorIdentity(
          baseInput({ resolvedPeer: 'not-an-ip', rawSocketAddress: 'also-not-an-ip' }),
        ),
      ).toEqual({ identity: 'unknown-peer', source: 'peer', reason: 'peer-address-malformed' });
    });

    it('resolvedPeer and rawSocketAddress both absent also collapses onto unknown-peer', () => {
      expect(
        resolveVisitorIdentity(baseInput({ resolvedPeer: undefined, rawSocketAddress: undefined })),
      ).toEqual({ identity: 'unknown-peer', source: 'peer', reason: 'peer-address-malformed' });
    });

    it('a private/loopback resolvedPeer is accepted even in production — the deliberate asymmetry with step 9', () => {
      // Must be asserted so a later "consistency" edit that applies step 9's rejection list to
      // the peer axis too reddens here.
      expect(
        resolveVisitorIdentity(
          baseInput({
            resolvedPeer: '127.0.0.1',
            rawSocketAddress: '127.0.0.1',
            isProduction: true,
          }),
        ),
      ).toEqual({ identity: '127.0.0.1', source: 'peer' });
    });
  });
});

describe('buildTrackerKey', () => {
  const saltA = Buffer.from('a'.repeat(64), 'hex');
  const saltB = Buffer.from('b'.repeat(64), 'hex');

  it('is deterministic: same salt + same identity → same key', () => {
    expect(buildTrackerKey(saltA, '203.0.113.10')).toBe(buildTrackerKey(saltA, '203.0.113.10'));
  });

  it('a different identity under the same salt gives a different key', () => {
    expect(buildTrackerKey(saltA, '203.0.113.10')).not.toBe(buildTrackerKey(saltA, '203.0.113.11'));
  });

  it('a different salt under the same identity gives a different key', () => {
    expect(buildTrackerKey(saltA, '203.0.113.10')).not.toBe(buildTrackerKey(saltB, '203.0.113.10'));
  });

  it('the key contains neither the identity substring nor the salt as hex', () => {
    const identity = '203.0.113.10';
    const key = buildTrackerKey(saltA, identity);
    expect(key).not.toContain(identity);
    expect(key).not.toContain(saltA.toString('hex'));
  });
});
