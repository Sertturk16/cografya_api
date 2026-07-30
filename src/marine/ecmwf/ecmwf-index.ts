import type { EcmwfParam } from './ecmwf.constants';
import { EcmwfContractError } from './ecmwf.errors';

/**
 * The `.index` sidecar every ECMWF Open Data GRIB file ships with, and the byte-range planning
 * built on it.
 *
 * ## The format is JSON-LINES, and the provider says otherwise
 * `data.ecmwf.int` serves these files with `Content-Type: application/json` — and they are not
 * JSON. Measured (olcumler.md §M5): `JSON.parse` over the whole file fails with
 * `Extra data: line 2 column 1`, because each LINE is a separate JSON object. A parser written
 * from the declared content type breaks on the very first cycle, which is the good outcome; the
 * bad one is a `try { JSON.parse } catch { return [] }` that turns it into "this step has no
 * data". Hence: line-by-line, and a bad line is an error, never an empty result.
 *
 * ## Why we parse it ourselves rather than use the decoder's index reader
 * `@mattnucc/gribberish` ships a `parseGribIndex`. Using it would put the byte-range planning —
 * the part that decides WHICH bytes we pay to download and which parameter they are believed to
 * be — behind the same dependency we are hedging against (DEC 2026-07-31d: narrow adapter,
 * ecCodes as the recorded independent fallback). This file is ~80 lines of text handling with no
 * native code in it, and it stays ours.
 */

/** One `.index` line: a single GRIB message and where it lives in the file. */
export interface EcmwfIndexRecord {
  /** MARS parameter name, verbatim (`10u`, `swh`, …) — the ONLY key we map bytes to meaning by. */
  readonly param: string;
  /** Byte offset of the message inside the GRIB file. */
  readonly offset: number;
  /** Message length in bytes. */
  readonly length: number;
  /** Cycle date, `YYYYMMDD`, verbatim. */
  readonly date: string;
  /** Cycle hour, `HHMM`, verbatim. */
  readonly time: string;
  /** Forecast step, verbatim (hours as a string, as the provider writes it). */
  readonly step: string;
  /** Stream, verbatim (`oper`, `wave`). */
  readonly stream: string;
  /** 1-based line number, for error messages that point at the offending line. */
  readonly lineNumber: number;
}

/** A contiguous byte range to request, and the messages it is expected to contain. */
export interface EcmwfByteRange {
  /** First byte, inclusive — the `Range: bytes=start-endInclusive` lower bound. */
  readonly start: number;
  /** Last byte, INCLUSIVE, as HTTP ranges are. */
  readonly endInclusive: number;
  /** `endInclusive - start + 1`. */
  readonly length: number;
  /** The messages inside, in file order, positioned RELATIVE to `start`. */
  readonly members: readonly EcmwfRangeMember[];
}

/** One expected message inside a range, located relative to the range's own first byte. */
export interface EcmwfRangeMember {
  readonly param: string;
  /** Offset of the message from the START OF THE RANGE, not of the file. */
  readonly relativeOffset: number;
  readonly length: number;
}

/**
 * Parse an `.index` body into one record per line.
 *
 * Every line must be a JSON object carrying the fields we depend on; a line that is not is a
 * refusal rather than a skip. A skipped line is invisible — the parameter it described simply
 * never appears, the step is quietly served short, and the only symptom is a series with a hole
 * in it somewhere downstream.
 */
export function parseEcmwfIndex(body: string): EcmwfIndexRecord[] {
  const lines = body.split('\n');
  const records: EcmwfIndexRecord[] = [];

  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    // Blank lines are structural (the file ends with a newline), not content.
    if (line === '') continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error: unknown) {
      throw new EcmwfContractError(
        `.index line ${String(lineNumber)} is not valid JSON. The file is JSON-LINES despite the ` +
          `provider's application/json content type; if this is a whole-file JSON document the ` +
          `format has changed.`,
        { cause: error },
      );
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new EcmwfContractError(
        `.index line ${String(lineNumber)} is not a JSON object (got ${describe(parsed)}).`,
      );
    }

    const record = parsed as Record<string, unknown>;
    records.push({
      param: requireString(record, 'param', lineNumber),
      offset: requireNonNegativeInteger(record, '_offset', lineNumber),
      length: requirePositiveInteger(record, '_length', lineNumber),
      date: requireString(record, 'date', lineNumber),
      time: requireString(record, 'time', lineNumber),
      step: requireString(record, 'step', lineNumber),
      stream: requireString(record, 'stream', lineNumber),
      lineNumber,
    });
  }

  if (records.length === 0) {
    throw new EcmwfContractError('.index body contains no records.');
  }

  return records;
}

/**
 * Pick exactly one record per requested parameter.
 *
 * Both failure directions are errors and neither is a warning:
 * - a MISSING parameter means this step does not carry a layer we publish, and continuing would
 *   serve the step with a silently absent field;
 * - a DUPLICATED parameter means the index describes two messages we cannot tell apart (a level
 *   or ensemble member we did not expect), and picking the first is a coin flip between two
 *   different numbers.
 */
export function selectIndexRecords(
  records: readonly EcmwfIndexRecord[],
  params: readonly EcmwfParam[],
): EcmwfIndexRecord[] {
  const selected: EcmwfIndexRecord[] = [];

  for (const param of params) {
    const matches = records.filter((record) => record.param === param);
    const first = matches[0];
    if (first === undefined) {
      throw new EcmwfContractError(
        `.index carries no record for parameter "${param}" — it lists ` +
          `${String(new Set(records.map((record) => record.param)).size)} distinct parameters, and ` +
          `this is one we publish.`,
      );
    }
    if (matches.length > 1) {
      throw new EcmwfContractError(
        `.index carries ${String(matches.length)} records for parameter "${param}" (lines ` +
          `${matches.map((record) => String(record.lineNumber)).join(', ')}). Refusing to guess ` +
          `which message is the one we mean.`,
      );
    }
    selected.push(first);
  }

  return selected;
}

/**
 * Plan the HTTP `Range` requests for a set of selected records: merge the ones whose bytes are
 * physically adjacent, leave the rest alone.
 *
 * ## Why this is computed per step and never hard-coded
 * Measured over two steps of a live cycle: `swh` and `mwd` are adjacent at EVERY step (their two
 * requests collapse into one), and `10u`/`10v` are adjacent at NO step — they sit ~3.4 MB apart
 * inside the `oper` file. Neither fact is promised by the provider, so the arrangement is read
 * from the index each time. Pinning the observed layout would turn a harmless re-ordering into
 * either a wasted download or a mis-attributed message.
 *
 * ## Strictly adjacent, never "close enough"
 * Ranges are merged only when the previous message ENDS exactly where the next one begins.
 * Bridging a gap would mean paying for bytes we must then skip, and — worse — it would mean the
 * range no longer decomposes into "message, message" at known offsets, which is the property the
 * GRIB adapter uses to bind each decoded field to the parameter the index promised.
 */
export function mergeByteRanges(records: readonly EcmwfIndexRecord[]): EcmwfByteRange[] {
  if (records.length === 0) {
    throw new EcmwfContractError('cannot plan byte ranges for an empty record set.');
  }

  const ordered = [...records].sort((a, b) => a.offset - b.offset);

  // Overlap is not a merge opportunity, it is a contradiction: two messages cannot share bytes.
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous === undefined || current === undefined) continue;
    if (previous.offset + previous.length > current.offset) {
      throw new EcmwfContractError(
        `.index records overlap: "${previous.param}" occupies ${String(previous.offset)}–` +
          `${String(previous.offset + previous.length - 1)} and "${current.param}" starts at ` +
          `${String(current.offset)}.`,
      );
    }
  }

  const ranges: EcmwfByteRange[] = [];
  let group: EcmwfIndexRecord[] = [];

  const flush = (): void => {
    const first = group[0];
    const last = group[group.length - 1];
    if (first === undefined || last === undefined) return;
    const start = first.offset;
    const endInclusive = last.offset + last.length - 1;
    ranges.push({
      start,
      endInclusive,
      length: endInclusive - start + 1,
      members: group.map((record) => ({
        param: record.param,
        relativeOffset: record.offset - start,
        length: record.length,
      })),
    });
    group = [];
  };

  for (const record of ordered) {
    const previous = group[group.length - 1];
    if (previous !== undefined && previous.offset + previous.length !== record.offset) {
      flush();
    }
    group.push(record);
  }
  flush();

  return ranges;
}

/** `Range` header value for one planned range. */
export function toRangeHeader(range: EcmwfByteRange): string {
  return `bytes=${String(range.start)}-${String(range.endInclusive)}`;
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value;
}

function requireString(record: Record<string, unknown>, key: string, lineNumber: number): string {
  const value = record[key];
  if (typeof value !== 'string' || value === '') {
    throw new EcmwfContractError(
      `.index line ${String(lineNumber)} has no usable "${key}" (got ${describe(value)}).`,
    );
  }
  return value;
}

function requireNonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
  lineNumber: number,
): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new EcmwfContractError(
      `.index line ${String(lineNumber)} has no usable "${key}" — expected a non-negative ` +
        `integer, got ${JSON.stringify(value)}.`,
    );
  }
  return value;
}

function requirePositiveInteger(
  record: Record<string, unknown>,
  key: string,
  lineNumber: number,
): number {
  const value = requireNonNegativeInteger(record, key, lineNumber);
  if (value === 0) {
    throw new EcmwfContractError(
      `.index line ${String(lineNumber)} declares "${key}" of 0 — a GRIB message cannot be empty.`,
    );
  }
  return value;
}
