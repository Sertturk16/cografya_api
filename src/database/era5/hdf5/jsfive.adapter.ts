import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { File as JsFiveFile } from 'jsfive';
import { Era5ContractError } from '../era5.errors';

/**
 * The ONE place `jsfive` is called (the `gribberish` adapter precedent, ENGINEERING §1 / SPEC
 * §5.1's fail-closed requirement).
 *
 * ## Why the isolation is the whole point
 * `jsfive` is a pure-JS re-implementation of the HDF5 C library. It is well-sourced (NIST) and it
 * read the real 18.88 MiB production file in 607 ms during the probe — but it is one dependency
 * standing between us and every published number on 81 province pages, and a silent behaviour
 * change in it would look exactly like real data. So:
 *
 * 1. **Everything it returns is `unknown` until proven otherwise.** No cast, no `as`, no
 *    optimistic destructuring. `readNumericDataset` walks the array and rejects the first element
 *    that is not a finite number OR NaN — and NaN is admitted DELIBERATELY, because `_FillValue`
 *    is NaN in this product (measured) and the mask is real data, not corruption.
 * 2. **No recovery, no guessing.** A missing variable, a wrong dimension count, a string where a
 *    float belongs — all raise {@link Era5ContractError}. There is no "take the first slice"
 *    branch, because that is how a plausible number from the wrong place gets published.
 * 3. **The decoder identity comes from the INSTALLED package**, not from a literal: the manifest's
 *    provenance claim must describe what actually ran (see {@link readDecoderIdentity}).
 *
 * ## ⚠️ THIS DECODER CANNOT READ MOST OF THIS FILE'S ATTRIBUTES — NEVER WRITE AN ATTRIBUTE GUARD
 * `jsfive@0.4.0` reads HDF5 attributes only from **compact** storage (attribute messages inside
 * the object header). Once a dataset carries enough attributes for HDF5 to switch to **dense**
 * storage (an Attribute Info Message plus a fractal heap), it returns an **EMPTY BAG WITH NO
 * ERROR** — its own source carries the `TODO` for that case. Measured on our real production file:
 * `ncdump` reports 33 attributes on `t2m` and 4 on `valid_time`; `jsfive` reports `{}` for both.
 * Only small-attribute datasets (`number`) and the ROOT GROUP are read correctly.
 *
 * The consequence is the reason this warning is shouted rather than noted. A check of the form
 * `if ('scale_factor' in dataset.attributes) throw …` **can never fire**: the bag is always empty,
 * so a packed file would sail through a guard that reports "verified". That is a check whose
 * disabling surface is invisible — the exact class DEC 2026-07-19 is about — and it is strictly
 * worse than having no check, because it manufactures false confidence.
 *
 * **Binding rule (Atlas ruling O-1, 2026-08-02): every contract guard on this line reads the
 * DATA, never an attribute.** The epoch is proven by 360 consecutive month-starts, missing-ness by
 * scanning for actual NaN and for numeric sentinels, and packing by the physical range guard (a
 * packed file read raw lands orders of magnitude outside −60…+60 °C and fails loudly). Byte-level
 * checks are strictly stronger than label-level ones here, at essentially zero cost. `units`
 * strings are consequently NOT readable and enter provenance as `null` with a recorded reason —
 * note that the `tp` multiplier's justification never depended on them anyway: it rests on the
 * root-group `history` attribute (`stream=moda`), which IS readable.
 *
 * ## Licence, recorded here because a dependency audit that lives only in a PR body evaporates
 * `jsfive@0.4.0` — https://github.com/usnistgov/jsfive (US National Institute of Standards and
 * Technology). Its `LICENSE.txt`, read verbatim from the installed package, says: *"jsfive is in
 * the public domain. It is based in large part on the pyfive library
 * https://github.com/jjhelmus/pyfive Copyright (c) 2016 Jonathan J. Helmus All rights reserved."*
 * We therefore reproduce that notice in `test/fixtures/era5/README.md` and the PR body. Its one
 * dependency is `pako` (2.2.0, MIT AND Zlib) for DEFLATE. No install scripts, no native bindings.
 */

/** Exact pin, single-sourced. The lockfile is what actually enforces it; this is the claim. */
export const ERA5_DECODER_PACKAGE = 'jsfive';

/**
 * How much of the HDF5 attribute model this decoder can actually see. Written into the manifest
 * (Atlas ruling O-1 condition ii) so the limitation is a recorded property of the data, not tribal
 * knowledge: anyone reading the artifact can tell that `unitsAttribute: null` means "unreadable",
 * not "absent from the file".
 */
export const ERA5_DECODER_ATTRIBUTE_SUPPORT = 'compact-only' as const;

export interface Era5DecoderIdentity {
  package: string;
  version: string;
  /** The DEFLATE dependency that does the real chunk decompression — pinned transitively. */
  inflatePackage: string;
  inflateVersion: string;
  /**
   * `compact-only`: dense-stored attributes read back EMPTY, with no error. Contract guards
   * therefore read data, never attributes — see the module docblock.
   */
  attributeSupport: typeof ERA5_DECODER_ATTRIBUTE_SUPPORT;
}

/**
 * Read the decoder identity from the packages that are ACTUALLY INSTALLED.
 *
 * A hardcoded `'jsfive@0.4.0'` in the manifest would keep claiming 0.4.0 after somebody bumped the
 * dependency — a provenance record that cannot go stale is worth more than one that merely looks
 * precise.
 *
 * The version is found by resolving the package's entry point and walking UP to the nearest
 * `package.json` that actually names it. The obvious `require('jsfive/package.json')` does not
 * work: `jsfive` publishes an `exports` map that does not list `./package.json`, so Node refuses
 * the subpath outright (`ERR_PACKAGE_PATH_NOT_EXPORTED`) — a real failure this hit on the first
 * production run. `pako` is resolved relative to `jsfive`, because under pnpm it is a nested
 * transitive dependency and is not resolvable from here directly.
 */
export function readDecoderIdentity(
  resolveImpl: (id: string, fromDir?: string) => string = defaultResolve,
  readFileImpl: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): Era5DecoderIdentity {
  const readVersion = (packageName: string, fromDir?: string): { version: string; dir: string } => {
    let directory: string;
    try {
      directory = dirname(resolveImpl(packageName, fromDir));
    } catch (error: unknown) {
      throw new Era5ContractError(`could not resolve "${packageName}" for provenance.`, {
        cause: error,
      });
    }
    for (;;) {
      try {
        const parsed: unknown = JSON.parse(readFileImpl(join(directory, 'package.json')));
        if (typeof parsed === 'object' && parsed !== null) {
          const record = parsed as Record<string, unknown>;
          if (record.name === packageName && typeof record.version === 'string') {
            return { version: record.version, dir: directory };
          }
        }
      } catch {
        // No package.json here (or an unrelated one) — keep walking up.
      }
      const parent = dirname(directory);
      if (parent === directory) {
        throw new Era5ContractError(
          `walked to the filesystem root without finding a package.json naming "${packageName}".`,
        );
      }
      directory = parent;
    }
  };

  const decoder = readVersion(ERA5_DECODER_PACKAGE);
  return {
    package: ERA5_DECODER_PACKAGE,
    version: decoder.version,
    inflatePackage: 'pako',
    inflateVersion: readVersion('pako', decoder.dir).version,
    attributeSupport: ERA5_DECODER_ATTRIBUTE_SUPPORT,
  };
}

function defaultResolve(id: string, fromDir?: string): string {
  return fromDir === undefined ? require.resolve(id) : require.resolve(id, { paths: [fromDir] });
}

/**
 * The seam `era5-decode.ts` actually depends on.
 *
 * {@link Era5Hdf5File} is its only production implementation. It exists so the decode contract's
 * failure branches — a `scale_factor` appearing, `_FillValue` turning into a numeric sentinel, a
 * transposed dimension order, a non-`"0001"` `expver` — can be unit-tested with a fake, WITHOUT
 * shipping an HDF5 *writer* just to break files on purpose. That is the same injection the HTTP
 * path uses for `fetch`, the clock and sleep, applied one layer down.
 */
export interface Era5FileReader {
  keys(): readonly string[];
  globalAttributes(): Readonly<Record<string, unknown>>;
  dataset(name: string): Era5Dataset;
  readNumericDataset(name: string, expectedLength: number): Float64Array;
  readStringDataset(name: string, expectedLength: number): readonly string[];
}

/** A validated view of one HDF5 dataset. */
export interface Era5Dataset {
  name: string;
  /** Dimension sizes, outermost first — VALIDATED, never assumed. */
  shape: readonly number[];
  /** Attribute bag, keys only guaranteed to be strings. */
  attributes: Readonly<Record<string, unknown>>;
  /** numpy-style dtype string when the file gives a simple one, else `null`. */
  dtype: string | null;
}

/**
 * Open an HDF5/NetCDF4 file. The magic bytes are checked HERE, before `jsfive` sees them, so a
 * GRIB or ZIP payload produces our error rather than a library stack trace.
 */
export class Era5Hdf5File implements Era5FileReader {
  private readonly file: JsFiveFile;

  private constructor(file: JsFiveFile) {
    this.file = file;
  }

  static open(bytes: Uint8Array, filename: string): Era5Hdf5File {
    // `\x89HDF\r\n\x1a\n` — measured on the real CDS `unarchived` NetCDF response (probe M4).
    const magic = [0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.byteLength < magic.length) {
      throw new Era5ContractError(
        `${filename}: file is ${String(bytes.byteLength)} B — too short to be HDF5.`,
      );
    }
    for (let index = 0; index < magic.length; index += 1) {
      if (bytes[index] !== magic[index]) {
        const actual = Array.from(bytes.slice(0, magic.length))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join(' ');
        throw new Era5ContractError(
          `${filename}: magic bytes "${actual}" are not HDF5/NetCDF4 (expected 89 48 44 46 …). ` +
            'The provider changed `data_format`/`download_format`, or this is a GRIB payload.',
        );
      }
    }
    // `jsfive` wants an ArrayBuffer. `.slice()` on the underlying buffer respects any byteOffset
    // (a Uint8Array view is not always the whole buffer) and hands over an exact-length copy.
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    try {
      return new Era5Hdf5File(new JsFiveFile(buffer, filename));
    } catch (error: unknown) {
      throw new Era5ContractError(`${filename}: jsfive failed to open the file: ${String(error)}`, {
        cause: error,
        unexpected: true,
      });
    }
  }

  /** Top-level dataset/group names, validated to be strings. */
  keys(): readonly string[] {
    const raw: unknown = this.file.keys;
    if (!Array.isArray(raw)) {
      throw new Era5ContractError('jsfive returned a non-array for the root `keys`.', {
        unexpected: true,
      });
    }
    return raw.map((key: unknown, index: number) => {
      if (typeof key !== 'string') {
        throw new Era5ContractError(`root key at index ${String(index)} is not a string.`, {
          unexpected: true,
        });
      }
      return key;
    });
  }

  /** Global (root-group) attributes. */
  globalAttributes(): Readonly<Record<string, unknown>> {
    return asAttributeBag(this.file.attrs, 'root');
  }

  /** Fetch one dataset's metadata, failing closed when it is absent or is a group. */
  dataset(name: string): Era5Dataset {
    const raw: unknown = this.file.get(name);
    if (raw === null || raw === undefined) {
      throw new Era5ContractError(
        `variable "${name}" is not in the file. Present at root: ${this.keys().join(', ')}. ` +
          'The product changed — refusing to substitute another variable (SPEC §5.2).',
      );
    }
    const record = raw as { shape?: unknown; attrs?: unknown; dtype?: unknown };
    const shape = asShape(record.shape, name);
    const dtypeRaw: unknown = record.dtype;
    return {
      name,
      shape,
      attributes: asAttributeBag(record.attrs, name),
      dtype: typeof dtypeRaw === 'string' ? dtypeRaw : null,
    };
  }

  /**
   * Read a dataset's values as numbers, flat and C-ordered.
   *
   * **NaN is kept, not rejected.** `_FillValue` is NaN in this product, the sea mask is 24.4 % of
   * the box, and turning NaN into an error here would make the file unreadable; turning it into
   * `0` would publish a temperature of 0 °C for the Mediterranean. It is passed through, and
   * `era5-extract.ts` is what decides whether a NaN is legitimate (masked cell) or a defect
   * (masked cell where the mask should not be).
   */
  readNumericDataset(name: string, expectedLength: number): Float64Array {
    const raw: unknown = (this.file.get(name) as { value?: unknown } | null)?.value;
    if (!Array.isArray(raw)) {
      throw new Era5ContractError(
        `variable "${name}": jsfive returned ${typeof raw} for `.concat(
          '`.value`, expected an array.',
        ),
        { unexpected: true },
      );
    }
    if (raw.length !== expectedLength) {
      throw new Era5ContractError(
        `variable "${name}" has ${String(raw.length)} value(s), expected ${String(expectedLength)} ` +
          'from its own shape — the decoder and the dataspace disagree.',
        { unexpected: true },
      );
    }
    const out = new Float64Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) {
      const value: unknown = raw[index];
      if (typeof value !== 'number') {
        throw new Era5ContractError(
          `variable "${name}"[${String(index)}] is ${typeof value}, expected a number.`,
        );
      }
      // Finite OR NaN. ±Infinity is neither, and is a real corruption signal.
      if (!Number.isFinite(value) && !Number.isNaN(value)) {
        throw new Era5ContractError(
          `variable "${name}"[${String(index)}] is ${String(value)} — non-finite values other ` +
            'than NaN are not a legitimate ERA5-Land reading.',
        );
      }
      out[index] = value;
    }
    return out;
  }

  /** Read a dataset's values as strings (the `expver` case: `string expver(valid_time)`). */
  readStringDataset(name: string, expectedLength: number): readonly string[] {
    const raw: unknown = (this.file.get(name) as { value?: unknown } | null)?.value;
    if (!Array.isArray(raw)) {
      throw new Era5ContractError(
        `variable "${name}": jsfive returned ${typeof raw} for `.concat(
          '`.value`, expected an array.',
        ),
        { unexpected: true },
      );
    }
    if (raw.length !== expectedLength) {
      throw new Era5ContractError(
        `variable "${name}" has ${String(raw.length)} value(s), expected ${String(expectedLength)}.`,
      );
    }
    return raw.map((value: unknown, index: number) => {
      if (typeof value !== 'string') {
        throw new Era5ContractError(
          `variable "${name}"[${String(index)}] is ${typeof value}, expected a string.`,
        );
      }
      return value;
    });
  }
}

/**
 * An EMPTY shape array is legitimate: it is HDF5's scalar dataspace (rank 0), which holds exactly
 * one value. `expver` arrives that way in the single-month fixture, where cfgrib collapses it to a
 * scalar coordinate, while the 360-month production file returns it as a proper vector. Callers
 * distinguish the two — the production month-count assertion is NOT relaxed for it.
 */
function asShape(raw: unknown, what: string): readonly number[] {
  if (!Array.isArray(raw)) {
    throw new Era5ContractError(`"${what}": shape is not an array.`, { unexpected: true });
  }
  return raw.map((size: unknown, index: number) => {
    if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
      throw new Era5ContractError(
        `"${what}": shape[${String(index)}] = ${String(size)} is not a positive integer.`,
      );
    }
    return size;
  });
}

function asAttributeBag(raw: unknown, what: string): Readonly<Record<string, unknown>> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Era5ContractError(`"${what}": attributes are not a plain object.`, {
      unexpected: true,
    });
  }
  return raw as Record<string, unknown>;
}
