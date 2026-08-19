import { inflateSync } from 'node:zlib';
import { TILE_SIZE } from './tile-math';

/**
 * Terrarium PNG → an elevation grid, decoded in-process with no image library.
 *
 * ## Why a hand-written decoder rather than a dependency
 * This repo already decodes two binary provider formats by hand (`cams/netcdf3.ts`,
 * `cams/cams-zip.ts`) for the same reason that applies here: the surface we need is a
 * fraction of what a general library carries, and every byte of a third-party image parser
 * would be exposed to a remote provider's output on a public, unauthenticated path. The
 * subset we support is exactly what the provider serves and nothing else — an interlaced,
 * palette, 16-bit or greyscale PNG is REFUSED rather than handled.
 *
 * ## What it refuses, and why each refusal exists
 * Every check below is a bound on untrusted input, not a validation nicety:
 *
 * 1. **Signature + `IHDR` first** — so a non-PNG body is rejected before any allocation.
 * 2. **The exact geometry we expect** (256×256, 8-bit, colour type 2, no interlace). A
 *    provider that starts serving something else must stop the profile loudly, not have its
 *    output silently misread as elevations.
 * 3. **A hard inflate ceiling.** The decompressed size of a conforming tile is known exactly
 *    — `height × (1 + width × 3)` — so the cap is that number, not a guess. Without it a
 *    zip-bomb body inflates until the process dies, and this path is reachable by anyone who
 *    can answer as the provider.
 * 4. **A chunk-length sanity bound** before any `subarray`, so a corrupt or hostile length
 *    field cannot walk the reader off the end of the buffer or spin it in place.
 *
 * CRC is deliberately NOT verified: it protects against accidental corruption, and a corrupt
 * body already fails inflate or the geometry checks. Skipping it keeps the hot path short and
 * removes a table nobody would otherwise need. (The fixture builder beside this file DOES
 * compute CRCs, because a real decoder must be able to read what it produces.)
 */

/** The eight bytes every PNG starts with. */
const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Bytes per pixel for colour type 2 (truecolour RGB) at bit depth 8. */
const BYTES_PER_PIXEL = 3;

/**
 * The terrarium zero point. A pixel of `(128, 0, 0)` is exactly sea level, and `(0, 0, 0)` is
 * −32768 m — see {@link decodeTerrariumMetres}.
 */
const TERRARIUM_OFFSET_M = 32768;

/** The storage range of the decoded grid. Exported so the spec pins the saturation boundary. */
export const INT16_MIN = -32768;
export const INT16_MAX = 32767;

/** Raised for any body that is not the tile shape we contracted for. */
export class TerrainTileFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TerrainTileFormatError';
  }
}

/**
 * One pixel's elevation in metres, at full terrarium precision (1/256 m).
 *
 * The published formula (SPEC §7.3, verified against five points): the three channels are a
 * big-endian fixed-point number with a 32768 m bias.
 */
export function decodeTerrariumMetres(red: number, green: number, blue: number): number {
  return red * 256 + green + blue / 256 - TERRARIUM_OFFSET_M;
}

interface PngChunk {
  readonly type: string;
  readonly data: Uint8Array;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  const b0 = bytes[offset];
  const b1 = bytes[offset + 1];
  const b2 = bytes[offset + 2];
  const b3 = bytes[offset + 3];
  if (b0 === undefined || b1 === undefined || b2 === undefined || b3 === undefined) {
    throw new TerrainTileFormatError('truncated PNG: a 4-byte field runs past the end');
  }
  // `>>> 0` keeps a length with the high bit set from arriving as a negative number, which
  // would sail past a `> max` bound check and then be handed to `subarray`.
  return ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
}

function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/**
 * Walk the chunk stream, collecting what we need and skipping what we do not.
 *
 * Stops at `IEND`. Ancillary chunks (`tEXt`, `pHYs`, …) are skipped rather than refused — the
 * provider is free to add metadata, and refusing an unknown ancillary chunk would make our
 * decoder brittle against a change that cannot affect a single elevation value.
 */
function readChunks(bytes: Uint8Array): PngChunk[] {
  const chunks: PngChunk[] = [];
  let offset = PNG_SIGNATURE.length;

  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset);

    // The bound is the buffer itself: a length field claiming more than the remaining body
    // is either corruption or an attempt to make the reader address memory it never
    // received. Either way the tile is unusable.
    if (length > bytes.length - offset - 12) {
      throw new TerrainTileFormatError(
        `PNG chunk declares ${String(length)} bytes but only ` +
          `${String(bytes.length - offset - 12)} remain`,
      );
    }

    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });

    if (type === 'IEND') break;

    // 4 length + 4 type + payload + 4 CRC. `length` is bounded above, so this always
    // advances by at least 12 bytes and the loop cannot stall.
    offset += 12 + length;
  }

  return chunks;
}

/**
 * Reverse the per-scanline PNG filters, in place, over the inflated bytes.
 *
 * The five filter types are defined against the pixel to the LEFT (`a`), the pixel ABOVE
 * (`b`) and the one above-left (`c`). All arithmetic is mod 256; the `& 0xff` is load-bearing,
 * not defensive.
 */
function unfilterScanlines(raw: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * BYTES_PER_PIXEL;
  const output = new Uint8Array(stride * height);

  for (let row = 0; row < height; row += 1) {
    const filterOffset = row * (stride + 1);
    const filterType = raw[filterOffset];
    if (filterType === undefined) {
      throw new TerrainTileFormatError(`inflated data ends before scanline ${String(row)}`);
    }

    for (let index = 0; index < stride; index += 1) {
      const rawByte = raw[filterOffset + 1 + index] ?? 0;
      const left =
        index >= BYTES_PER_PIXEL ? (output[row * stride + index - BYTES_PER_PIXEL] ?? 0) : 0;
      const up = row > 0 ? (output[(row - 1) * stride + index] ?? 0) : 0;
      const upLeft =
        row > 0 && index >= BYTES_PER_PIXEL
          ? (output[(row - 1) * stride + index - BYTES_PER_PIXEL] ?? 0)
          : 0;

      let value: number;
      switch (filterType) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = rawByte + left;
          break;
        case 2:
          value = rawByte + up;
          break;
        case 3:
          value = rawByte + Math.floor((left + up) / 2);
          break;
        case 4: {
          const prediction = left + up - upLeft;
          const distanceLeft = Math.abs(prediction - left);
          const distanceUp = Math.abs(prediction - up);
          const distanceUpLeft = Math.abs(prediction - upLeft);
          const paeth =
            distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft
              ? left
              : distanceUp <= distanceUpLeft
                ? up
                : upLeft;
          value = rawByte + paeth;
          break;
        }
        default:
          throw new TerrainTileFormatError(
            `unsupported PNG filter type ${String(filterType)} on scanline ${String(row)}`,
          );
      }

      output[row * stride + index] = value & 0xff;
    }
  }

  return output;
}

/**
 * Decode one terrarium tile body into a grid of elevations in WHOLE METRES.
 *
 * ## Why `Int16Array` and why whole metres
 * The published value is an integer metre in any case (SPEC §6.6 forbids a decimal, because
 * the DEM's own error is tens of metres — the measured worst case is ~88 m at Erciyes,
 * SPEC §7.3). Rounding here rather than at the end costs at most 0.5 m per sample, and buys a
 * grid that is 128 KiB instead of 256 KiB — which is the difference between a tile cache that
 * fits in a small deployment's heap and one that does not.
 *
 * Türkiye's range (0 … ~5137 m) sits far inside `Int16`, and so does the terrarium floor
 * (−32768 exactly).
 *
 * ## The CEILING is saturated, not wrapped — and that is a security property
 * The encoding's top pixel `(255, 255, 255)` decodes to 32767.996 m, which rounds to 32768:
 * one past `Int16`'s maximum, where a plain typed-array store WRAPS to −32768. That is the
 * one number this module must never produce by accident, because −32768 is also the
 * legitimate terrarium floor — so a hostile or corrupt pixel would arrive downstream
 * disguised as a valid reading, in a module whose entire design is loud refusal (review #122
 * CODE122-M1 / SFH122-M5 / TA122-I3, verified: `Math.round(32767.996)` stored in an
 * `Int16Array` yields −32768).
 *
 * Saturation rather than refusal is deliberate. Refusing the tile would need a physical
 * plausibility band, and the floor value is a legitimate no-data marker in this encoding — a
 * band tight enough to reject 32768 m would also reject a tile that is honestly full of
 * floor markers. Clamping removes the sign flip, which is the actual defect: an absurd
 * reading stays absurd and stays positive, instead of impersonating the floor.
 */
export function decodeTerrainTile(body: Uint8Array): Int16Array {
  if (!hasPngSignature(body)) {
    throw new TerrainTileFormatError('body does not start with the PNG signature');
  }

  const chunks = readChunks(body);
  const header = chunks.find((chunk) => chunk.type === 'IHDR');
  if (header === undefined || header.data.length < 13) {
    throw new TerrainTileFormatError('PNG has no usable IHDR chunk');
  }

  const width = readUint32(header.data, 0);
  const height = readUint32(header.data, 4);
  const bitDepth = header.data[8];
  const colourType = header.data[9];
  const compression = header.data[10];
  const filterMethod = header.data[11];
  const interlace = header.data[12];

  // Checked BEFORE inflating: the geometry is what decides the inflate ceiling, so reading it
  // from an unvalidated header would let the ceiling be chosen by the attacker.
  if (width !== TILE_SIZE || height !== TILE_SIZE) {
    throw new TerrainTileFormatError(
      `expected a ${String(TILE_SIZE)}×${String(TILE_SIZE)} tile, got ` +
        `${String(width)}×${String(height)}`,
    );
  }
  if (bitDepth !== 8 || colourType !== 2) {
    throw new TerrainTileFormatError(
      `expected 8-bit truecolour RGB (depth 8, colour type 2), got depth ${String(bitDepth)} ` +
        `colour type ${String(colourType)}`,
    );
  }
  if (compression !== 0 || filterMethod !== 0) {
    throw new TerrainTileFormatError('PNG uses a non-standard compression or filter method');
  }
  if (interlace !== 0) {
    throw new TerrainTileFormatError('interlaced PNG is not supported');
  }

  const idatChunks = chunks.filter((chunk) => chunk.type === 'IDAT');
  if (idatChunks.length === 0) {
    throw new TerrainTileFormatError('PNG carries no IDAT chunk');
  }

  const compressedLength = idatChunks.reduce((total, chunk) => total + chunk.data.length, 0);
  const compressed = new Uint8Array(compressedLength);
  let writeOffset = 0;
  for (const chunk of idatChunks) {
    compressed.set(chunk.data, writeOffset);
    writeOffset += chunk.data.length;
  }

  // The EXACT conforming size, not a guess: one filter byte per row plus the row itself.
  const expectedInflatedBytes = height * (1 + width * BYTES_PER_PIXEL);

  let inflated: Buffer;
  try {
    inflated = inflateSync(compressed, { maxOutputLength: expectedInflatedBytes });
  } catch (error: unknown) {
    throw new TerrainTileFormatError(
      `IDAT stream failed to inflate within ${String(expectedInflatedBytes)} bytes: ` +
        `${error instanceof Error ? error.message : 'unknown zlib failure'}`,
    );
  }

  if (inflated.byteLength !== expectedInflatedBytes) {
    throw new TerrainTileFormatError(
      `inflated to ${String(inflated.byteLength)} bytes, expected ` +
        `${String(expectedInflatedBytes)}`,
    );
  }

  const pixels = unfilterScanlines(new Uint8Array(inflated), width, height);
  const grid = new Int16Array(width * height);

  for (let index = 0; index < width * height; index += 1) {
    const base = index * BYTES_PER_PIXEL;
    const metres = decodeTerrariumMetres(
      pixels[base] ?? 0,
      pixels[base + 1] ?? 0,
      pixels[base + 2] ?? 0,
    );
    // Saturating store. See the docblock: without the upper clamp the encoding's top pixel
    // wraps to the floor value and an absurd reading becomes indistinguishable from a valid one.
    grid[index] = Math.max(INT16_MIN, Math.min(INT16_MAX, Math.round(metres)));
  }

  return grid;
}
