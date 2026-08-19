import { describe, expect, it } from '@jest/globals';
import { inflateSync } from 'node:zlib';
import {
  buildOversizedIdatPng,
  buildTerrariumTilePng,
  encodeTerrariumPixel,
} from './terrarium-fixture.builder';
import { TILE_SIZE } from './tile-math';

/**
 * The builder is test infrastructure, so it needs its own control: a fixture that is not
 * really a PNG would make every decoder refusal pass for the wrong reason, and a decoder test
 * suite cannot detect that from the inside.
 *
 * These assertions therefore look at the BYTES rather than at what the decoder makes of them.
 */
describe('terrarium fixture builder', () => {
  it('writes a real PNG signature and the four required chunk types in order', () => {
    const png = buildTerrariumTilePng(() => 100);
    expect(Array.from(png.subarray(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    const text = Buffer.from(png).toString('latin1');
    const ihdr = text.indexOf('IHDR');
    const idat = text.indexOf('IDAT');
    const iend = text.indexOf('IEND');
    expect(ihdr).toBeGreaterThan(0);
    expect(idat).toBeGreaterThan(ihdr);
    expect(iend).toBeGreaterThan(idat);
  });

  it('really deflates the scanlines — the IDAT is compressed, not stored raw', () => {
    const png = buildTerrariumTilePng(() => 0);
    // A conforming tile inflates to height × (1 + width × 3). A builder that skipped
    // compression would produce a file at least that large.
    expect(png.length).toBeLessThan(TILE_SIZE * (1 + TILE_SIZE * 3));
  });

  it('applies the declared filter for real instead of lying in the header', () => {
    // Filter 0 and filter 4 must produce DIFFERENT bytes for the same picture. If the builder
    // wrote type 4 in the header while emitting unfiltered rows, the decoder's Paeth branch
    // would never actually run and its test would prove nothing.
    const elevationAt = (x: number, y: number): number => x + y;
    const none = buildTerrariumTilePng(elevationAt, { filterType: 0 });
    const paeth = buildTerrariumTilePng(elevationAt, { filterType: 4 });
    expect(Buffer.from(none).equals(Buffer.from(paeth))).toBe(false);
  });

  it('encodes elevations the terrarium way, big-endian with the 32768 bias', () => {
    expect(encodeTerrariumPixel(0)).toEqual([128, 0, 0]);
    expect(encodeTerrariumPixel(-32768)).toEqual([0, 0, 0]);
    expect(encodeTerrariumPixel(1)).toEqual([128, 1, 0]);
  });

  it('builds a bomb whose declared body is small and whose inflated body is not', () => {
    const bomb = buildOversizedIdatPng(8 * 1024 * 1024);
    expect(bomb.length).toBeLessThan(100_000);

    // Prove the payload really does inflate to the promised size — otherwise the decoder's
    // ceiling test would pass against a body that was never oversized.
    const text = Buffer.from(bomb).toString('latin1');
    const idatIndex = text.indexOf('IDAT');
    const lengthView = new DataView(bomb.buffer, bomb.byteOffset + idatIndex - 4, 4);
    const declared = lengthView.getUint32(0);
    const payload = bomb.subarray(idatIndex + 4, idatIndex + 4 + declared);
    expect(inflateSync(payload).byteLength).toBe(8 * 1024 * 1024);
  });
});
