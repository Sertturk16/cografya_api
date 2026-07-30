import { describe, expect, it } from '@jest/globals';
import { evaluateStaleness, type StalenessCeilings } from './staleness';

const CEILINGS: StalenessCeilings = { staleMaxSeconds: 21_600, validAtMaxAgeSeconds: 10_800 };
const NOW = Date.parse('2026-07-30T12:00:00.000Z');

function at(minutesAgo: number): number {
  return NOW - minutesAgo * 60_000;
}

describe('evaluateStaleness', () => {
  it('labels a value inside its TTL as fresh, with no stale marker', () => {
    const verdict = evaluateStaleness({
      storedAtMs: at(10),
      validAtMs: at(20),
      ttlSeconds: 3_600,
      nowMs: NOW,
      ceilings: CEILINGS,
    });

    expect(verdict).toMatchObject({ usable: true, freshness: 'fresh', staleSinceMs: null });
  });

  it('labels a value past its TTL as stale but still publishes it', () => {
    // `ok` + `stale` is a normal, frequent state, not a contradiction: the provider has been quiet
    // for a while and we still hold a valid number (SPEC-ADDENDUM §7.7).
    const verdict = evaluateStaleness({
      storedAtMs: at(90),
      validAtMs: at(100),
      ttlSeconds: 3_600,
      nowMs: NOW,
      ceilings: CEILINGS,
    });

    expect(verdict).toMatchObject({ usable: true, freshness: 'stale' });
    if (verdict.usable) {
      expect(verdict.staleSinceMs).toBe(at(90) + 3_600_000);
      expect(Math.round(verdict.ageSeconds)).toBe(5_400);
    }
  });

  it('drops a value that breached the CACHE-AGE ceiling', () => {
    const verdict = evaluateStaleness({
      storedAtMs: at(7 * 60),
      validAtMs: at(7 * 60),
      ttlSeconds: 3_600,
      nowMs: NOW,
      ceilings: CEILINGS,
    });

    expect(verdict).toMatchObject({ usable: false, reason: 'cache_age_ceiling' });
  });

  it('drops a FRESHLY FETCHED value whose model moment is too old — the ceiling the other misses', () => {
    // Fetched ten minutes ago (fresh cache by any measure) but describing a model step from eight
    // hours ago. Cache age alone cannot see this; it is exactly the failure A5-a was aimed at.
    const verdict = evaluateStaleness({
      storedAtMs: at(10),
      validAtMs: at(8 * 60),
      ttlSeconds: 3_600,
      nowMs: NOW,
      ceilings: CEILINGS,
    });

    expect(verdict).toMatchObject({ usable: false, reason: 'valid_at_ceiling' });
  });

  it('exempts a payload with no model time from the SECOND ceiling only', () => {
    const withinCacheCeiling = evaluateStaleness({
      storedAtMs: at(60),
      validAtMs: null,
      ttlSeconds: 3_600,
      nowMs: NOW,
      ceilings: CEILINGS,
    });
    expect(withinCacheCeiling.usable).toBe(true);

    const beyondCacheCeiling = evaluateStaleness({
      storedAtMs: at(7 * 60),
      validAtMs: null,
      ttlSeconds: 3_600,
      nowMs: NOW,
      ceilings: CEILINGS,
    });
    expect(beyondCacheCeiling).toMatchObject({ usable: false, reason: 'cache_age_ceiling' });
  });

  it('never reports a negative age when the clock moves backwards', () => {
    const verdict = evaluateStaleness({
      storedAtMs: NOW + 5_000,
      validAtMs: null,
      ttlSeconds: 60,
      nowMs: NOW,
      ceilings: CEILINGS,
    });
    expect(verdict.ageSeconds).toBe(0);
  });
});
