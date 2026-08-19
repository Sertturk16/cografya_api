import { describe, expect, it } from '@jest/globals';
import { BYTES_PER_DECODED_TILE, TerrainTileCache } from './tile-cache';

describe('TerrainTileCache', () => {
  function gridOf(value: number): Int16Array {
    return Int16Array.from([value]);
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

  it('states the per-tile memory cost the ceiling is chosen against', () => {
    // The ceiling is configured in TILES; this is the conversion that makes it a memory
    // decision rather than an opaque number. 256 × 256 cells × 2 bytes = 128 KiB.
    expect(BYTES_PER_DECODED_TILE).toBe(131_072);
  });
});
