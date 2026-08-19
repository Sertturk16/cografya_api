import { describe, expect, it } from '@jest/globals';
import {
  ACAG_DECODER_PACKAGE,
  assertHdf5Magic,
  coveringRange,
  readDecoderIdentity,
  readRootStringAttribute,
} from './acag-hdf5.adapter';
import { AcagContractError } from './acag.errors';

/**
 * Direct tests for the ONE module that touches `h5wasm`. The happy path (reading real provider
 * bytes) can only exercise the branches a healthy 450 MB file takes; this file exercises the other
 * half — the gates that decide what happens when the provider or the dependency changes.
 */

const HDF5_HEAD = Uint8Array.from([0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('assertHdf5Magic', () => {
  it('accepts the HDF5 signature', () => {
    expect(() => assertHdf5Magic(HDF5_HEAD, 'ok.nc')).not.toThrow();
  });

  it('refuses a payload too short to be HDF5', () => {
    expect(() => assertHdf5Magic(Uint8Array.from([0x89, 0x48]), 'tiny.nc')).toThrow(/too short/);
  });

  it('refuses an HTML error page saved as .nc, and says what arrived', () => {
    // What a 403/404 from an object store actually looks like on disk.
    const html = new TextEncoder().encode('<!DOCTYPE html>');
    expect(() => assertHdf5Magic(html, 'error.nc')).toThrow(/does not start with the HDF5/);
    expect(() => assertHdf5Magic(html, 'error.nc')).toThrow(/3c 21 44 4f/);
  });

  it('refuses a ZIP payload', () => {
    const zip = new Uint8Array(8);
    zip.set([0x50, 0x4b, 0x03, 0x04], 0);
    expect(() => assertHdf5Magic(zip, 'archive.nc')).toThrow(AcagContractError);
  });
});

describe('coveringRange', () => {
  const ascending = Array.from({ length: 100 }, (_, index) =>
    Number((10 + index * 0.01).toFixed(4)),
  );

  it('covers the requested bounds with one cell of padding each side', () => {
    const range = coveringRange(ascending, 10.2, 10.3, 'lat');
    expect(ascending[range.start]).toBeLessThanOrEqual(10.2);
    expect(ascending[range.end - 1]).toBeGreaterThanOrEqual(10.3);
  });

  it('clamps at the axis edges instead of returning a negative index', () => {
    const range = coveringRange(ascending, 9, 11, 'lat');
    expect(range.start).toBe(0);
    expect(range.end).toBe(ascending.length);
  });

  it('THROWS when the axis covers none of the window — the regional-tile case', () => {
    // This is what an ACAG regional tile does to Türkiye: EU stops at 39.995°E, AF at 38.005°N.
    expect(() => coveringRange(ascending, 40, 45, 'lon')).toThrow(/covers none of the requested/);
  });

  it('refuses inverted bounds', () => {
    expect(() => coveringRange(ascending, 11, 10, 'lat')).toThrow(/inverted/);
  });
});

describe('readRootStringAttribute', () => {
  it('reads an h5wasm-shaped { value } attribute', () => {
    expect(
      readRootStringAttribute({ attrs: { TIMECOVERAGE: { value: '2024' } } }, 'TIMECOVERAGE'),
    ).toBe('2024');
  });

  it('reads a bare string attribute', () => {
    expect(readRootStringAttribute({ attrs: { TIMECOVERAGE: '1998' } }, 'TIMECOVERAGE')).toBe(
      '1998',
    );
  });

  it('unwraps a single-element array', () => {
    expect(
      readRootStringAttribute({ attrs: { TIMECOVERAGE: { value: ['2000'] } } }, 'TIMECOVERAGE'),
    ).toBe('2000');
  });

  /**
   * Fail-soft, but never a guess: an unreadable attribute is `null`, which the artifact records as
   * "unreadable" so `A-08c` cannot claim the file agreed with its own name.
   */
  it('returns null rather than guessing when the attribute is absent or not a string', () => {
    expect(readRootStringAttribute({ attrs: {} }, 'TIMECOVERAGE')).toBeNull();
    expect(readRootStringAttribute({}, 'TIMECOVERAGE')).toBeNull();
    expect(
      readRootStringAttribute({ attrs: { TIMECOVERAGE: { value: 2024 } } }, 'TIMECOVERAGE'),
    ).toBeNull();
    expect(readRootStringAttribute({ attrs: null }, 'TIMECOVERAGE')).toBeNull();
  });
});

describe('readDecoderIdentity', () => {
  it('reports the INSTALLED version, not a literal', () => {
    const identity = readDecoderIdentity();
    expect(identity.package).toBe(ACAG_DECODER_PACKAGE);
    // Shape only: pinning the version here would make a dependency bump fail a test that is not
    // about the dependency's behaviour.
    expect(identity.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  /**
   * REGRESSION. `h5wasm` publishes an `import`-only `exports` map, so under CommonJS every
   * `require.resolve` form throws `ERR_PACKAGE_PATH_NOT_EXPORTED` — while the dynamic `import()`
   * that does the decoding works. A resolve-based identity therefore fails only at the END of a
   * ~70-minute fetch, as the manifest is written. This asserts the resolution path does not
   * depend on the resolver at all.
   */
  it('does not depend on require.resolve, which cannot see an ESM-only package', () => {
    expect(() => require.resolve('h5wasm')).toThrow();
    expect(readDecoderIdentity().version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('walks UP the tree to find the installed package', () => {
    const readFile = (path: string): string => {
      if (path === '/a/b/node_modules/h5wasm/package.json') throw new Error('ENOENT');
      if (path === '/a/node_modules/h5wasm/package.json') {
        return JSON.stringify({ name: 'h5wasm', version: '9.9.9' });
      }
      throw new Error('ENOENT');
    };
    expect(readDecoderIdentity('/a/b', readFile).version).toBe('9.9.9');
  });

  it('STOPS rather than reporting an unknown version when nothing is installed', () => {
    expect(() =>
      readDecoderIdentity('/a/b', () => {
        throw new Error('ENOENT');
      }),
    ).toThrow(/walked to the filesystem root/);
  });

  it('ignores a package.json that does not NAME the package', () => {
    const readFile = (path: string): string => {
      if (path === '/a/b/node_modules/h5wasm/package.json') {
        return JSON.stringify({ name: 'something-else', version: '1.0.0' });
      }
      if (path === '/a/node_modules/h5wasm/package.json') {
        return JSON.stringify({ name: 'h5wasm', version: '0.10.3' });
      }
      throw new Error('ENOENT');
    };
    expect(readDecoderIdentity('/a/b', readFile).version).toBe('0.10.3');
  });
});
