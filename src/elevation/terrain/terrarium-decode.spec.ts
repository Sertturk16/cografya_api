import { describe, expect, it } from '@jest/globals';
import {
  INT16_MAX,
  INT16_MIN,
  TerrainTileFormatError,
  decodeTerrainTile,
  decodeTerrariumMetres,
} from './terrarium-decode';
import {
  buildOversizedIdatPng,
  buildTerrariumTilePng,
  encodeTerrariumPixel,
} from './terrarium-fixture.builder';
import { TILE_SIZE } from './tile-math';

/**
 * Two halves, and both are needed. The FORMULA half pins the three published anchor points of
 * the terrarium encoding. The FORMAT half pins every refusal, each against a body the fixture
 * builder really produces — a refusal asserted with a hand-typed byte array tests the array,
 * not the decoder.
 */
describe('terrarium decoding', () => {
  describe('the encoding formula', () => {
    it('pins the three anchor points of the terrarium scale', () => {
      // Not facts about the world: these are the definition of the encoding itself, the same
      // class as "UTF-8 encodes A as 0x41". The scale's floor, its sea level and its unit.
      expect(decodeTerrariumMetres(0, 0, 0)).toBe(-32768);
      expect(decodeTerrariumMetres(128, 0, 0)).toBe(0);
      expect(decodeTerrariumMetres(128, 1, 0)).toBe(1);
    });

    it('is monotonic in every channel', () => {
      expect(decodeTerrariumMetres(129, 0, 0)).toBeGreaterThan(decodeTerrariumMetres(128, 0, 0));
      expect(decodeTerrariumMetres(128, 5, 0)).toBeGreaterThan(decodeTerrariumMetres(128, 4, 0));
      expect(decodeTerrariumMetres(128, 0, 5)).toBeGreaterThan(decodeTerrariumMetres(128, 0, 4));
    });

    it('carries sub-metre precision in the blue channel', () => {
      expect(decodeTerrariumMetres(128, 0, 128)).toBeCloseTo(0.5, 10);
    });

    it('round-trips through the fixture encoder', () => {
      for (const metres of [-32768, -412, 0, 1, 904, 1647.5, 3829.28, 5137]) {
        const [red, green, blue] = encodeTerrariumPixel(metres);
        expect(decodeTerrariumMetres(red, green, blue)).toBeCloseTo(metres, 2);
      }
    });
  });

  describe('the tile decoder', () => {
    it('decodes a conforming tile under every PNG filter type', () => {
      // A gradient in both axes, so a decoder that mixes up rows and columns, or loses the
      // previous scanline, cannot pass by symmetry. Filters 1–4 all reference neighbouring
      // bytes, which is exactly where a hand-written unfilter breaks.
      const elevationAt = (x: number, y: number): number => x * 2 + y * 3 - 100;

      for (const filterType of [0, 1, 2, 3, 4] as const) {
        const png = buildTerrariumTilePng(elevationAt, { filterType });
        const grid = decodeTerrainTile(png);

        expect(grid).toHaveLength(TILE_SIZE * TILE_SIZE);
        for (const [x, y] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [255, 255],
          [17, 200],
        ] as const) {
          expect(grid[y * TILE_SIZE + x]).toBe(elevationAt(x, y));
        }
      }
    });

    it('returns whole metres, rounding the sub-metre part away', () => {
      const png = buildTerrariumTilePng(() => 1647.5);
      const grid = decodeTerrainTile(png);
      // 1647.5 rounds to 1648 — the published value is an integer by SPEC §6.6, and the
      // rounding happens here rather than at the response so the cache holds one form only.
      expect(grid[0]).toBe(1648);
    });

    it('carries the terrarium floor and a deep-negative value through Int16 intact', () => {
      const png = buildTerrariumTilePng(() => -32768);
      expect(decodeTerrainTile(png)[0]).toBe(-32768);
    });

    it('SATURATES at the top of the range instead of wrapping onto the floor value', () => {
      // The twin of the floor test, and the one that matters for untrusted input. The maximum
      // encodable pixel (255,255,255) decodes to 32767.996, rounds to 32768, and a plain
      // `Int16Array` store wraps that to -32768 — the exact value the floor test above pins.
      // A hostile or corrupt tile would then deliver an absurd reading wearing the floor's
      // clothes, and no downstream range check could tell them apart.
      const png = buildTerrariumTilePng(() => 32767.99609375);
      const grid = decodeTerrainTile(png);
      expect(grid[0]).toBe(INT16_MAX);
      expect(grid[0]).not.toBe(INT16_MIN);
    });

    // There is deliberately NO bottom-saturation case. One was added in the first fix round
    // and removed here: it built a −32768 tile and expected −32768, which is byte-identical
    // to the floor test above and stays GREEN on the unclamped code the round was fixing —
    // so it pinned nothing. The reason no such test can exist is structural: the channels are
    // bytes, the encoding's minimum is exactly −32768, and no decoded value can fall below
    // it, so the lower branch is unreachable and is now absent from the production code too
    // (review #122, TA122R2-M1). A test whose name claims a symmetry the suite cannot
    // demonstrate teaches the next reader that the clamp was never load-bearing.

    it('refuses a body that is not a PNG at all', () => {
      expect(() => decodeTerrainTile(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow(
        TerrainTileFormatError,
      );
      // An HTML error page served with the wrong content type is the realistic shape of this.
      expect(() => decodeTerrainTile(new TextEncoder().encode('<html>404</html>'))).toThrow(
        TerrainTileFormatError,
      );
    });

    it('refuses a tile whose geometry is not 256×256', () => {
      const png = buildTerrariumTilePng(() => 0, { width: 64, height: 64 });
      expect(() => decodeTerrainTile(png)).toThrow(/expected a 256×256 tile/);
    });

    it('refuses a declared bit depth or colour type we do not decode', () => {
      expect(() => decodeTerrainTile(buildTerrariumTilePng(() => 0, { bitDepth: 16 }))).toThrow(
        /8-bit truecolour/,
      );
      expect(() => decodeTerrainTile(buildTerrariumTilePng(() => 0, { colourType: 6 }))).toThrow(
        /8-bit truecolour/,
      );
    });

    it('refuses an interlaced PNG rather than misreading it', () => {
      expect(() => decodeTerrainTile(buildTerrariumTilePng(() => 0, { interlace: 1 }))).toThrow(
        /interlaced/,
      );
    });

    it('caps a zip-bomb IDAT at the geometry’s exact inflated size', () => {
      // 40 MB of zeros compresses to a few KB. Without the ceiling this allocates 40 MB per
      // call on a public, unauthenticated path — and the caller controls how many calls.
      const bomb = buildOversizedIdatPng(40 * 1024 * 1024);
      expect(bomb.length).toBeLessThan(200_000);
      expect(() => decodeTerrainTile(bomb)).toThrow(TerrainTileFormatError);
    });

    it('refuses a chunk length that points past the end of the body', () => {
      const png = buildTerrariumTilePng(() => 0);
      const corrupted = Uint8Array.from(png);
      // Overwrite the IHDR length field (the first 4 bytes after the signature) with a value
      // far larger than the body. An unbounded reader would `subarray` off the end and then
      // decode whatever it found.
      //
      // All four bytes are 0xff ON PURPOSE. `readUint32`'s `>>> 0` only bites when the high
      // bit is SET: 0x7fffffff trips the bound with or without the cast, so a test using it
      // would pass with the guard deleted, while 0xffffffff without the cast is -1 — which
      // sails past `length > remaining` and walks the chunk reader off course (review #122,
      // TA122-M1).
      corrupted[8] = 0xff;
      corrupted[9] = 0xff;
      corrupted[10] = 0xff;
      corrupted[11] = 0xff;
      expect(() => decodeTerrainTile(corrupted)).toThrow(TerrainTileFormatError);
    });

    it('refuses a PNG with no IDAT chunk', () => {
      const png = buildTerrariumTilePng(() => 0);
      // Rename the IDAT type bytes to an ancillary chunk the decoder legitimately skips; the
      // body then parses cleanly and carries no pixel data at all.
      const text = Buffer.from(png).toString('latin1');
      const idatIndex = text.indexOf('IDAT');
      expect(idatIndex).toBeGreaterThan(0);
      const stripped = Uint8Array.from(png);
      stripped.set(new TextEncoder().encode('tEXt'), idatIndex);
      expect(() => decodeTerrainTile(stripped)).toThrow(/no IDAT/);
    });

    it('skips ancillary chunks instead of refusing them', () => {
      // The provider may add metadata at any time, and a decoder that refused an unknown
      // ancillary chunk would break on a change that cannot affect one elevation.
      const png = buildTerrariumTilePng(() => 250);
      const marker = Buffer.from('tEXtnote\u0000hello', 'latin1');
      const chunkBytes = new Uint8Array(4 + marker.length + 4);
      const view = new DataView(chunkBytes.buffer);
      view.setUint32(0, marker.length - 4);
      chunkBytes.set(marker, 4);
      // CRC is not verified by the decoder, so zeros here are fine and the test says why.
      const withText = new Uint8Array(png.length + chunkBytes.length);
      withText.set(png.subarray(0, 8), 0);
      withText.set(chunkBytes, 8);
      withText.set(png.subarray(8), 8 + chunkBytes.length);

      expect(decodeTerrainTile(withText)[0]).toBe(250);
    });
  });
});
