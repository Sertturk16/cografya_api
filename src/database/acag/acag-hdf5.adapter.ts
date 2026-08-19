import { openSync, readSync, closeSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AcagContractError } from './acag.errors';

/**
 * The ONE place `h5wasm` is called (the `jsfive`/`gribberish` adapter precedent, ENGINEERING §1
 * fail-closed requirement).
 *
 * ## Why a SECOND HDF5 implementation exists in this repo, and why it is not a duplicate
 * The climate line reads a 19 MB regional ERA5 file with `jsfive`, which materialises a whole
 * dataset (`new Array(data_size)`). That is fine at 19 MB and impossible here: ACAG publishes no
 * regional file covering Türkiye — measured, and the reason is not resolution but geometry. Its
 * EU tile ends at 39.995°E and its AF tile at 38.005°N, so **12 provinces** (Ağrı, Ardahan,
 * Artvin, Bayburt, Bingöl, Bitlis, Erzurum, Iğdır, Kars, Muş, Rize, Van) fall in a gap no tile
 * covers. Only the GLOBAL file works, and it is `PM25[13000, 36000]` = 468 million cells: with
 * `jsfive` that is a ~3.7 GB JS array before the adapter's own copy, against 5 GB of free RAM.
 *
 * `h5wasm` reads a HYPERSLAB. The Türkiye window (731 × 1992 cells) comes out of the 450 MB file
 * in ~78 ms at ~143 MB RSS — measured, and the evidence Atlas ruled on. So the two decoders are
 * not redundant: one reads whole small files, this one reads a window out of a file we must never
 * load whole. Both are `devDependencies`; neither is loaded by the server (`AppModule` imports
 * nothing from `src/database/`).
 *
 * ## Everything it returns is `unknown` until proven otherwise
 * No cast, no `as`, no optimistic destructuring. A missing variable, a wrong rank, a string where
 * a float belongs, a NaN where a number belongs — all raise {@link AcagContractError}. There is
 * no recovery branch and no "take the first slice" fallback, because that is how a plausible
 * number from the wrong place gets published.
 *
 * **NaN is NOT admitted here.** It is on the ERA5 line, where `_FillValue` is NaN and the sea
 * mask is real information. On this line a NaN inside the published window is a province with no
 * value, which the extraction step must see and refuse — so this adapter passes NaN through
 * untouched and `acag-extract.ts` owns the refusal. (Measured on the 2024 file: 0 of 81 province
 * centre cells are NaN.)
 *
 * ## The magic-byte gate runs BEFORE the library sees the path
 * `h5wasm` opens files through an emscripten filesystem; handing it a GRIB or a ZIP produces an
 * abort inside WASM whose message names no cause. So the first 8 bytes are read with plain
 * `node:fs` and checked against the HDF5 signature first.
 */

/** The npm package this line's provenance claims. */
export const ACAG_DECODER_PACKAGE = 'h5wasm';

/** HDF5 superblock signature: `\x89HDF\r\n\x1a\n`. */
const HDF5_MAGIC = Uint8Array.from([0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface AcagDecoderIdentity {
  package: typeof ACAG_DECODER_PACKAGE;
  version: string;
}

/**
 * The decoder identity comes from the INSTALLED package, never from a literal: the manifest's
 * provenance claim must describe what actually ran. Same purpose as `readDecoderIdentity` on the
 * ERA5 line, minus the inflate half (`h5wasm` links zlib inside its WASM binary, so there is no
 * second JS package to name — stating one would be a provenance claim we cannot support).
 *
 * ## Why this walks `node_modules` instead of using `require.resolve`
 * The ERA5 version resolves `jsfive` by specifier. That does NOT work here, and the failure is
 * silent until the worst possible moment: `h5wasm`'s `exports` map declares only an `import`
 * condition, so under CommonJS — which is what `dist/` is — `require.resolve('h5wasm')`,
 * `'h5wasm/node'` and `'h5wasm/package.json'` all throw `ERR_PACKAGE_PATH_NOT_EXPORTED`. The
 * dynamic `import()` in {@link readAcagWindow} works fine (ESM honours the `import` condition),
 * so a resolve-based identity would decode 27 files correctly over ~70 minutes and then throw
 * while writing the manifest. Measured, and caught exactly that way.
 *
 * Walking up for `node_modules/<pkg>/package.json` depends on the filesystem layout rather than
 * on a resolver's conditions, and works identically from `src/` under ts-jest and from `dist/`.
 */
export function readDecoderIdentity(
  startDirectory: string = __dirname,
  readFileImpl: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): AcagDecoderIdentity {
  let directory = startDirectory;
  for (;;) {
    const candidate = join(directory, 'node_modules', ACAG_DECODER_PACKAGE, 'package.json');
    try {
      const parsed: unknown = JSON.parse(readFileImpl(candidate));
      if (typeof parsed === 'object' && parsed !== null) {
        const record = parsed as Record<string, unknown>;
        if (record.name === ACAG_DECODER_PACKAGE && typeof record.version === 'string') {
          return { package: ACAG_DECODER_PACKAGE, version: record.version };
        }
      }
    } catch {
      // Not installed at this level (or an unrelated file) — keep walking up.
    }
    const parent = dirname(directory);
    if (parent === directory) {
      throw new AcagContractError(
        `walked to the filesystem root without finding node_modules/${ACAG_DECODER_PACKAGE}/` +
          'package.json. The manifest must name the decoder that actually ran, so this is a stop ' +
          'rather than an "unknown" version.',
      );
    }
    directory = parent;
  }
}

/**
 * Refuse anything that is not HDF5 before the decoder is involved, and say what arrived.
 *
 * Exported so the spec can exercise it without a 450 MB file.
 */
export function assertHdf5Magic(head: Uint8Array, fileName: string): void {
  if (head.length < HDF5_MAGIC.length) {
    throw new AcagContractError(
      `"${fileName}" is ${String(head.length)} byte(s) — too short to be HDF5/NetCDF4.`,
    );
  }
  for (let index = 0; index < HDF5_MAGIC.length; index += 1) {
    if (head[index] !== HDF5_MAGIC[index]) {
      const seen = Array.from(head.subarray(0, HDF5_MAGIC.length))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(' ');
      throw new AcagContractError(
        `"${fileName}" does not start with the HDF5 signature (saw ${seen}). ACAG publishes ` +
          'NetCDF4/HDF5 `.nc` files; a ZIP/GRIB/HTML payload here means the download was an ' +
          'error page or the wrong product.',
      );
    }
  }
}

function readHead(path: string, byteCount: number): Uint8Array {
  const buffer = new Uint8Array(byteCount);
  let handle: number;
  try {
    handle = openSync(path, 'r');
  } catch (error: unknown) {
    throw new AcagContractError(`cannot open "${path}".`, { cause: error });
  }
  try {
    const read = readSync(handle, buffer, 0, byteCount, 0);
    return buffer.subarray(0, read);
  } finally {
    closeSync(handle);
  }
}

/** One dataset's declared geometry, validated. */
export interface AcagDatasetShape {
  latitudeLength: number;
  longitudeLength: number;
}

/** The window this line reads: axis slices plus the values that belong to them. */
export interface AcagWindow {
  /** Window-relative latitude axis (ascending on this product, but derived, never assumed). */
  latitudeAxis: number[];
  /** Window-relative longitude axis. */
  longitudeAxis: number[];
  /** Row-major `latitudeAxis.length × longitudeAxis.length` values, µg/m³. */
  values: Float32Array;
  /** Index of the window's first row/column in the FULL array — provenance, never arithmetic. */
  rowOffset: number;
  columnOffset: number;
  /** Full-array geometry, for the manifest. */
  fullShape: AcagDatasetShape;
  /** The file's own `TIMECOVERAGE` attribute, or `null` when it could not be read. */
  timeCoverageAttribute: string | null;
}

interface H5Dataset {
  shape: unknown;
  value: unknown;
  slice: (ranges: number[][]) => unknown;
}

interface H5File {
  get: (name: string) => unknown;
  close: () => void;
  attrs?: unknown;
}

/**
 * Read a root-level string attribute, FAIL-SOFT.
 *
 * Used for `TIMECOVERAGE`, which the ledger's AÇIK 2 wants cross-checked against the file name:
 * the provider's own page contradicts itself about which years exist, so the file is the
 * authority. Fail-soft is deliberate and bounded — a missing attribute yields `null`, which the
 * artifact records as "unreadable" and `A-08c` then cannot claim agreement. It never yields a
 * guess. (Measured on the real files: `TIMECOVERAGE` = "2024" on the 2024 file.)
 */
export function readRootStringAttribute(file: { attrs?: unknown }, name: string): string | null {
  const attrs: unknown = file.attrs;
  if (typeof attrs !== 'object' || attrs === null) return null;
  const entry: unknown = (attrs as Record<string, unknown>)[name];
  if (entry === undefined || entry === null) return null;
  // `'value' in entry` narrows the object, so no assertion is needed to reach `.value`.
  const raw: unknown =
    typeof entry === 'object' && entry !== null && 'value' in entry ? entry.value : entry;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && raw.length === 1 && typeof raw[0] === 'string') return raw[0];
  return null;
}

interface H5Module {
  ready: Promise<unknown>;
  File: new (path: string, mode: string) => H5File;
}

function asDataset(raw: unknown, name: string): H5Dataset {
  if (typeof raw !== 'object' || raw === null) {
    throw new AcagContractError(`"${name}" is absent from the file (or is not a dataset).`);
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.slice !== 'function' || !('shape' in record) || !('value' in record)) {
    throw new AcagContractError(
      `"${name}" does not look like a dataset (no shape/value/slice) — the file layout changed.`,
    );
  }
  return raw as H5Dataset;
}

function asAxis(raw: unknown, name: string): number[] {
  if (!(raw instanceof Float32Array) && !(raw instanceof Float64Array) && !Array.isArray(raw)) {
    throw new AcagContractError(`axis "${name}" did not decode to a numeric array.`);
  }
  const source = raw as ArrayLike<unknown>;
  const out: number[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const entry: unknown = source[index];
    if (typeof entry !== 'number' || !Number.isFinite(entry)) {
      throw new AcagContractError(`axis "${name}" contains a non-finite entry.`);
    }
    out.push(entry);
  }
  if (out.length < 2) {
    throw new AcagContractError(`axis "${name}" has fewer than 2 entries.`);
  }
  return out;
}

function asShape(raw: unknown, name: string): [number, number] {
  if (!Array.isArray(raw) || raw.length !== 2) {
    throw new AcagContractError(
      `"${name}" is not 2-dimensional (shape ${JSON.stringify(raw)}) — this line only reads a ` +
        'lat × lon grid, and guessing which axis is which is how the wrong cell gets published.',
    );
  }
  // Indexed rather than destructured: `Array.isArray` narrows to `any[]`, and destructuring
  // that would spread `any` into two bindings the checks below could no longer defend.
  const shape: unknown[] = raw;
  const rows: unknown = shape[0];
  const columns: unknown = shape[1];
  if (
    typeof rows !== 'number' ||
    typeof columns !== 'number' ||
    !Number.isInteger(rows) ||
    !Number.isInteger(columns) ||
    rows <= 0 ||
    columns <= 0
  ) {
    throw new AcagContractError(`"${name}" has a non-positive-integer shape.`);
  }
  return [rows, columns];
}

export interface AcagWindowRequest {
  /** Absolute path to the raw `.nc`. */
  path: string;
  /** Inclusive geographic bounds of the window to read. */
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

/**
 * Open one ACAG annual file and read the requested geographic window.
 *
 * The window is resolved from the file's OWN axes: we read the two 1-D coordinate datasets whole
 * (36 000 + 13 000 values — trivial), find the covering index range, then hyperslab exactly that
 * rectangle out of the 468M-cell variable. The full variable is never materialised.
 */
export async function readAcagWindow(request: AcagWindowRequest): Promise<AcagWindow> {
  assertHdf5Magic(readHead(request.path, HDF5_MAGIC.length), request.path);

  // Imported lazily and by specifier so the magic-byte gate above always runs first, and so a
  // repo-wide typecheck never pulls WASM into a build that does not use it.
  const module_: unknown = await import('h5wasm/node');
  if (typeof module_ !== 'object' || module_ === null) {
    throw new AcagContractError('h5wasm/node did not export a module object.');
  }
  const h5 = module_ as unknown as H5Module;
  await h5.ready;

  const file = new h5.File(request.path, 'r');
  try {
    const pm25 = asDataset(file.get('PM25'), 'PM25');
    const [fullRows, fullColumns] = asShape(pm25.shape, 'PM25');
    const latitudeAxis = asAxis(asDataset(file.get('lat'), 'lat').value, 'lat');
    const longitudeAxis = asAxis(asDataset(file.get('lon'), 'lon').value, 'lon');

    if (latitudeAxis.length !== fullRows || longitudeAxis.length !== fullColumns) {
      throw new AcagContractError(
        `axis lengths (${String(latitudeAxis.length)} × ${String(longitudeAxis.length)}) do not ` +
          `match the PM25 shape (${String(fullRows)} × ${String(fullColumns)}) — the file's own ` +
          'dataspace and coordinates disagree.',
      );
    }

    const rowRange = coveringRange(latitudeAxis, request.minLatitude, request.maxLatitude, 'lat');
    const columnRange = coveringRange(
      longitudeAxis,
      request.minLongitude,
      request.maxLongitude,
      'lon',
    );

    const sliced: unknown = pm25.slice([
      [rowRange.start, rowRange.end],
      [columnRange.start, columnRange.end],
    ]);
    if (!(sliced instanceof Float32Array)) {
      throw new AcagContractError(
        `the PM25 hyperslab decoded to ${describe(sliced)}, expected a Float32Array — the ` +
          "product's dtype is `<f4` and a change there invalidates every published value.",
      );
    }
    const expectedLength = (rowRange.end - rowRange.start) * (columnRange.end - columnRange.start);
    if (sliced.length !== expectedLength) {
      throw new AcagContractError(
        `the PM25 hyperslab returned ${String(sliced.length)} values, expected ` +
          `${String(expectedLength)} — the decoder and the requested rectangle disagree.`,
      );
    }

    return {
      latitudeAxis: latitudeAxis.slice(rowRange.start, rowRange.end),
      longitudeAxis: longitudeAxis.slice(columnRange.start, columnRange.end),
      values: sliced,
      rowOffset: rowRange.start,
      columnOffset: columnRange.start,
      fullShape: { latitudeLength: fullRows, longitudeLength: fullColumns },
      timeCoverageAttribute: readRootStringAttribute(file, 'TIMECOVERAGE'),
    };
  } finally {
    file.close();
  }
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'object') return value.constructor.name;
  return typeof value;
}

/**
 * The half-open index range covering [min, max] on an axis of unknown direction.
 *
 * Deliberately NOT `round((v - axis[0]) / step)`: that is the publishing path's arithmetic and it
 * belongs in `acag-grid.ts` behind the read-back guard. Here we only need a rectangle that
 * CONTAINS the bounds, so a scan is used — it cannot be off by one in a way that silently moves a
 * value, only in a way that makes the window slightly larger.
 */
export function coveringRange(
  axis: readonly number[],
  min: number,
  max: number,
  axisName: string,
): { start: number; end: number } {
  if (min > max) {
    throw new AcagContractError(`"${axisName}" window bounds are inverted (${min} > ${max}).`);
  }
  let start = -1;
  let end = -1;
  for (let index = 0; index < axis.length; index += 1) {
    const value = axis[index];
    if (value === undefined) continue;
    if (value >= min && value <= max) {
      if (start === -1) start = index;
      end = index;
    }
  }
  if (start === -1) {
    throw new AcagContractError(
      `"${axisName}" covers none of the requested window [${String(min)}, ${String(max)}] — the ` +
        'file does not contain the area this line publishes.',
    );
  }
  // One cell of padding each side so a province sitting on the window edge still has its
  // neighbours available to the read-back guard rather than tripping `outside_domain`.
  return {
    start: Math.max(0, start - 1),
    end: Math.min(axis.length, end + 2),
  };
}
