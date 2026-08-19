import { describe, expect, it } from '@jest/globals';
import { BYTES_PER_DECODED_TILE, TerrainTileCache } from './tile-cache';
import { TILE_SIZE } from './tile-math';

describe('TerrainTileCache', () => {
  /**
   * A REAL-SIZED grid, tagged in cell 0 so cases can tell entries apart.
   *
   * Full size on purpose: the cache now refuses a grid of any other geometry, because its
   * ceiling is counted in tiles while the memory budget it defends is counted in bytes. A
   * one-cell fixture would test a cache that no production caller can use.
   */
  function gridOf(value: number): Int16Array {
    const grid = new Int16Array(TILE_SIZE * TILE_SIZE);
    grid[0] = value;
    return grid;
  }

  it('returns what it stored and counts the hit', () => {
    const cache = new TerrainTileCache(4);
    cache.set('12/2483/1575', gridOf(7));
    expect(cache.get('12/2483/1575')?.[0]).toBe(7);
    expect(cache.stats()).toMatchObject({ size: 1, hits: 1, misses: 0 });
  });

  it('reports a miss for an absent key instead of throwing', () => {
    const cache = new TerrainTileCache(4);
    expect(cache.get('12/1/1')).toBeNull();
    expect(cache.stats().misses).toBe(1);
  });

  it('evicts the LEAST RECENTLY USED entry, not the oldest inserted', () => {
    // The distinguishing case: A is written first but read again before C arrives, so a plain
    // FIFO would drop A and an LRU must drop B. Without this the cache degrades exactly on the
    // tiles a popular line keeps re-reading.
    const cache = new TerrainTileCache(2);
    cache.set('a', gridOf(1));
    cache.set('b', gridOf(2));
    expect(cache.get('a')?.[0]).toBe(1);

    cache.set('c', gridOf(3));

    expect(cache.get('a')?.[0]).toBe(1);
    expect(cache.get('b')).toBeNull();
    expect(cache.get('c')?.[0]).toBe(3);
    expect(cache.stats()).toMatchObject({ size: 2, evictions: 1 });
  });

  it('never grows past its ceiling', () => {
    const cache = new TerrainTileCache(3);
    for (let index = 0; index < 50; index += 1) {
      cache.set(`12/0/${String(index)}`, gridOf(index));
    }
    expect(cache.stats().size).toBe(3);
    expect(cache.stats().evictions).toBe(47);
  });

  it('overwrites a key in place rather than storing it twice', () => {
    const cache = new TerrainTileCache(4);
    cache.set('a', gridOf(1));
    cache.set('a', gridOf(2));
    expect(cache.stats().size).toBe(1);
    expect(cache.get('a')?.[0]).toBe(2);
  });

  it('refuses a ceiling below one instead of becoming a slow no-op', () => {
    expect(() => new TerrainTileCache(0)).toThrow(RangeError);
    expect(() => new TerrainTileCache(-1)).toThrow(RangeError);
    expect(() => new TerrainTileCache(1.5)).toThrow(RangeError);
  });

  it('evicts on the smallest LEGAL ceiling of one', () => {
    // The constructor's REJECTED side (0, -1, 1.5) is asserted above; this is the accepted
    // side of the same boundary, which the `while` loop has to handle without going negative.
    const cache = new TerrainTileCache(1);
    cache.set('a', gridOf(1));
    cache.set('b', gridOf(2));
    expect(cache.stats().size).toBe(1);
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')?.[0]).toBe(2);
  });

  it('counts a miss for a key that was evicted, not just for one never written', () => {
    const cache = new TerrainTileCache(1);
    cache.set('a', gridOf(1));
    cache.set('b', gridOf(2));
    const before = cache.stats().misses;
    expect(cache.get('a')).toBeNull();
    expect(cache.stats().misses).toBe(before + 1);
  });

  it('refuses a grid that is not one decoded tile', () => {
    // Without this the tiles-to-bytes conversion below is a convention rather than an
    // invariant, and the memory budget silently stops meaning what it says.
    const cache = new TerrainTileCache(4);
    expect(() => cache.set('a', Int16Array.from([1]))).toThrow(RangeError);
    expect(() => cache.set('a', new Int16Array(TILE_SIZE * TILE_SIZE + 1))).toThrow(RangeError);
    expect(cache.stats().size).toBe(0);
  });

  it('states the per-tile memory cost the ceiling is chosen against', () => {
    // The ceiling is configured in TILES; this is the conversion that makes it a memory
    // decision rather than an opaque number. 256 × 256 cells × 2 bytes = 128 KiB.
    expect(BYTES_PER_DECODED_TILE).toBe(131_072);
  });
});
