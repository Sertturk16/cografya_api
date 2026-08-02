import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { RedisClientPort } from '../../upstream/redis/redis-client.port';
import { UpstreamMetrics } from '../../upstream/upstream-metrics';
import type { CmemsProductResolution } from './cmems-stac';
import { CmemsStacResolutionCache } from './cmems-stac.cache';

/**
 * The resolution cache against REAL Redis semantics — strings across a process boundary
 * (review #82 I2: every other suite constructs it with `redis: null`, so the JSON round-trip,
 * the stored-shape validator and the fail-soft path were exercised nowhere).
 */

const NOW = Date.parse('2026-08-02T12:00:00.000Z');
const PRODUCT = 'BLKSEA_ANALYSISFORECAST_PHY_007_001';

function resolution(overrides: Partial<CmemsProductResolution> = {}): CmemsProductResolution {
  return {
    productId: PRODUCT,
    license: 'proprietary',
    doi: '10.25423/cmcc/blksea_analysisforecast_phy_007_001',
    temporalExtent: { startUtc: '2021-01-01T00:00:00Z', endUtc: '2026-08-10T23:00:00Z' },
    updateFrequency: 'daily: 16:00',
    admpUpdatedUtc: '2026-08-01T11:06:46Z',
    selections: [
      { selectorKey: 'blk-sst', selection: { datasetId: 'cmems_mod_blk_phy-temp', stamp: 202511 } },
      {
        selectorKey: 'mrm-sst',
        selection: { datasetId: 'cmems_mod_blk_phy-tem_mrm', stamp: 202311 },
      },
    ],
    ...overrides,
  };
}

/** A string-storing fake — exactly what crosses the wire, without a server. */
class FakeRedis implements RedisClientPort {
  readonly strings = new Map<string, string>();
  failing = false;

  get(key: string): Promise<string | null> {
    if (this.failing) return Promise.reject(new Error('connection reset'));
    return Promise.resolve(this.strings.get(key) ?? null);
  }
  // Fewer params than the port declares — TS allows it, and the TTL is irrelevant to the fake.
  setWithTtl(key: string, value: string): Promise<void> {
    if (this.failing) return Promise.reject(new Error('connection reset'));
    this.strings.set(key, value);
    return Promise.resolve();
  }
  setIfAbsent(): Promise<boolean> {
    return Promise.reject(new Error('not used by this cache'));
  }
  deleteIfValueEquals(): Promise<boolean> {
    return Promise.reject(new Error('not used by this cache'));
  }
  incrementWithTtl(): Promise<number> {
    return Promise.reject(new Error('not used by this cache'));
  }
  quit(): Promise<void> {
    return Promise.resolve();
  }
}

describe('CmemsStacResolutionCache', () => {
  let redis: FakeRedis;
  let metrics: UpstreamMetrics;
  let events: { level: string; message: string }[];
  let cache: CmemsStacResolutionCache;

  beforeEach(() => {
    redis = new FakeRedis();
    metrics = new UpstreamMetrics();
    events = [];
    jest.spyOn(metrics, 'event').mockImplementation((level, message) => {
      events.push({ level, message });
    });
    cache = new CmemsStacResolutionCache(redis, metrics, () => NOW);
  });

  it('round-trips a resolution through JSON strings, byte-identical in meaning', async () => {
    const stored = resolution();
    await cache.set(PRODUCT, stored);
    const read = await cache.get(PRODUCT);
    expect(read).toEqual({ resolution: stored, storedAtMs: NOW });
    // It really went through a string — the process-boundary property the null-redis suites skip.
    expect(typeof redis.strings.get(`marine:cmems:stac:${PRODUCT}`)).toBe('string');
  });

  describe('the stored-shape validator (review #82 I6): a legacy shape is a MISS, never a TypeError', () => {
    const legacyShapes: [string, unknown][] = [
      // The exact class the docblock cites: a rename leaves week-old entries without the field.
      ['missing temporalExtent', { ...resolution(), temporalExtent: undefined }],
      [
        'non-string extent bound',
        { ...resolution(), temporalExtent: { startUtc: 5, endUtc: null } },
      ],
      [
        'selection entry without a selection object',
        { ...resolution(), selections: [{ selectorKey: 'blk-sst' }] },
      ],
      [
        'selection with a non-string datasetId',
        { ...resolution(), selections: [{ selectorKey: 'blk-sst', selection: { datasetId: 7 } }] },
      ],
      ['missing license', { ...resolution(), license: undefined }],
      ['missing updateFrequency', { ...resolution(), updateFrequency: undefined }],
    ];

    it.each(legacyShapes)(
      '%s → null + a loud degrade, and set() can overwrite it',
      async (_name, legacy) => {
        redis.strings.set(
          `marine:cmems:stac:${PRODUCT}`,
          JSON.stringify({ resolution: legacy, storedAtMs: NOW }),
        );
        await expect(cache.get(PRODUCT)).resolves.toBeNull();
        expect(metrics.get('redis.degraded', 'cmems-stac')).toBeGreaterThan(0);
        // Self-heal contract: the invalid entry does not block the next tour's overwrite —
        // and the downgrade guard treats the unreadable previous entry as "no previous".
        await cache.set(PRODUCT, resolution());
        await expect(cache.get(PRODUCT)).resolves.not.toBeNull();
      },
    );

    it('unparseable JSON → null + degrade, never a throw', async () => {
      redis.strings.set(`marine:cmems:stac:${PRODUCT}`, '{not json');
      await expect(cache.get(PRODUCT)).resolves.toBeNull();
      expect(events).toContainEqual(expect.objectContaining({ level: 'warn' }));
    });
  });

  describe('fail-soft on a Redis fault, loudly (module docblock contract)', () => {
    it('a failing GET degrades to a miss', async () => {
      redis.failing = true;
      await expect(cache.get(PRODUCT)).resolves.toBeNull();
      expect(metrics.get('redis.degraded', 'cmems-stac')).toBe(1);
    });

    it('a failing SET drops the write without throwing', async () => {
      redis.failing = true;
      await expect(cache.set(PRODUCT, resolution())).resolves.toBeUndefined();
      // Both the pre-write read and the write itself degraded — counted, not hidden.
      expect(metrics.get('redis.degraded', 'cmems-stac')).toBe(2);
    });
  });

  describe('per-selector downgrade guard (review #82 I3)', () => {
    it('a selection regressing to null keeps the previous dataset id, loudly', async () => {
      await cache.set(PRODUCT, resolution());
      await cache.set(
        PRODUCT,
        resolution({
          selections: [
            { selectorKey: 'blk-sst', selection: { datasetId: null, reason: 'malformed items' } },
            {
              selectorKey: 'mrm-sst',
              selection: { datasetId: 'cmems_mod_blk_phy-tem_mrm', stamp: 202311 },
            },
          ],
        }),
      );
      const read = await cache.get(PRODUCT);
      expect(read?.resolution.selections).toEqual([
        // Kept: the previously-matching id, not the transient null.
        {
          selectorKey: 'blk-sst',
          selection: { datasetId: 'cmems_mod_blk_phy-temp', stamp: 202511 },
        },
        {
          selectorKey: 'mrm-sst',
          selection: { datasetId: 'cmems_mod_blk_phy-tem_mrm', stamp: 202311 },
        },
      ]);
      expect(events).toContainEqual(
        expect.objectContaining({
          level: 'warn',
          message: expect.stringContaining('regressed to null'),
        }),
      );
    });

    it('a re-resolved NON-NULL id overwrites unconditionally (the 400-heal primitive)', async () => {
      await cache.set(PRODUCT, resolution());
      const rotated = resolution({
        selections: [
          {
            selectorKey: 'blk-sst',
            selection: { datasetId: 'cmems_mod_blk_phy-temp_v2', stamp: 202512 },
          },
          {
            selectorKey: 'mrm-sst',
            selection: { datasetId: 'cmems_mod_blk_phy-tem_mrm', stamp: 202311 },
          },
        ],
      });
      await cache.set(PRODUCT, rotated);
      const read = await cache.get(PRODUCT);
      expect(read?.resolution).toEqual(rotated);
    });

    it('a selector that NEVER matched stays null — the guard preserves, never invents', async () => {
      await cache.set(
        PRODUCT,
        resolution({
          selections: [{ selectorKey: 'blk-sst', selection: { datasetId: null, reason: 'none' } }],
        }),
      );
      await cache.set(
        PRODUCT,
        resolution({
          selections: [{ selectorKey: 'blk-sst', selection: { datasetId: null, reason: 'none' } }],
        }),
      );
      const read = await cache.get(PRODUCT);
      expect(read?.resolution.selections[0]?.selection.datasetId).toBeNull();
    });
  });

  it('in-process mode (redis: null) applies the same downgrade guard', async () => {
    const memoryCache = new CmemsStacResolutionCache(null, metrics, () => NOW);
    await memoryCache.set(PRODUCT, resolution());
    await memoryCache.set(
      PRODUCT,
      resolution({
        selections: [
          { selectorKey: 'blk-sst', selection: { datasetId: null, reason: 'blip' } },
          {
            selectorKey: 'mrm-sst',
            selection: { datasetId: 'cmems_mod_blk_phy-tem_mrm', stamp: 202311 },
          },
        ],
      }),
    );
    const read = await memoryCache.get(PRODUCT);
    expect(read?.resolution.selections[0]?.selection.datasetId).toBe('cmems_mod_blk_phy-temp');
  });
});
