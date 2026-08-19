import { deflateSync } from 'node:zlib';
import { TILE_SIZE } from './tile-math';

/**
 * Builds REAL terrarium PNG bytes for tests. Test infrastructure, never shipped.
 *
 * ## SPEC INFRASTRUCTURE — excluded from `tsconfig.build.json`
 * It lives under `src/` for one reason: the unit lane only collects specs matching
 * `(tools|src)/`, so a builder and its spec have to sit here together. It is listed in
 * `tsconfig.build.json`'s `exclude`, the same treatment as `netcdf3-fixture.builder.ts` and
 * `era5-fixture.builder.ts`. As with those, the exclude keeps it from being compiled as a
 * build ROOT; it does not make emission impossible, so the rule "no production module
 * imports this" is held by review rather than by the compiler.
 *
 * ## Why a builder instead of a checked-in binary fixture
 * A committed `.png` would be an opaque blob nobody can review, and every new decoder case
 * would need another one. Generating the bytes means a test states the ELEVATIONS it wants
 * and gets a conforming file, so the failure message points at the elevation rather than at
 * a byte offset. It also proves something a static fixture cannot: the decoder is exercised
 * against all five PNG filter types, which is where hand-written decoders actually break.
 */

/** The eight bytes every PNG starts with. */
const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const BYTES_PER_PIXEL = 3;

const TERRARIUM_OFFSET_M = 32768;

/** PNG's CRC-32 table, built once on first use. */
let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable !== null) return crcTable;
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (table[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint32(value: number): Uint8Array {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Uint8Array.from([...type].map((character) => character.charCodeAt(0)));
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);

  const out = new Uint8Array(4 + body.length + 4);
  out.set(writeUint32(data.length), 0);
  out.set(body, 4);
  out.set(writeUint32(crc32(body)), 4 + body.length);
  return out;
}

/** Encode one elevation in metres back into the three terrarium channels. */
export function encodeTerrariumPixel(metres: number): [number, number, number] {
  const biased = Math.round((metres + TERRARIUM_OFFSET_M) * 256);
  return [(biased >> 16) & 0xff, (biased >> 8) & 0xff, biased & 0xff];
}

export interface TerrariumFixtureOptions {
  /** Defaults to `TILE_SIZE`. Smaller sizes exist to test the decoder's geometry refusal. */
  readonly width?: number;
  readonly height?: number;
  /** PNG filter type applied to EVERY scanline (0…4). Defaults to 0 (None). */
  readonly filterType?: 0 | 1 | 2 | 3 | 4;
  /** Override the declared bit depth / colour type / interlace, to test the refusals. */
  readonly bitDepth?: number;
  readonly colourType?: number;
  readonly interlace?: number;
}

/**
 * Build a conforming terrarium PNG whose pixel `(x, y)` carries `elevationAt(x, y)` metres.
 *
 * The filter is applied for real (the bytes are genuinely filtered, not written as type 0
 * with a lying header), so a decoder that mishandles Paeth fails here exactly as it would
 * against the provider.
 */
export function buildTerrariumTilePng(
  elevationAt: (x: number, y: number) => number,
  options: TerrariumFixtureOptions = {},
): Uint8Array {
  const width = options.width ?? TILE_SIZE;
  const height = options.height ?? TILE_SIZE;
  const filterType = options.filterType ?? 0;
  const stride = width * BYTES_PER_PIXEL;

  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = encodeTerrariumPixel(elevationAt(x, y));
      const base = y * stride + x * BYTES_PER_PIXEL;
      pixels[base] = red;
      pixels[base + 1] = green;
      pixels[base + 2] = blue;
    }
  }

  const rawWithFilters = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const outRow = y * (stride + 1);
    rawWithFilters[outRow] = filterType;
    for (let index = 0; index < stride; index += 1) {
      const current = pixels[y * stride + index] ?? 0;
      const left =
        index >= BYTES_PER_PIXEL ? (pixels[y * stride + index - BYTES_PER_PIXEL] ?? 0) : 0;
      const up = y > 0 ? (pixels[(y - 1) * stride + index] ?? 0) : 0;
      const upLeft =
        y > 0 && index >= BYTES_PER_PIXEL
          ? (pixels[(y - 1) * stride + index - BYTES_PER_PIXEL] ?? 0)
          : 0;

      let filtered: number;
      switch (filterType) {
        case 0:
          filtered = current;
          break;
        case 1:
          filtered = current - left;
          break;
        case 2:
          filtered = current - up;
          break;
        case 3:
          filtered = current - Math.floor((left + up) / 2);
          break;
        default: {
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
          filtered = current - paeth;
          break;
        }
      }

      rawWithFilters[outRow + 1 + index] = filtered & 0xff;
    }
  }

  const header = new Uint8Array(13);
  header.set(writeUint32(width), 0);
  header.set(writeUint32(height), 4);
  header[8] = options.bitDepth ?? 8;
  header[9] = options.colourType ?? 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = options.interlace ?? 0;

  const parts = [
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(rawWithFilters))),
    chunk('IEND', new Uint8Array(0)),
  ];

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

/**
 * A PNG whose IDAT inflates to far more than the geometry allows — the zip-bomb control.
 *
 * The header still declares a conforming 256×256 tile, so the ONLY thing standing between
 * this body and an unbounded allocation is the decoder's `maxOutputLength`. A test that
 * cannot produce this case cannot claim the ceiling works.
 */
export function buildOversizedIdatPng(inflatedBytes: number): Uint8Array {
  const header = new Uint8Array(13);
  header.set(writeUint32(TILE_SIZE), 0);
  header.set(writeUint32(TILE_SIZE), 4);
  header[8] = 8;
  header[9] = 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  // Zeros compress to almost nothing, which is exactly the shape of the attack: a tiny body
  // that costs the receiver orders of magnitude more memory than it cost the sender.
  const payload = new Uint8Array(inflatedBytes);

  const parts = [
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(payload))),
    chunk('IEND', new Uint8Array(0)),
  ];

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}
