import { deflateRawSync } from 'node:zlib';

/**
 * Programmatic NetCDF3-classic + ZIP fixture builder — TEST INFRASTRUCTURE, used only by the
 * `.spec.ts` files beside it.
 *
 * ## Why it exists (SPEC §7.4 test impact, measured)
 * The real production file carries ZERO missing values (6 620 250 of 6 620 250 present), so
 * the `_FillValue`, `not_supported`, wrong-unit, wrapped-axis and DEFLATE paths CANNOT be
 * exercised from a fixture cut out of provider bytes — the negative fixtures must be
 * synthesised. They are built here at test time rather than committed as binaries, so a
 * reviewer can read what each fixture contains.
 *
 * ## Why it lives in `src/` and not `test/`
 * The unit lane (`test/jest-unit.json`) only collects spec files under `tools/` and `src/`, and this
 * builder must itself be under test (its own spec asserts byte-level format details against
 * the specification, independent of our reader). The anchor against "the writer and the
 * reader share the same wrong model" is the committed REAL golden file in
 * `test/fixtures/cams/`, cross-validated with two independent readers (plan §5.5).
 *
 * Deliberately narrow: one optional record dimension, numeric/char attributes, float32 data.
 */

const NC_CHAR = 2;
const NC_FLOAT = 5;

export interface FixtureDimension {
  name: string;
  /** Use `'record'` for the record (time) dimension. */
  length: number | 'record';
}

export interface FixtureAttribute {
  name: string;
  /** A string becomes NC_CHAR; a number array becomes NC_FLOAT. */
  value: string | number[];
}

export interface FixtureVariable {
  name: string;
  /** Dimension NAMES, in order. A record variable lists the record dimension first. */
  dimensions: string[];
  attributes?: FixtureAttribute[];
  /**
   * Values in row-major order. For a record variable: `recordCount × elementsPerRecord`,
   * record-major. Written as big-endian float32.
   */
  data: number[];
}

export interface FixtureFileSpec {
  dimensions: FixtureDimension[];
  globalAttributes?: FixtureAttribute[];
  variables: FixtureVariable[];
  recordCount: number;
}

class ByteSink {
  private chunks: number[] = [];

  int32(value: number): void {
    this.chunks.push(
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    );
  }

  float32(value: number): void {
    const scratch = new DataView(new ArrayBuffer(4));
    scratch.setFloat32(0, value, false);
    for (let index = 0; index < 4; index += 1) this.chunks.push(scratch.getUint8(index));
  }

  bytes(values: Uint8Array): void {
    for (const value of values) this.chunks.push(value);
  }

  padTo4(): void {
    while (this.chunks.length % 4 !== 0) this.chunks.push(0);
  }

  name(text: string): void {
    const encoded = new TextEncoder().encode(text);
    this.int32(encoded.length);
    this.bytes(encoded);
    this.padTo4();
  }

  attributes(attributes: readonly FixtureAttribute[] | undefined): void {
    const list = attributes ?? [];
    if (list.length === 0) {
      this.int32(0);
      this.int32(0);
      return;
    }
    this.int32(0x0c);
    this.int32(list.length);
    for (const attribute of list) {
      this.name(attribute.name);
      if (typeof attribute.value === 'string') {
        const encoded = new TextEncoder().encode(attribute.value);
        this.int32(NC_CHAR);
        this.int32(encoded.length);
        this.bytes(encoded);
        this.padTo4();
      } else {
        this.int32(NC_FLOAT);
        this.int32(attribute.value.length);
        for (const value of attribute.value) this.float32(value);
        this.padTo4();
      }
    }
  }

  size(): number {
    return this.chunks.length;
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.chunks);
  }
}

/** Build a classic (CDF-1) NetCDF byte stream from the spec. */
export function buildNetcdf3(spec: FixtureFileSpec): Uint8Array {
  const dimensionIndex = new Map(
    spec.dimensions.map((dimension, index) => [dimension.name, index]),
  );

  const isRecordVariable = (variable: FixtureVariable): boolean => {
    const first = variable.dimensions[0];
    if (first === undefined) return false;
    const dimension = spec.dimensions[dimensionIndex.get(first) ?? -1];
    return dimension !== undefined && dimension.length === 'record';
  };

  const elementsPerUnit = (variable: FixtureVariable): number =>
    variable.dimensions.reduce((product, dimensionName) => {
      const dimension = spec.dimensions[dimensionIndex.get(dimensionName) ?? -1];
      if (dimension === undefined) throw new Error(`unknown dimension "${dimensionName}"`);
      return dimension.length === 'record' ? product : product * dimension.length;
    }, 1);

  const pad4 = (bytes: number): number => (bytes % 4 === 0 ? bytes : bytes + 4 - (bytes % 4));

  // ── header, with placeholder begins measured on a first pass ─────────────
  const emitHeader = (begins: readonly number[]): Uint8Array => {
    const sink = new ByteSink();
    sink.bytes(Uint8Array.from([0x43, 0x44, 0x46, 0x01])); // CDF\x01
    sink.int32(spec.recordCount);

    if (spec.dimensions.length === 0) {
      sink.int32(0);
      sink.int32(0);
    } else {
      sink.int32(0x0a);
      sink.int32(spec.dimensions.length);
      for (const dimension of spec.dimensions) {
        sink.name(dimension.name);
        sink.int32(dimension.length === 'record' ? 0 : dimension.length);
      }
    }

    sink.attributes(spec.globalAttributes);

    if (spec.variables.length === 0) {
      sink.int32(0);
      sink.int32(0);
    } else {
      sink.int32(0x0b);
      sink.int32(spec.variables.length);
      spec.variables.forEach((variable, index) => {
        sink.name(variable.name);
        sink.int32(variable.dimensions.length);
        for (const dimensionName of variable.dimensions) {
          const id = dimensionIndex.get(dimensionName);
          if (id === undefined) throw new Error(`unknown dimension "${dimensionName}"`);
          sink.int32(id);
        }
        sink.attributes(variable.attributes);
        sink.int32(NC_FLOAT);
        sink.int32(pad4(elementsPerUnit(variable) * 4)); // vsize (informational)
        sink.int32(begins[index] ?? 0);
      });
    }
    return sink.toUint8Array();
  };

  // First pass with zero begins to learn the header size (begins are fixed-width int32,
  // so the header size does not change when the real values are patched in).
  const headerSize = emitHeader(spec.variables.map(() => 0)).length;

  // ── layout: fixed variables first, then the record block ─────────────────
  const begins: number[] = new Array<number>(spec.variables.length).fill(0);
  let cursor = headerSize;
  spec.variables.forEach((variable, index) => {
    if (!isRecordVariable(variable)) {
      begins[index] = cursor;
      cursor += pad4(elementsPerUnit(variable) * 4);
    }
  });
  const recordVariables = spec.variables
    .map((variable, index) => ({ variable, index }))
    .filter((entry) => isRecordVariable(entry.variable));
  const singleRecordVariable = recordVariables.length === 1;
  let recordSize = 0;
  for (const entry of recordVariables) {
    begins[entry.index] = cursor + recordSize;
    const blockBytes = elementsPerUnit(entry.variable) * 4;
    recordSize += singleRecordVariable ? blockBytes : pad4(blockBytes);
  }

  // ── assemble ──────────────────────────────────────────────────────────────
  const totalSize = cursor + recordSize * spec.recordCount;
  const file = new Uint8Array(totalSize);
  file.set(emitHeader(begins), 0);
  const view = new DataView(file.buffer);

  const writeBlock = (startByte: number, values: readonly number[]): void => {
    values.forEach((value, index) => view.setFloat32(startByte + index * 4, value, false));
  };

  spec.variables.forEach((variable, index) => {
    const perUnit = elementsPerUnit(variable);
    const begin = begins[index] ?? 0;
    if (!isRecordVariable(variable)) {
      if (variable.data.length !== perUnit) {
        throw new Error(
          `fixture variable "${variable.name}": ${String(variable.data.length)} values for ` +
            `${String(perUnit)} elements`,
        );
      }
      writeBlock(begin, variable.data);
    } else {
      if (variable.data.length !== perUnit * spec.recordCount) {
        throw new Error(
          `fixture record variable "${variable.name}": ${String(variable.data.length)} values ` +
            `for ${String(perUnit)} × ${String(spec.recordCount)} elements`,
        );
      }
      for (let record = 0; record < spec.recordCount; record += 1) {
        writeBlock(
          begin + record * recordSize,
          variable.data.slice(record * perUnit, (record + 1) * perUnit),
        );
      }
    }
  });

  return file;
}

export interface ZipFixtureEntry {
  name: string;
  bytes: Uint8Array;
}

/** Build a ZIP archive (STORED by default, DEFLATE on request) around the given entries. */
export function buildZipArchive(
  entries: readonly ZipFixtureEntry[],
  options: { method?: 0 | 8 } = {},
): Uint8Array {
  const method = options.method ?? 0;
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const body = method === 8 ? new Uint8Array(deflateRawSync(entry.bytes)) : entry.bytes;
    const crc = crc32(entry.bytes);

    const local = new Uint8Array(30 + nameBytes.length + body.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true); // version needed
    localView.setUint16(8, method, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, body.length, true);
    localView.setUint32(22, entry.bytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(body, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, body.length, true);
    centralView.setUint32(24, entry.bytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);

  const total = offset + centralSize + eocd.length;
  const archive = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...localParts, ...centralParts, eocd]) {
    archive.set(part, cursor);
    cursor += part.length;
  }
  return archive;
}

/** CRC-32 (IEEE 802.3), the ZIP polynomial. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
