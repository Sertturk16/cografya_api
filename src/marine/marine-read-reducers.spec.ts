import { describe, expect, it } from '@jest/globals';
import type { CachedRead } from '../upstream/cache/upstream-cache.service';
import type { EcmwfPointSeriesRead } from './ecmwf/ecmwf-series.reader';
import { ecmwfDataYear, newestOkFetchedAt, oldestOkCacheAge } from './marine-read-reducers';
import { MarineSource } from './marine.types';

/**
 * Review #82 I5, the deterministic half: negative cache reads carry ages and fetch stamps of
 * their own, and neither reducer may count them. The e2e asserts the İstanbul header class
 * end-to-end; the 24 h land-mask pin is only provable with constructed reads, here.
 *
 * `ecmwfDataYear` joins them for the same reason (review #83 I1): the e2e can only ever seed one
 * cycle for every point, so "newest run wins", "skip a non-ok read" and "skip an unparseable
 * stamp" are indistinguishable there from "return the one value present".
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

/**
 * One ECMWF read, built from its real types — no cast, so a contract change breaks this file
 * rather than letting it drift into asserting a shape nobody serves.
 */
function ecmwfRead(
  kind: CachedRead<unknown>['kind'],
  modelRunAtUtc: string,
): CachedRead<EcmwfPointSeriesRead> {
  const base = {
    kind,
    freshness: kind === 'ok' ? ('fresh' as const) : null,
    cacheAgeSeconds: 5,
    staleSinceUtc: null,
    validAtUtc: null,
    fetchedAtUtc: '2026-08-02T05:00:00Z',
    reason: null,
    origin: 'peeked' as const,
  };
  if (kind !== 'ok') return { ...base, value: null };
  return {
    ...base,
    value: {
      series: {
        stepHours: 3,
        timesUtc: [modelRunAtUtc],
        seaSurfaceTemperature: [null],
        waveHeight: [0.8],
        waveDirection: [120],
        windSpeed10m: [3.6],
        windDirection10m: [326],
        source: MarineSource.Ecmwf,
        modelRunAtUtc,
        horizonEndUtc: modelRunAtUtc,
        support: { u10: 'ok', v10: 'ok', swh: 'ok', mwd: 'ok' },
        validAtMs: Date.parse(modelRunAtUtc),
      },
      gridLatitude: 41.25,
      gridLongitude: 29.5,
      distanceKm: 10.74,
    },
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

describe('ecmwfDataYear', () => {
  it('states the NEWEST run year across a mixed-year batch, not the first or the oldest', () => {
    // The branch the e2e cannot reach: it seeds one shared cycle for every point, so a
    // regression to `resolved[0]` or to the oldest run would still ship green there.
    const reads = [
      ecmwfRead('ok', '2026-12-31T18:00:00Z'),
      ecmwfRead('ok', '2027-01-01T00:00:00Z'),
      ecmwfRead('ok', '2026-06-01T06:00:00Z'),
    ];
    expect(ecmwfDataYear(reads)).toBe(2027);
    // Order must not matter — the reducer scans, it does not trust position.
    expect(ecmwfDataYear([...reads].reverse())).toBe(2027);
  });

  it('takes the UTC year of the run, never the local one', () => {
    // 2026-12-31T23:00Z is already 2027 in İstanbul. Attributing the data to 2027 would credit
    // a run ECMWF never published that year.
    expect(ecmwfDataYear([ecmwfRead('ok', '2026-12-31T23:00:00Z')])).toBe(2026);
  });

  it('ignores a non-ok read even when it carries a newer stamp', () => {
    // A negative entry describes a FAILURE, not a published cycle: its year would attribute
    // material we are not serving. Dropping this guard would also dereference a null value.
    const reads = [
      ecmwfRead('ok', '2025-05-01T00:00:00Z'),
      ecmwfRead('transient', '2026-05-01T00:00:00Z'),
    ];
    expect(ecmwfDataYear(reads)).toBe(2025);
    expect(ecmwfDataYear([ecmwfRead('no_data', '2026-05-01T00:00:00Z')])).toBeNull();
  });

  it('ignores an unparseable run stamp rather than publishing "NaN"', () => {
    // jsonb round-trips the stamp, so a malformed value is a runtime possibility, and
    // `new Date(NaN).getUTCFullYear()` would render the copyright line as "© NaN".
    expect(ecmwfDataYear([ecmwfRead('ok', 'not-a-timestamp')])).toBeNull();
    expect(
      ecmwfDataYear([ecmwfRead('ok', 'not-a-timestamp'), ecmwfRead('ok', '2026-03-01T00:00:00Z')]),
    ).toBe(2026);
  });

  it('no ECMWF cycle at all → null, so the copyright line is omitted rather than faked', () => {
    expect(ecmwfDataYear([])).toBeNull();
  });
});
