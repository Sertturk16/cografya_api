import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Era5ContractError } from '../era5.errors';
import {
  ERA5_DECODER_ATTRIBUTE_SUPPORT,
  ERA5_DECODER_PACKAGE,
  Era5Hdf5File,
  readDecoderIdentity,
} from './jsfive.adapter';

/**
 * DIRECT tests for the one module that touches `jsfive` — the SPEC §5.1 acceptance centrepiece.
 *
 * `era5-golden.spec.ts` proves the adapter reads the RIGHT numbers out of real provider bytes.
 * That is the happy path, and it can only ever exercise the branches a healthy file takes. This
 * file exercises the other half: the magic-byte gate, the "everything is `unknown` until proven"
 * validators, and `readDecoderIdentity`'s resolution walk. Those are the branches that decide what
 * happens when the provider or the dependency changes, so leaving them to the happy path would
 * mean the fail-closed posture is a claim rather than a tested property.
 *
 * The real committed fixture is used wherever real bytes make the test stronger; the failure
 * branches use hand-built byte sequences, because no download will ever hand us a GRIB payload in
 * a `.nc` file on purpose.
 */

const FIXTURE_DIR = join(__dirname, '..', '..', '..', '..', 'test', 'fixtures', 'era5');
const FIXTURE_NAME = 'mini-tr-t2m-1991-01.nc';

interface GoldenReference {
  attributes: Record<string, string | null>;
}

const fixtureBytes = new Uint8Array(readFileSync(join(FIXTURE_DIR, FIXTURE_NAME)));
const reference = JSON.parse(
  readFileSync(join(FIXTURE_DIR, 'reference.json'), 'utf8'),
) as GoldenReference;

describe('Era5Hdf5File.open — the magic-byte gate', () => {
  it('refuses a payload that is too short to be HDF5', () => {
    expect(() => Era5Hdf5File.open(new Uint8Array([0x89, 0x48]), 'tiny.nc')).toThrow(
      /too short to be HDF5/,
    );
  });

  it('refuses a GRIB payload and names the likely cause', () => {
    // `GRIB` in ASCII — what arrives if `data_format` flips back to grib.
    const grib = new Uint8Array(64);
    grib.set([0x47, 0x52, 0x49, 0x42], 0);
    expect(() => Era5Hdf5File.open(grib, 'wrong.nc')).toThrow(/are not HDF5\/NetCDF4/);
    expect(() => Era5Hdf5File.open(grib, 'wrong.nc')).toThrow(/download_format/);
  });

  it('refuses a ZIP payload before `jsfive` ever sees it', () => {
    const zip = new Uint8Array(64);
    zip.set([0x50, 0x4b, 0x03, 0x04], 0);
    expect(() => Era5Hdf5File.open(zip, 'archive.nc')).toThrow(Era5ContractError);
  });

  it('reports the bytes it actually saw, so the next reader is not left guessing', () => {
    const grib = new Uint8Array(64);
    grib.set([0x47, 0x52, 0x49, 0x42], 0);
    expect(() => Era5Hdf5File.open(grib, 'wrong.nc')).toThrow(/47 52 49 42/);
  });

  it('opens a file whose bytes are a VIEW into a larger buffer', () => {
    // A `Uint8Array` is not always the whole buffer; handing `jsfive` the wrong slice would move
    // every offset in the file.
    const padded = new Uint8Array(fixtureBytes.byteLength + 8);
    padded.set(fixtureBytes, 8);
    const view = padded.subarray(8);
    expect(Era5Hdf5File.open(view, FIXTURE_NAME).keys()).toContain('t2m');
  });
});

describe('Era5Hdf5File — validated reads over the REAL committed fixture', () => {
  const file = Era5Hdf5File.open(fixtureBytes, FIXTURE_NAME);

  it('validates the root keys as strings', () => {
    expect(file.keys()).toEqual(expect.arrayContaining(['t2m', 'latitude', 'longitude', 'expver']));
  });

  it('refuses a variable that is not in the file, and lists what IS', () => {
    // Measured: `jsfive` THROWS a bare string here rather than returning null, so an unwrapped
    // lookup would let a typeless value escape the adapter. It must arrive as Era5ContractError.
    expect(() => file.dataset('t2m_v2')).toThrow(Era5ContractError);
    expect(() => file.dataset('t2m_v2')).toThrow(/could not be read/);
    expect(() => file.dataset('t2m_v2')).toThrow(/refusing to substitute another variable/);
    expect(() => file.dataset('t2m_v2')).toThrow(/Present at root: .*t2m/);
    expect(() => file.readNumericDataset('t2m_v2', 1)).toThrow(Era5ContractError);
    expect(() => file.readStringDataset('expver_v2', 1)).toThrow(Era5ContractError);
  });

  it('reads a dataset shape as validated positive integers', () => {
    expect(file.dataset('t2m').shape).toEqual([1, 71, 196]);
    expect(file.dataset('latitude').shape).toEqual([71]);
  });

  it('accepts the SCALAR dataspace `expver` arrives in on a single-month file', () => {
    // rank 0 — cfgrib collapses the coordinate. An empty shape is legitimate, not a defect.
    expect(file.dataset('expver').shape).toEqual([]);
    expect(file.readStringDataset('expver', 1)).toEqual(['0001']);
  });

  it('refuses a length that disagrees with the dataspace, on both readers', () => {
    expect(() => file.readNumericDataset('latitude', 70)).toThrow(
      /the decoder and the dataspace disagree/,
    );
    expect(() => file.readStringDataset('expver', 2)).toThrow(/expected 2/);
  });

  it('keeps NaN as data — the sea mask is information, not corruption', () => {
    const values = file.readNumericDataset('t2m', 1 * 71 * 196);
    expect(values.some((value) => Number.isNaN(value))).toBe(true);
    expect(values.some((value) => Number.isFinite(value))).toBe(true);
  });

  it('reads the ROOT-GROUP attributes, which is where the tp evidence lives', () => {
    const attributes = file.globalAttributes();
    expect(typeof attributes.history).toBe('string');
    expect(String(attributes.history)).toContain('moda');
  });

  it('VERIFIES the `compact-only` disclosure instead of just declaring it', () => {
    // The whole O-1 ruling rests on this limitation being real: `t2m` carries 33 attributes
    // according to the C libraries, and this decoder reads back an EMPTY BAG with no error. If a
    // future version started reading them, this test fails and the manifest's
    // `attributeSupport: "compact-only"` claim — and the ban on attribute guards — must be
    // revisited rather than quietly kept.
    expect(Object.keys(reference.attributes).some((key) => key.startsWith('t2m:'))).toBe(true);
    expect(Object.keys(file.dataset('t2m').attributes)).toEqual([]);
    expect(Object.keys(file.dataset('valid_time').attributes)).toEqual([]);
    expect(ERA5_DECODER_ATTRIBUTE_SUPPORT).toBe('compact-only');
  });
});

describe('readDecoderIdentity', () => {
  it('reports the versions of the packages that are ACTUALLY INSTALLED', () => {
    const identity = readDecoderIdentity();
    expect(identity.package).toBe(ERA5_DECODER_PACKAGE);
    expect(identity.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(identity.inflatePackage).toBe('pako');
    expect(identity.inflateVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(identity.attributeSupport).toBe('compact-only');
  });

  it('walks UP to the package.json that NAMES the package, skipping unrelated ones', () => {
    // `require('jsfive/package.json')` is refused by the package's `exports` map, so the version
    // is found by walking up — past directories with no package.json and past ones belonging to
    // another package.
    const files: Record<string, string> = {
      '/pkgs/jsfive/lib/nested/package.json': JSON.stringify({ name: 'other', version: '9.9.9' }),
      '/pkgs/jsfive/package.json': JSON.stringify({ name: 'jsfive', version: '0.4.0' }),
      '/pkgs/jsfive/node_modules/pako/package.json': JSON.stringify({
        name: 'pako',
        version: '2.2.0',
      }),
    };
    const identity = readDecoderIdentity(
      (id, fromDir) =>
        id === 'jsfive'
          ? '/pkgs/jsfive/lib/nested/index.js'
          : `${fromDir ?? ''}/node_modules/pako/index.js`,
      (path) => {
        const found = files[path];
        if (found === undefined) throw new Error(`ENOENT ${path}`);
        return found;
      },
    );
    expect(identity.version).toBe('0.4.0');
    expect(identity.inflateVersion).toBe('2.2.0');
  });

  it('REFUSES to record provenance it could not resolve', () => {
    expect(() =>
      readDecoderIdentity(
        () => {
          throw new Error('MODULE_NOT_FOUND');
        },
        () => '{}',
      ),
    ).toThrow(/could not resolve "jsfive" for provenance/);
  });

  it('REFUSES rather than inventing a version when no package.json names the package', () => {
    expect(() =>
      readDecoderIdentity(
        () => '/pkgs/jsfive/lib/index.js',
        () => JSON.stringify({ name: 'someone-else', version: '1.0.0' }),
      ),
    ).toThrow(/walked to the filesystem root/);
  });
});
