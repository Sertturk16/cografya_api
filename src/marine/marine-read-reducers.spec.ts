import { describe, expect, it } from '@jest/globals';
import type { CachedRead } from '../upstream/cache/upstream-cache.service';
import { newestOkFetchedAt, oldestOkCacheAge } from './marine-read-reducers';

/**
 * Review #82 I5, the deterministic half: negative cache reads carry ages and fetch stamps of
 * their own, and neither reducer may count them. The e2e asserts the İstanbul header class
 * end-to-end; the 24 h land-mask pin is only provable with constructed reads, here.
 */

function okRead(cacheAgeSeconds: number, fetchedAtUtc: string): CachedRead<unknown> {
  return {
    value: { any: 'payload' },
    kind: 'ok',
    freshness: 'fresh',
    cacheAgeSeconds,
    staleSinceUtc: null,
    validAtUtc: fetchedAtUtc,
    fetchedAtUtc,
    reason: null,
    origin: 'peeked',
  };
}

function negativeRead(
  kind: 'no_data' | 'transient',
  cacheAgeSeconds: number,
  fetchedAtUtc: string,
): CachedRead<unknown> {
  return {
    value: null,
    kind,
    freshness: null,
    cacheAgeSeconds,
    staleSinceUtc: null,
    validAtUtc: null,
    fetchedAtUtc,
    reason: 'land mask',
    origin: 'peeked',
  };
}

describe('oldestOkCacheAge', () => {
  it('answers the oldest OK age — the honest worst case over published data', () => {
    const reads = [
      okRead(42, '2026-08-02T04:56:18Z'),
      okRead(1_800, '2026-08-02T04:30:00Z'),
      okRead(0, '2026-08-02T05:00:00Z'),
    ];
    expect(oldestOkCacheAge(reads)).toBe(1_800);
  });

  it('a 24 h land-mask negative does NOT pin the header (the İstanbul-Marmara reality, plan R8)', () => {
    const reads = [
      okRead(42, '2026-08-02T04:56:18Z'),
      // The designed-for permanent no_data: 23 h inside its 24 h TTL, deliberately never
      // re-fetched by the sweep. Pre-fix this answered 82_800 — a useless staleness signal.
      negativeRead('no_data', 82_800, '2026-08-01T06:00:00Z'),
    ];
    expect(oldestOkCacheAge(reads)).toBe(42);
  });

  it('no OK read at all → null (no header; the cold response is no-store anyway)', () => {
    expect(oldestOkCacheAge([negativeRead('transient', 10, '2026-08-02T05:00:00Z')])).toBeNull();
    expect(oldestOkCacheAge([])).toBeNull();
  });
});

describe('newestOkFetchedAt', () => {
  it('answers the freshest OK fetch stamp', () => {
    const reads = [okRead(1_800, '2026-08-02T04:30:00Z'), okRead(42, '2026-08-02T04:56:18Z')];
    expect(newestOkFetchedAt(reads)).toBe('2026-08-02T04:56:18Z');
  });

  it('a REWRITTEN negative never bumps generatedAtUtc — the weak-ETag economy (delta d5)', () => {
    const reads = [
      okRead(1_800, '2026-08-02T04:30:00Z'),
      // Newer than every ok value — a transient negative just rewritten with zero body change.
      negativeRead('transient', 0, '2026-08-02T05:00:00Z'),
    ];
    expect(newestOkFetchedAt(reads)).toBe('2026-08-02T04:30:00Z');
  });

  it('no OK read → null (the caller falls back to the wall clock on the no-store branch)', () => {
    expect(newestOkFetchedAt([negativeRead('no_data', 5, '2026-08-02T05:00:00Z')])).toBeNull();
  });
});
