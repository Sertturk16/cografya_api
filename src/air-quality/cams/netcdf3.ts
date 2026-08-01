import { CamsContractError } from './cams.errors';

/**
 * NetCDF3 "classic" (CDF-1, 32-bit offset) reader — zero dependencies, fail-closed.
 *
 * ## Why our own ~200 lines instead of a library (approved plan §5.1, D1)
 * The measurement harness proved the whole path at 23.8 ms / 79.2 MiB peak RSS with zero npm
 * dependencies. Our own reader accepts ONLY NetCDF3 classic and only the types this provider
 * ships, and turns every deviation into a typed {@link CamsContractError} — a general-purpose
 * library "does its best", which is precisely the silent-acceptance behaviour this leg bans.
 * No dependency-pinning burden (DEC 2026-07-31d class) ever arises.
 *
 * ## Format facts this reader is pinned to (measured on real ADS files)
 * - Magic `CDF\x01`. `CDF\x02` (64-bit offset) and `\x89HDF` (NetCDF4) are REFUSED — the
 *   measured provider file is classic; a change here must stop the pipeline, not degrade it.
 * - All multi-byte values BIG-endian.
 * - Record layout: `time` is the record dimension; each record is the concatenation of every
 *   record variable's per-record block in header order, each block padded to 4 bytes — UNLESS
 *   there is exactly one record variable, which is stored unpadded (the classic-format quirk).
 *   A record variable's `begin` points at its block in record 0; record `r` adds `r × recsize`.
 *
 * Reference: the NetCDF classic format specification (CDF-1 BNF), Unidata.
 */

/** NetCDF external types (the `nc_type` codes). */
export const NC_BYTE = 1;
export const NC_CHAR = 2;
export const NC_SHORT = 3;
export const NC_INT = 4;
export const NC_FLOAT = 5;
export const NC_DOUBLE = 6;

const TAG_DIMENSION = 0x0a;
const TAG_VARIABLE = 0x0b;
const TAG_ATTRIBUTE = 0x0c;
const TAG_ABSENT = 0x00;

const ELEMENT_BYTES: Readonly<Record<number, number>> = {
  [NC_BYTE]: 1,
  [NC_CHAR]: 1,
  [NC_SHORT]: 2,
  [NC_INT]: 4,
  [NC_FLOAT]: 4,
  [NC_DOUBLE]: 8,
};

export interface Netcdf3Dimension {
  name: string;
  /** Length; the record dimension reports the actual record count. */
  length: number;
  isRecord: boolean;
}

export interface Netcdf3Attribute {
  name: string;
  ncType: number;
  /** `string` for NC_CHAR, numeric array for every numeric type. */
  value: string | number[];
}

export interface Netcdf3Variable {
  name: string;
  dimensionIds: number[];
  attributes: Netcdf3Attribute[];
  ncType: number;
  /** Byte offset of the variable's data (record vars: its block within record 0). */
  begin: number;
  isRecord: boolean;
  /** Elements in one read unit: the whole variable (fixed) or one record's block (record). */
  elementsPerUnit: number;
}

/** Cursor over the big-endian header with hard bounds checking. */
class Reader {
  private offset = 0;
  constructor(private readonly view: DataView) {}

  position(): number {
    return this.offset;
  }

  private require(bytes: number, what: string): void {
    if (this.offset + bytes > this.view.byteLength) {
      throw new CamsContractError(
        `truncated NetCDF header: needed ${String(bytes)} byte(s) for ${what} at offset ` +
          `${String(this.offset)}.`,
      );
    }
  }

  readInt32(what: string): number {
    this.require(4, what);
    const value = this.view.getInt32(this.offset, false);
    this.offset += 4;
    return value;
  }

  readBytes(count: number, what: string): Uint8Array {
    this.require(count, what);
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, count);
    this.offset += count;
    return bytes;
  }

  /** Names and attribute payloads are padded to the next 4-byte boundary. */
  skipPadding(consumed: number): void {
    const remainder = consumed % 4;
    if (remainder !== 0) {
      const padding = 4 - remainder;
      this.require(padding, 'padding');
      this.offset += padding;
    }
  }
}

export class Netcdf3File {
  readonly dimensions: Netcdf3Dimension[];
  readonly globalAttributes: Netcdf3Attribute[];
  readonly variables: Netcdf3Variable[];
  readonly recordCount: number;
  /** Bytes of ONE record (every record variable's padded block; unpadded if single). */
  readonly recordSize: number;

  private readonly view: DataView;
  private readonly byName: Map<string, Netcdf3Variable>;

  constructor(bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const reader = new Reader(this.view);

    const magic = reader.readBytes(4, 'magic');
    if (magic[0] !== 0x43 || magic[1] !== 0x44 || magic[2] !== 0x46) {
      throw new CamsContractError('not a NetCDF file: magic "CDF" missing.');
    }
    if (magic[3] !== 0x01) {
      throw new CamsContractError(
        `unsupported NetCDF version byte ${String(magic[3])} — only classic CDF-1 is ` +
          'contracted (CDF-2/NetCDF4 must stop the pipeline, not degrade it).',
      );
    }

    const numrecs = reader.readInt32('numrecs');
    if (numrecs < 0) {
      throw new CamsContractError(
        'STREAMING record count (numrecs = -1) — the provider always writes a concrete count.',
      );
    }
    // Plausibility bound: the production shape is 97 records (single-sourced as
    // `PRODUCTION_FORECAST_STEP_COUNT` in `probe-air-quality.ts` — deliberately NOT imported
    // here; this is a generic parser bound, not the production pin) and even a year of hourly
    // steps is 8 760 — a header claiming millions is corrupt or hostile, and every downstream
    // loop sizes itself from this count.
    if (numrecs > 1_000_000) {
      throw new CamsContractError(`implausible record count ${String(numrecs)} (numrecs).`);
    }
    this.recordCount = numrecs;

    this.dimensions = readDimensionList(reader);
    // The header stores 0 for the record dimension; surface the real count instead.
    for (const dimension of this.dimensions) {
      if (dimension.isRecord) dimension.length = this.recordCount;
    }
    this.globalAttributes = readAttributeList(reader, 'global');
    this.variables = readVariableList(reader, this.dimensions);
    this.byName = new Map(this.variables.map((variable) => [variable.name, variable]));

    const recordVariables = this.variables.filter((variable) => variable.isRecord);
    if (recordVariables.length === 1) {
      // The single-record-variable quirk: blocks are NOT padded.
      const only = recordVariables[0];
      this.recordSize =
        only === undefined ? 0 : only.elementsPerUnit * elementBytes(only.ncType, only.name);
    } else {
      this.recordSize = recordVariables.reduce(
        (sum, variable) =>
          sum + padTo4(variable.elementsPerUnit * elementBytes(variable.ncType, variable.name)),
        0,
      );
    }
  }

  /** The variable, or a typed refusal — a missing expected variable is never a silent skip. */
  variable(name: string): Netcdf3Variable {
    const found = this.byName.get(name);
    if (found === undefined) {
      throw new CamsContractError(
        `expected variable "${name}" is not in the file (present: ` +
          `${this.variables.map((candidate) => candidate.name).join(', ')}).`,
      );
    }
    return found;
  }

  hasVariable(name: string): boolean {
    return this.byName.has(name);
  }

  /** An attribute of a variable, or `undefined` (callers decide whether absence is fatal). */
  attribute(variableName: string, attributeName: string): Netcdf3Attribute | undefined {
    return this.variable(variableName).attributes.find(
      (candidate) => candidate.name === attributeName,
    );
  }

  /**
   * Read a FIXED (non-record) numeric variable in full — the coordinate axes.
   * Plain `number[]`: axis arithmetic needs float64 precision from the start.
   */
  readFixedNumeric(name: string): number[] {
    const variable = this.variable(name);
    if (variable.isRecord) {
      throw new CamsContractError(`"${name}" is a record variable; use readRecordBlock.`);
    }
    return this.readValues(variable, variable.begin, variable.elementsPerUnit);
  }

  /** Read ONE record's block of a record variable (e.g. one time step's grid slab). */
  readRecordBlock(name: string, recordIndex: number): number[] {
    const variable = this.variable(name);
    if (!variable.isRecord) {
      throw new CamsContractError(`"${name}" is not a record variable; use readFixedNumeric.`);
    }
    if (!Number.isInteger(recordIndex) || recordIndex < 0 || recordIndex >= this.recordCount) {
      throw new CamsContractError(
        `record ${String(recordIndex)} out of range [0, ${String(this.recordCount)}).`,
      );
    }
    const start = variable.begin + recordIndex * this.recordSize;
    return this.readValues(variable, start, variable.elementsPerUnit);
  }

  private readValues(variable: Netcdf3Variable, startByte: number, count: number): number[] {
    const size = elementBytes(variable.ncType, variable.name);
    if (variable.ncType === NC_CHAR) {
      throw new CamsContractError(`"${variable.name}" is NC_CHAR — not a numeric variable.`);
    }
    const endByte = startByte + count * size;
    if (startByte < 0 || endByte > this.view.byteLength) {
      throw new CamsContractError(
        `data for "${variable.name}" [${String(startByte)}, ${String(endByte)}) lies outside ` +
          `the ${String(this.view.byteLength)}-byte file.`,
      );
    }
    const values = new Array<number>(count);
    for (let index = 0; index < count; index += 1) {
      values[index] = readScalar(this.view, variable.ncType, startByte + index * size);
    }
    return values;
  }
}

/** Parse the container's single `.nc` payload. */
export function parseNetcdf3(bytes: Uint8Array): Netcdf3File {
  return new Netcdf3File(bytes);
}

function padTo4(bytes: number): number {
  const remainder = bytes % 4;
  return remainder === 0 ? bytes : bytes + (4 - remainder);
}

function elementBytes(ncType: number, name: string): number {
  const size = ELEMENT_BYTES[ncType];
  if (size === undefined) {
    throw new CamsContractError(
      `variable/attribute "${name}" has unknown nc_type ${String(ncType)}.`,
    );
  }
  return size;
}

function readScalar(view: DataView, ncType: number, offset: number): number {
  switch (ncType) {
    case NC_BYTE:
      return view.getInt8(offset);
    case NC_SHORT:
      return view.getInt16(offset, false);
    case NC_INT:
      return view.getInt32(offset, false);
    case NC_FLOAT:
      return view.getFloat32(offset, false);
    case NC_DOUBLE:
      return view.getFloat64(offset, false);
    default:
      throw new CamsContractError(`unsupported scalar nc_type ${String(ncType)}.`);
  }
}

function readName(reader: Reader, what: string): string {
  const length = reader.readInt32(`${what} name length`);
  if (length < 0 || length > 1024) {
    throw new CamsContractError(`implausible ${what} name length ${String(length)}.`);
  }
  const bytes = reader.readBytes(length, `${what} name`);
  reader.skipPadding(length);
  return new TextDecoder('utf-8').decode(bytes);
}

function readList(reader: Reader, expectedTag: number, what: string): number {
  const tag = reader.readInt32(`${what} list tag`);
  const count = reader.readInt32(`${what} count`);
  if (tag === TAG_ABSENT && count === 0) return 0;
  if (tag !== expectedTag) {
    throw new CamsContractError(
      `${what} list tag is 0x${tag.toString(16)}, expected 0x${expectedTag.toString(16)}.`,
    );
  }
  if (count < 0 || count > 10_000) {
    throw new CamsContractError(`implausible ${what} count ${String(count)}.`);
  }
  return count;
}

function readDimensionList(reader: Reader): Netcdf3Dimension[] {
  const count = readList(reader, TAG_DIMENSION, 'dimension');
  const dimensions: Netcdf3Dimension[] = [];
  for (let index = 0; index < count; index += 1) {
    const name = readName(reader, 'dimension');
    const length = reader.readInt32('dimension length');
    if (length < 0) {
      throw new CamsContractError(`dimension "${name}" has negative length.`);
    }
    dimensions.push({ name, length, isRecord: length === 0 });
  }
  if (dimensions.filter((dimension) => dimension.isRecord).length > 1) {
    throw new CamsContractError('more than one record dimension — not valid classic NetCDF.');
  }
  return dimensions;
}

function readAttributeList(reader: Reader, owner: string): Netcdf3Attribute[] {
  const count = readList(reader, TAG_ATTRIBUTE, `${owner} attribute`);
  const attributes: Netcdf3Attribute[] = [];
  for (let index = 0; index < count; index += 1) {
    const name = readName(reader, 'attribute');
    const ncType = reader.readInt32('attribute type');
    const elementCount = reader.readInt32('attribute element count');
    if (elementCount < 0 || elementCount > 1_000_000) {
      throw new CamsContractError(
        `implausible attribute "${name}" length ${String(elementCount)}.`,
      );
    }
    const size = elementBytes(ncType, name);
    const payload = reader.readBytes(elementCount * size, `attribute "${name}" payload`);
    reader.skipPadding(elementCount * size);

    if (ncType === NC_CHAR) {
      attributes.push({ name, ncType, value: new TextDecoder('utf-8').decode(payload) });
    } else {
      const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      const values = new Array<number>(elementCount);
      for (let element = 0; element < elementCount; element += 1) {
        values[element] = readScalar(view, ncType, element * size);
      }
      attributes.push({ name, ncType, value: values });
    }
  }
  return attributes;
}

function readVariableList(reader: Reader, dimensions: Netcdf3Dimension[]): Netcdf3Variable[] {
  const count = readList(reader, TAG_VARIABLE, 'variable');
  const variables: Netcdf3Variable[] = [];
  for (let index = 0; index < count; index += 1) {
    const name = readName(reader, 'variable');
    const rank = reader.readInt32('variable rank');
    if (rank < 0 || rank > 8) {
      throw new CamsContractError(`variable "${name}" has implausible rank ${String(rank)}.`);
    }
    const dimensionIds: number[] = [];
    for (let dim = 0; dim < rank; dim += 1) {
      const id = reader.readInt32('dimension id');
      if (id < 0 || id >= dimensions.length) {
        throw new CamsContractError(
          `variable "${name}" references unknown dimension ${String(id)}.`,
        );
      }
      dimensionIds.push(id);
    }
    const attributes = readAttributeList(reader, `variable "${name}"`);
    const ncType = reader.readInt32('variable type');
    elementBytes(ncType, name); // validates the type code
    // vsize is read for cursor advancement; our extents are computed from dims instead,
    // because vsize is the file's own claim and the one field a corrupted header lies with.
    reader.readInt32('vsize');
    const begin = reader.readInt32('begin');
    if (begin < 0) {
      throw new CamsContractError(`variable "${name}" has negative data offset.`);
    }

    const firstDimensionId = dimensionIds[0];
    const isRecord =
      firstDimensionId !== undefined && dimensions[firstDimensionId]?.isRecord === true;
    let elementsPerUnit = 1;
    dimensionIds.forEach((dimensionId, position) => {
      const dimension = dimensions[dimensionId];
      if (dimension === undefined) return; // already validated above
      if (dimension.isRecord) {
        if (position !== 0) {
          throw new CamsContractError(
            `variable "${name}" uses the record dimension at position ${String(position)} — ` +
              'only the first position is valid in classic NetCDF.',
          );
        }
        return; // the record dimension contributes per-record, not per-unit
      }
      elementsPerUnit *= dimension.length;
    });

    variables.push({ name, dimensionIds, attributes, ncType, begin, isRecord, elementsPerUnit });
  }
  return variables;
}
