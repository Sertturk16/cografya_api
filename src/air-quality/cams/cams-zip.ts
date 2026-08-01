import { inflateRawSync } from 'node:zlib';
import { CamsContractError } from './cams.errors';

/**
 * Minimal ZIP container reader for the ADS `netcdf_zip` payload — zero dependencies.
 *
 * ## Scope, deliberately narrow (SPEC §5.1/§5.2-D3, measured)
 * The provider's archive is a pure CONTAINER: one entry, method 0 (STORED), no compression
 * (`comp == orig`, container parse measured at 0.1 ms). This reader accepts exactly that
 * shape, plus one loud fallback:
 *
 * - **entry count ≠ 1 → {@link CamsContractError}.** The entry NAME is `{MODEL}_{TYPE}.nc`
 *   and changes with the request (`ENS_FORECAST.nc` / `ENS_ANALYSIS.nc`), so the code NEVER
 *   looks an entry up by name — it takes the single entry or refuses.
 * - **method 0 (STORED)** → the body is a `subarray`, no inflate.
 * - **method 8 (DEFLATE)** → Node's built-in `inflateRawSync` with a hard output cap, plus a
 *   LOUD warning: the provider switching to compression is a behaviour-change signal worth a
 *   human's eyes even though the bytes still decode.
 * - **any other method → {@link CamsContractError}.** No silent acceptance.
 *
 * ZIP64 markers are refused outright: the production file is ~25 MiB and a 4 GiB+ archive
 * here means the provider changed shape under us.
 */

/** Hard ceiling on the inflated size — mirrors the `AIR_QUALITY_RUN_MAX_BYTES` default (A2). */
export const MAX_INFLATED_BYTES = 268_435_456;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
/** Fixed part of the end-of-central-directory record. */
const EOCD_MIN_BYTES = 22;
/** The EOCD comment length field is u16, so the EOCD starts within the last 22+65535 bytes. */
const EOCD_SEARCH_WINDOW = EOCD_MIN_BYTES + 0xffff;

export interface ZipSingleEntry {
  /** Entry name, recorded as evidence — never used for lookup. */
  name: string;
  /** Compression method from the central directory (0 = STORED, 8 = DEFLATE). */
  method: number;
  /** The entry's bytes, decompressed when necessary. */
  bytes: Uint8Array;
}

interface ZipReadOptions {
  /** Cap applied to a DEFLATE entry's inflated size. */
  maxInflatedBytes?: number;
  /** Receives the loud DEFLATE warning; defaults to `console.warn`. */
  warn?: (message: string) => void;
}

/** Extract the single entry of a CAMS `netcdf_zip` archive, fail-closed. */
export function extractSingleZipEntry(
  archive: Uint8Array,
  options: ZipReadOptions = {},
): ZipSingleEntry {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  if (archive.byteLength < EOCD_MIN_BYTES) {
    throw new CamsContractError(
      `archive is ${String(archive.byteLength)} bytes — smaller than an empty ZIP.`,
    );
  }

  // ── end of central directory ─────────────────────────────────────────────
  const searchStart = Math.max(0, archive.byteLength - EOCD_SEARCH_WINDOW);
  let eocdOffset = -1;
  for (let offset = archive.byteLength - EOCD_MIN_BYTES; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new CamsContractError('no end-of-central-directory record — not a ZIP archive.');
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  if (entryCount === 0xffff || centralDirectoryOffset === 0xffffffff) {
    throw new CamsContractError('ZIP64 markers present — refusing a >4 GiB-shaped archive.');
  }
  if (entryCount !== 1) {
    throw new CamsContractError(
      `expected exactly ONE entry, found ${String(entryCount)} — the provider's container ` +
        'shape changed.',
    );
  }

  // ── the single central-directory record ──────────────────────────────────
  if (centralDirectoryOffset + 46 > archive.byteLength) {
    throw new CamsContractError('central directory offset points outside the archive.');
  }
  if (view.getUint32(centralDirectoryOffset, true) !== CENTRAL_DIRECTORY_SIGNATURE) {
    throw new CamsContractError('central directory signature mismatch.');
  }
  const method = view.getUint16(centralDirectoryOffset + 10, true);
  const compressedSize = view.getUint32(centralDirectoryOffset + 20, true);
  const uncompressedSize = view.getUint32(centralDirectoryOffset + 24, true);
  const nameLength = view.getUint16(centralDirectoryOffset + 28, true);
  const localHeaderOffset = view.getUint32(centralDirectoryOffset + 42, true);
  if (
    compressedSize === 0xffffffff ||
    uncompressedSize === 0xffffffff ||
    localHeaderOffset === 0xffffffff
  ) {
    throw new CamsContractError('ZIP64 size/offset markers present — refusing.');
  }
  // The entry name is provider-controlled input that ends up in logs and the evidence
  // artifact: control/format characters are replaced (visibly, with U+FFFD — tampering should
  // show, not vanish) and the length is capped before it goes anywhere.
  const name = new TextDecoder('utf-8')
    .decode(archive.subarray(centralDirectoryOffset + 46, centralDirectoryOffset + 46 + nameLength))
    .replace(/[\p{Cc}\p{Cf}]/gu, '�')
    .slice(0, 128);

  // ── the local header, where the body actually starts ────────────────────
  if (localHeaderOffset + 30 > archive.byteLength) {
    throw new CamsContractError('local header offset points outside the archive.');
  }
  if (view.getUint32(localHeaderOffset, true) !== LOCAL_HEADER_SIGNATURE) {
    throw new CamsContractError('local file header signature mismatch.');
  }
  const localNameLength = view.getUint16(localHeaderOffset + 26, true);
  const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
  const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
  if (dataStart + compressedSize > archive.byteLength) {
    throw new CamsContractError('entry body extends past the end of the archive.');
  }
  const rawBody = archive.subarray(dataStart, dataStart + compressedSize);

  if (method === 0) {
    if (compressedSize !== uncompressedSize) {
      throw new CamsContractError(
        `STORED entry declares compressed ${String(compressedSize)} ≠ uncompressed ` +
          `${String(uncompressedSize)} bytes.`,
      );
    }
    return { name, method, bytes: rawBody };
  }

  if (method === 8) {
    const cap = options.maxInflatedBytes ?? MAX_INFLATED_BYTES;
    const warn = options.warn ?? ((message: string): void => console.warn(message));
    // LOUD by design: the measured provider behaviour is STORED. DEFLATE decoding still
    // works, but the switch itself is a provider-behaviour-change signal (SPEC §5.2-D3).
    warn(
      `[cams] ZIP entry "${name}" is DEFLATE-compressed — the provider has changed from the ` +
        'measured STORED container. Decoding anyway; treat this as a behaviour-change signal.',
    );
    if (uncompressedSize > cap) {
      throw new CamsContractError(
        `declared inflated size ${String(uncompressedSize)} exceeds the ${String(cap)} byte cap.`,
      );
    }
    let inflated: Buffer;
    try {
      inflated = inflateRawSync(rawBody, { maxOutputLength: cap });
    } catch (error: unknown) {
      throw new CamsContractError('DEFLATE entry failed to inflate.', { cause: error });
    }
    if (inflated.byteLength !== uncompressedSize) {
      throw new CamsContractError(
        `inflated to ${String(inflated.byteLength)} bytes but the directory declared ` +
          `${String(uncompressedSize)}.`,
      );
    }
    return { name, method, bytes: new Uint8Array(inflated) };
  }

  throw new CamsContractError(
    `unsupported ZIP compression method ${String(method)} — only STORED (0) and DEFLATE (8) ` +
      'are contracted.',
  );
}
