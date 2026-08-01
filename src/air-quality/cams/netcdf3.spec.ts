import { describe, expect, it } from '@jest/globals';
import { CamsContractError } from './cams.errors';
import { buildNetcdf3, type FixtureFileSpec } from './netcdf3-fixture.builder';
import { parseNetcdf3 } from './netcdf3';

/**
 * Reader tests over PROGRAMMATIC fixtures (plan §5.5). The anchor against "the writer and the
 * reader share the same wrong model" is the committed REAL golden file exercised in
 * `cams-decode.spec.ts`; the byte-level format facts of the writer itself are pinned in
 * `netcdf3-fixture.builder.spec.ts`.
 */

/** A miniature production-shaped file: (time, level, latitude, longitude) = (2, 1, 2, 3). */
function miniSpec(): FixtureFileSpec {
  return {
    recordCount: 2,
    dimensions: [
      { name: 'longitude', length: 3 },
      { name: 'latitude', length: 2 },
      { name: 'level', length: 1 },
      { name: 'time', length: 'record' },
    ],
    globalAttributes: [{ name: 'FORECAST', value: 'Europe, 20260801+[0H_96H]' }],
    variables: [
      { name: 'longitude', dimensions: ['longitude'], data: [25.55, 25.65, 25.75] },
      { name: 'latitude', dimensions: ['latitude'], data: [42.45, 42.35] },
      { name: 'level', dimensions: ['level'], data: [0] },
      {
        name: 'time',
        dimensions: ['time'],
        attributes: [
          { name: 'units', value: 'hours' },
          { name: 'long_name', value: 'FORECAST time from 20260801' },
        ],
        data: [0, 1],
      },
      {
        name: 'pm2p5_conc',
        dimensions: ['time', 'level', 'latitude', 'longitude'],
        attributes: [
          { name: 'units', value: 'µg/m3' },
          { name: '_FillValue', value: [-999] },
        ],
        // record 0: 1..6, record 1: 11..16 (row-major lat × lon)
        data: [1, 2, 3, 4, 5, 6, 11, 12, 13, 14, 15, 16],
      },
    ],
  };
}

describe('parseNetcdf3', () => {
  it('reads dimensions, attributes, fixed variables and record blocks of a classic file', () => {
    const file = parseNetcdf3(buildNetcdf3(miniSpec()));

    expect(file.recordCount).toBe(2);
    expect(file.dimensions.map((dimension) => dimension.name)).toEqual([
      'longitude',
      'latitude',
      'level',
      'time',
    ]);
    // The record dimension surfaces the real record count, not the header's 0.
    expect(file.dimensions[3]?.length).toBe(2);

    expect(file.readFixedNumeric('longitude')).toEqual([
      Math.fround(25.55),
      Math.fround(25.65),
      Math.fround(25.75),
    ]);
    expect(file.attribute('pm2p5_conc', 'units')?.value).toBe('µg/m3');
    expect(file.attribute('pm2p5_conc', '_FillValue')?.value).toEqual([-999]);

    expect(file.readRecordBlock('pm2p5_conc', 0)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(file.readRecordBlock('pm2p5_conc', 1)).toEqual([11, 12, 13, 14, 15, 16]);
    expect(file.readRecordBlock('time', 1)).toEqual([1]);
  });

  it('handles the single-record-variable layout (blocks unpadded)', () => {
    const spec = miniSpec();
    // Drop the time variable so pm2p5_conc is the ONLY record variable.
    spec.variables = spec.variables.filter((variable) => variable.name !== 'time');
    const file = parseNetcdf3(buildNetcdf3(spec));
    expect(file.readRecordBlock('pm2p5_conc', 1)).toEqual([11, 12, 13, 14, 15, 16]);
  });

  it('refuses a missing expected variable with a typed error naming what IS present', () => {
    const file = parseNetcdf3(buildNetcdf3(miniSpec()));
    expect(() => file.variable('no2_conc')).toThrow(CamsContractError);
    expect(() => file.variable('no2_conc')).toThrow(/pm2p5_conc/);
  });

  it('refuses CDF-2 (64-bit offset) and non-NetCDF magics — fail-closed, never best-effort', () => {
    const bytes = buildNetcdf3(miniSpec());
    const cdf2 = Uint8Array.from(bytes);
    cdf2[3] = 0x02;
    expect(() => parseNetcdf3(cdf2)).toThrow(/version byte/);

    const hdf5 = Uint8Array.from(bytes);
    hdf5[0] = 0x89;
    expect(() => parseNetcdf3(hdf5)).toThrow(CamsContractError);
  });

  it('refuses a truncated file (data extent outside the buffer)', () => {
    const bytes = buildNetcdf3(miniSpec());
    const truncated = bytes.subarray(0, bytes.byteLength - 8);
    const file = parseNetcdf3(truncated);
    expect(() => file.readRecordBlock('pm2p5_conc', 1)).toThrow(/lies outside the/);
  });

  it('refuses an implausible numrecs (a corrupt/hostile header sizes every downstream loop)', () => {
    const bytes = Uint8Array.from(buildNetcdf3(miniSpec()));
    new DataView(bytes.buffer).setInt32(4, 2_000_000, false); // numrecs lives at offset 4
    expect(() => parseNetcdf3(bytes)).toThrow(/implausible record count/);
  });

  it('refuses out-of-range record reads and wrong read modes', () => {
    const file = parseNetcdf3(buildNetcdf3(miniSpec()));
    expect(() => file.readRecordBlock('pm2p5_conc', 2)).toThrow(CamsContractError);
    expect(() => file.readRecordBlock('longitude', 0)).toThrow(/not a record variable/);
    expect(() => file.readFixedNumeric('time')).toThrow(/record variable/);
  });
});
