import { EcmwfContractError } from '../ecmwf.errors';

/**
 * A minimal, read-only GRIB2 section walker — the fail-closed half of the decoder adapter.
 *
 * ## Why we parse the envelope ourselves when a decoder is already in the room
 * `@mattnucc/gribberish` is a controlled first implementation, not a permanent commitment
 * (DEC 2026-07-31d): it stays behind a narrow adapter, it must fail closed on anything it was
 * not pinned against, and ecCodes is the recorded independent fallback. "Fail closed" cannot be
 * delegated to the decoder — a decoder decides what it can decode, not what we are willing to
 * publish. So the bytes are inspected BEFORE they are handed over, against expectations that are
 * ours:
 *
 * - **edition 2**, grid template **3.0**, product template **4.0**, data representation template
 *   **5.42 (CCSDS/AEC)** — the exact combination measured on the live product. A provider that
 *   switches packing is a decision (migrate to ecCodes? accept the new template?), and a
 *   decision needs a loud refusal, not a best-effort decode;
 * - **the grid geometry, read from the message** — 1440 × 721, first row 90° N, first column
 *   **180° E**, scanning mode 0. The axis is the trap this whole leg is built around
 *   (`ecmwf-grid.ts`); reading it back from every message is what turns "the provider moved the
 *   axis" from a silently 180°-shifted number into an exception;
 * - **the parameter identification** (discipline / category / number), so the claim "these bytes
 *   are `10u`" — which comes from the `.index` file and the byte offset, never from the
 *   decoder's variable names — is one the message itself has to corroborate.
 *
 * ## Scope: nothing is decoded here
 * Not one packed value is unpacked in this file. It reads section headers at fixed offsets
 * defined by WMO FM 92 GRIB2 and stops. That is what keeps it small enough to be obviously
 * correct and cheap enough to run on every message.
 */

/** Where one GRIB2 message sits inside a buffer. */
export interface Grib2MessageLocation {
  /** Offset of the `GRIB` magic within the buffer. */
  readonly offset: number;
  /** Total message length, magic through the `7777` terminator. */
  readonly length: number;
}

/** Everything the envelope tells us about one message. */
export interface Grib2MessageProfile {
  readonly offset: number;
  readonly length: number;
  readonly edition: number;
  readonly discipline: number;
  readonly parameterCategory: number;
  readonly parameterNumber: number;
  readonly gridDefinitionTemplate: number;
  readonly productDefinitionTemplate: number;
  readonly dataRepresentationTemplate: number;
  readonly bitsPerValue: number;
  /** Section 3's total grid size: `columns * rows`, mask included. */
  readonly numberOfDataPoints: number;
  /** Columns (`Ni`) and rows (`Nj`). */
  readonly columns: number;
  readonly rows: number;
  readonly firstLatitude: number;
  readonly firstLongitude: number;
  readonly lastLatitude: number;
  readonly lastLongitude: number;
  readonly latitudeIncrement: number;
  readonly longitudeIncrement: number;
  readonly scanningMode: number;
  /**
   * Section 5's count: points that actually carry an encoded value.
   *
   * Equal to `numberOfDataPoints` for an unmasked field, and strictly smaller when a bitmap is
   * present — 665 628 of 1 038 240 for the wave fields, the other 372 612 being the land mask.
   * This is the number the decoded array's finite-value count must reproduce, which is how a
   * decoder that ignores the bitmap gets caught.
   */
  readonly numberOfEncodedValues: number;
  /** True when section 6 carries a bitmap (indicator 0). */
  readonly bitmapPresent: boolean;
  /** Model run / reference time, from section 1. */
  readonly referenceTimeUtc: Date;
  /** Forecast step, hours, from section 4. */
  readonly forecastHours: number;
  /** `referenceTimeUtc + forecastHours`. */
  readonly validTimeUtc: Date;
}

const GRIB_MAGIC = 0x47524942; // 'GRIB'
const GRIB_TERMINATOR = 0x37373737; // '7777'
const SECTION_0_LENGTH = 16;

/**
 * Locate every GRIB2 message in a buffer, in file order.
 *
 * A single HTTP `Range` response can legitimately hold more than one message — the `swh` and
 * `mwd` blocks are byte-adjacent at every measured step, so the range planner asks for both in
 * one request. The buffer must therefore decompose into whole messages with nothing between and
 * nothing left over; anything else means the bytes are not what the index described, and the
 * offsets we would use to say "this message is `mwd`" are not trustworthy.
 */
export function scanGribMessages(bytes: Uint8Array): Grib2MessageLocation[] {
  const view = toView(bytes);
  const locations: Grib2MessageLocation[] = [];
  let position = 0;

  while (position < bytes.length) {
    if (bytes.length - position < SECTION_0_LENGTH) {
      throw new EcmwfContractError(
        `trailing ${String(bytes.length - position)} byte(s) after the last GRIB message — too ` +
          `short to be another one. The buffer does not match the byte range that was requested.`,
      );
    }
    if (view.getUint32(position) !== GRIB_MAGIC) {
      throw new EcmwfContractError(
        `expected a GRIB message at byte ${String(position)} of the response, found ` +
          `0x${view.getUint32(position).toString(16).padStart(8, '0')}.`,
      );
    }

    const edition = view.getUint8(position + 7);
    if (edition !== 2) {
      throw new EcmwfContractError(
        `GRIB edition ${String(edition)} at byte ${String(position)}; only edition 2 is supported.`,
      );
    }

    // Total length is a 64-bit field. Every ECMWF Open Data message is a few MB, so a non-zero
    // high word means the header is not what we think it is rather than a genuinely huge message.
    if (view.getUint32(position + 8) !== 0) {
      throw new EcmwfContractError(
        `GRIB message at byte ${String(position)} declares a length above 4 GiB — refusing it.`,
      );
    }
    const length = view.getUint32(position + 12);
    if (length < SECTION_0_LENGTH + 4 || position + length > bytes.length) {
      throw new EcmwfContractError(
        `GRIB message at byte ${String(position)} declares length ${String(length)}, which does ` +
          `not fit the ${String(bytes.length)}-byte response.`,
      );
    }
    if (view.getUint32(position + length - 4) !== GRIB_TERMINATOR) {
      throw new EcmwfContractError(
        `GRIB message at byte ${String(position)} does not end with 7777 at its declared length ` +
          `${String(length)} — the message is truncated or the length field is wrong.`,
      );
    }

    locations.push({ offset: position, length });
    position += length;
  }

  if (locations.length === 0) {
    throw new EcmwfContractError('the response contains no GRIB messages.');
  }

  return locations;
}

/** Where one section starts inside the buffer, and how long it declares itself to be. */
export interface Grib2SectionExtent {
  readonly start: number;
  readonly length: number;
}

/**
 * Walk a message's sections and index them by section number.
 *
 * Sections are walked in order rather than assumed at fixed positions: section 2 (local use) is
 * optional, and ECMWF has been known to include it. A section that appears twice is refused —
 * GRIB2 permits several fields in one message by repeating sections 2–7, and every offset-based
 * claim we make about "the field in this message" would then be ambiguous.
 *
 * Exported so the golden-corpus tests can mutate a specific header field of a real message and
 * prove the refusal fires. A fail-closed guard nobody has ever seen fail closed is a comment.
 */
export function readSectionMap(
  bytes: Uint8Array,
  location: Grib2MessageLocation,
): ReadonlyMap<number, Grib2SectionExtent> {
  const view = toView(bytes);
  const { offset, length } = location;
  const sections = new Map<number, Grib2SectionExtent>();
  let position = offset + SECTION_0_LENGTH;
  const end = offset + length - 4; // everything before the 7777 terminator

  while (position < end) {
    if (end - position < 5) {
      throw new EcmwfContractError(
        `truncated GRIB section header at byte ${String(position)} of the message at ` +
          `${String(offset)}.`,
      );
    }
    const sectionLength = view.getUint32(position);
    const sectionNumber = view.getUint8(position + 4);
    if (sectionLength < 5 || position + sectionLength > end) {
      throw new EcmwfContractError(
        `GRIB section ${String(sectionNumber)} at byte ${String(position)} declares length ` +
          `${String(sectionLength)}, which runs past the end of the message.`,
      );
    }
    if (sections.has(sectionNumber)) {
      throw new EcmwfContractError(
        `GRIB section ${String(sectionNumber)} appears twice in the message at ` +
          `${String(offset)} — multi-field messages are not supported, because a byte offset ` +
          `would no longer identify a single field.`,
      );
    }
    sections.set(sectionNumber, { start: position, length: sectionLength });
    position += sectionLength;
  }

  return sections;
}

/**
 * Read one message's section headers into a profile.
 */
export function readMessageProfile(
  bytes: Uint8Array,
  location: Grib2MessageLocation,
): Grib2MessageProfile {
  const view = toView(bytes);
  const { offset, length } = location;

  const discipline = view.getUint8(offset + 6);
  const edition = view.getUint8(offset + 7);

  const sections = readSectionMap(bytes, location);

  const identification = requireSection(sections, 1, offset);
  const grid = requireSection(sections, 3, offset);
  const product = requireSection(sections, 4, offset);
  const representation = requireSection(sections, 5, offset);
  const bitmap = requireSection(sections, 6, offset);

  // ── Section 1: reference time (octets 13–19, 1-based) ────────────────────────
  const referenceTimeUtc = new Date(
    Date.UTC(
      view.getUint16(identification.start + 12),
      view.getUint8(identification.start + 14) - 1,
      view.getUint8(identification.start + 15),
      view.getUint8(identification.start + 16),
      view.getUint8(identification.start + 17),
      view.getUint8(identification.start + 18),
    ),
  );
  if (Number.isNaN(referenceTimeUtc.getTime())) {
    throw new EcmwfContractError(
      `GRIB section 1 of the message at ${String(offset)} carries an unreadable reference time.`,
    );
  }

  // ── Section 3: grid definition ──────────────────────────────────────────────
  const numberOfDataPoints = view.getUint32(grid.start + 6);
  const gridDefinitionTemplate = view.getUint16(grid.start + 12);
  // Template 3.0's own fields start at octet 15 of the section, i.e. index 14.
  const columns = view.getUint32(grid.start + 30);
  const rows = view.getUint32(grid.start + 34);
  const firstLatitude = readSignedMicroDegrees(view, grid.start + 46);
  const firstLongitude = readSignedMicroDegrees(view, grid.start + 50);
  const lastLatitude = readSignedMicroDegrees(view, grid.start + 55);
  const lastLongitude = readSignedMicroDegrees(view, grid.start + 59);
  const longitudeIncrement = readSignedMicroDegrees(view, grid.start + 63);
  const latitudeIncrement = readSignedMicroDegrees(view, grid.start + 67);
  const scanningMode = view.getUint8(grid.start + 71);

  // ── Section 4: product definition ───────────────────────────────────────────
  const productDefinitionTemplate = view.getUint16(product.start + 7);
  const parameterCategory = view.getUint8(product.start + 9);
  const parameterNumber = view.getUint8(product.start + 10);
  const timeRangeUnit = view.getUint8(product.start + 17);
  const forecastTime = view.getUint32(product.start + 18);
  if (timeRangeUnit !== 1) {
    // 1 = hour. Refused rather than converted: the whole ingest is built on 3-hourly steps, and a
    // message whose step is suddenly expressed in minutes or days is a product change we want to
    // read about before we serve it.
    throw new EcmwfContractError(
      `GRIB message at ${String(offset)} expresses its forecast time in time-range unit ` +
        `${String(timeRangeUnit)}; only 1 (hour) is supported.`,
    );
  }

  // ── Section 5: data representation ──────────────────────────────────────────
  const numberOfEncodedValues = view.getUint32(representation.start + 5);
  const dataRepresentationTemplate = view.getUint16(representation.start + 9);
  // Octet 20 of template 5.42, i.e. index 19 — also octet 20 in 5.0/5.2/5.3, but this profile is
  // only ever read after the template has been pinned, so no cross-template claim is made.
  const bitsPerValue = view.getUint8(representation.start + 19);

  // ── Section 6: bitmap indicator ─────────────────────────────────────────────
  const bitmapIndicator = view.getUint8(bitmap.start + 5);
  if (bitmapIndicator !== 0 && bitmapIndicator !== 255) {
    // 254 ("use the bitmap from a previous message") only has meaning inside a stream we read in
    // order and in full. We fetch single messages by byte range, so the previous message may
    // never have been downloaded at all — accepting it would mean decoding against a mask we do
    // not have.
    throw new EcmwfContractError(
      `GRIB message at ${String(offset)} uses bitmap indicator ${String(bitmapIndicator)}; only ` +
        `0 (bitmap present) and 255 (no bitmap) are supported.`,
    );
  }

  return {
    offset,
    length,
    edition,
    discipline,
    parameterCategory,
    parameterNumber,
    gridDefinitionTemplate,
    productDefinitionTemplate,
    dataRepresentationTemplate,
    bitsPerValue,
    numberOfDataPoints,
    columns,
    rows,
    firstLatitude,
    firstLongitude,
    lastLatitude,
    lastLongitude,
    latitudeIncrement,
    longitudeIncrement,
    scanningMode,
    numberOfEncodedValues,
    bitmapPresent: bitmapIndicator === 0,
    referenceTimeUtc,
    forecastHours: forecastTime,
    validTimeUtc: new Date(referenceTimeUtc.getTime() + forecastTime * 3_600_000),
  };
}

function requireSection(
  sections: ReadonlyMap<number, Grib2SectionExtent>,
  number: number,
  messageOffset: number,
): Grib2SectionExtent {
  const section = sections.get(number);
  if (section === undefined) {
    throw new EcmwfContractError(
      `GRIB message at ${String(messageOffset)} has no section ${String(number)}.`,
    );
  }
  return section;
}

/**
 * Read a GRIB2 angle: 32 bits, units of 1e-6 degrees, SIGN-AND-MAGNITUDE.
 *
 * WMO Regulation 92.1.5 puts the sign in the high bit rather than using two's complement, so
 * reading it with `getInt32` returns −2 147 393 648 for −90°. Every Turkish coastal point is in
 * the northern hemisphere, so the wrong reading would only ever surface at the grid's southern
 * edge — which is exactly the kind of bug that ships.
 */
function readSignedMicroDegrees(view: DataView, byteOffset: number): number {
  const raw = view.getUint32(byteOffset);
  const negative = (raw & 0x8000_0000) !== 0;
  const magnitude = raw & 0x7fff_ffff;
  return (negative ? -magnitude : magnitude) / 1e6;
}

/** A `DataView` over exactly this buffer's bytes, honouring any offset it was created with. */
function toView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
