import { describe, expect, it } from '@jest/globals';
import { buildMonths, decodeEra5File, flatIndex } from './era5-decode';
import {
  buildFakeEra5File,
  TEST_LATITUDE_AXIS,
  TEST_LONGITUDE_AXIS,
  type SyntheticFileOptions,
} from './era5-fixture.builder';
import { ERA5_VARIABLES } from './era5-request';
import { Era5ContractError } from './era5.errors';

/**
 * Every FILE-CONTRACT violation class gets its own test (SPEC §5.2).
 *
 * These run against a synthetic reader, not real bytes, and that is the point: a real download
 * will never hand us a `scale_factor` or a transposed dimension order, so the only way to prove
 * the guard fires is to build the broken file ourselves. Decoder CORRECTNESS over real provider
 * bytes is a different question, answered by `era5-golden.spec.ts`.
 */

const decode = (options: SyntheticFileOptions = {}): ReturnType<typeof decodeEra5File> =>
  decodeEra5File(new Uint8Array(0), 'synthetic.nc', {
    openImpl: () => buildFakeEra5File(options),
  });

describe('decodeEra5File — the healthy file', () => {
  it('reads the measured axis directions and lengths', () => {
    const decoded = decode();
    expect(decoded.latitudeAxis).toHaveLength(71);
    expect(decoded.longitudeAxis).toHaveLength(196);
    expect(decoded.latitudeSummary.step).toBeLessThan(0);
    expect(decoded.longitudeSummary.step).toBeGreaterThan(0);
    expect(decoded.latitudeSummary.first).toBeCloseTo(42.5, 6);
    expect(decoded.longitudeSummary.last).toBeCloseTo(45.0, 6);
  });

  it('reads both core variables and keeps the MISLEADING tp units attribute verbatim', () => {
    const decoded = decode();
    expect(decoded.variables.map((variable) => variable.mapping.fileName)).toEqual(['t2m', 'tp']);
    // Recorded, never trusted: the file says "m" and means "m per day" (stream=moda).
    expect(decoded.variables[1]?.unitsAttribute).toBe('m');
  });

  it('carries the global `history` attribute — the stream=moda evidence for the tp factor', () => {
    expect(decode().globalAttributeSummary.history ?? '').toContain('"stream": ["moda"]');
  });

  it('counts the masked cells of the first time step', () => {
    const decoded = decode({ maskedCells: new Set(['0,0', '0,1', '5,5']) });
    expect(decoded.maskedCellCount).toBe(3);
    expect(decoded.totalCellCount).toBe(71 * 196);
  });
});

describe('decodeEra5File — contract violations, one class at a time', () => {
  it('REFUSES a file whose variable is missing (no substitution)', () => {
    expect(() => decode({ omit: ['tp'] })).toThrow(Era5ContractError);
  });

  it('REFUSES a `scale_factor` appearing where the measured product had none', () => {
    expect(() =>
      decode({
        variables: [
          { name: 't2m', attributes: { units: 'K', _FillValue: Number.NaN, scale_factor: 0.01 } },
          { name: 'tp', attributes: { units: 'm', _FillValue: Number.NaN } },
        ],
      }),
    ).toThrow(/scale_factor/);
  });

  it('REFUSES an `add_offset` appearing', () => {
    expect(() =>
      decode({
        variables: [
          { name: 't2m', attributes: { units: 'K', _FillValue: Number.NaN, add_offset: 200 } },
        ],
      }),
    ).toThrow(/add_offset/);
  });

  it("REFUSES a `_FillValue` that turned into a numeric sentinel (CAMS's −999)", () => {
    expect(() =>
      decode({
        variables: [{ name: 't2m', attributes: { units: 'K', _FillValue: -999 } }],
      }),
    ).toThrow(/_FillValue = -999, expected NaN/);
  });

  it('REFUSES a GRIB_missingValue that actually OCCURS in the data', () => {
    const latCount = TEST_LATITUDE_AXIS.length;
    const lonCount = TEST_LONGITUDE_AXIS.length;
    const values = new Float64Array(2 * latCount * lonCount).fill(288);
    values[17] = 3.4028234663852886e38;
    expect(() =>
      decode({
        variables: [
          {
            name: 't2m',
            attributes: {
              units: 'K',
              _FillValue: Number.NaN,
              GRIB_missingValue: 3.4028234663852886e38,
            },
            values,
          },
        ],
      }),
    ).toThrow(/GRIB_missingValue/);
  });

  it('REFUSES a transposed DIMENSION ORDER — every value would come from the wrong place', () => {
    expect(() =>
      decode({
        variables: [
          {
            name: 't2m',
            attributes: { units: 'K', _FillValue: Number.NaN },
            shape: [2, TEST_LONGITUDE_AXIS.length, TEST_LATITUDE_AXIS.length],
          },
        ],
      }),
    ).toThrow(/DIMENSION ORDER changed/);
  });

  it('REFUSES a variable with the wrong number of dimensions', () => {
    expect(() =>
      decode({
        variables: [{ name: 't2m', attributes: { _FillValue: Number.NaN }, shape: [2, 71] }],
      }),
    ).toThrow(/expected 3/);
  });

  it('REFUSES an expver that is not "0001" throughout (ERA5T mixed in)', () => {
    expect(() => decode({ expverValues: ['0001', '0005'] })).toThrow(/expver values are not/);
  });

  it('REFUSES an expver whose length no longer matches valid_time', () => {
    expect(() => decode({ expverValues: ['0001'] })).toThrow(/the product gained a dimension/);
  });

  it('REFUSES a valid_time with a non-CF epoch', () => {
    expect(() => decode({ timeUnits: 'hours since 1900-01-01' })).toThrow(/valid_time:units/);
  });

  it("REFUSES a month count that differs from the caller's expectation", () => {
    expect(() =>
      decodeEra5File(new Uint8Array(0), 'synthetic.nc', {
        expectedMonthCount: 360,
        openImpl: () => buildFakeEra5File({ monthCount: 2 }),
      }),
    ).toThrow(/valid_time has 2 entries, expected 360/);
  });

  it('REFUSES a non-monotonic latitude axis via the axis guard', () => {
    expect(() => decode({ latitudeAxis: [42.5, 42.4, 42.6, 42.3] })).toThrow(/NOT MONOTONIC/);
  });

  it('REFUSES a grid whose three dimension sizes stop being pairwise distinct', () => {
    // The dimension-ORDER check is sound only while the sizes differ. If they ever coincide the
    // check silently stops discriminating, so the premise is asserted rather than assumed.
    const axis = Array.from({ length: 4 }, (_unused, index) => 42.5 - index * 0.1);
    expect(() =>
      decode({ monthCount: 4, latitudeAxis: axis, longitudeAxis: [25.5, 25.6, 25.7, 25.8] }),
    ).toThrow(/no longer pairwise distinct/);
  });

  it('accepts the single-variable, single-month FIXTURE shape', () => {
    const decoded = decodeEra5File(new Uint8Array(0), 'mini.nc', {
      variables: ERA5_VARIABLES.slice(0, 1),
      expectedMonthCount: 1,
      openImpl: () =>
        buildFakeEra5File({
          monthCount: 1,
          expverValues: ['0001'],
          variables: [{ name: 't2m', attributes: { units: 'K', _FillValue: Number.NaN } }],
        }),
    });
    expect(decoded.months).toHaveLength(1);
    expect(decoded.months[0]).toMatchObject({ year: 1991, month: 1 });
  });
});

describe('buildMonths', () => {
  it('turns CF epoch seconds into calendar months', () => {
    const months = buildMonths([
      Date.UTC(1991, 0, 1) / 1000,
      Date.UTC(1991, 1, 1) / 1000,
      Date.UTC(1991, 2, 1) / 1000,
    ]);
    expect(months.map((month) => `${String(month.year)}-${String(month.month)}`)).toEqual([
      '1991-1',
      '1991-2',
      '1991-3',
    ]);
  });

  it('rolls the year over at December', () => {
    const months = buildMonths([Date.UTC(1991, 11, 1) / 1000, Date.UTC(1992, 0, 1) / 1000]);
    expect(months[1]).toMatchObject({ year: 1992, month: 1 });
  });

  it('REFUSES a gap in the series — a dropped month shifts a 30-year average', () => {
    expect(() => buildMonths([Date.UTC(1991, 0, 1) / 1000, Date.UTC(1991, 2, 1) / 1000])).toThrow(
      /gap or a duplicate/,
    );
  });

  it('REFUSES a non-increasing series', () => {
    expect(() => buildMonths([Date.UTC(1991, 1, 1) / 1000, Date.UTC(1991, 0, 1) / 1000])).toThrow(
      /not strictly increasing/,
    );
  });

  it('REFUSES a timestamp that is not midnight UTC on the first of a month', () => {
    expect(() => buildMonths([Date.UTC(1991, 0, 15) / 1000])).toThrow(/not midnight UTC/);
  });

  it('REFUSES a value that overflowed the int64 decode', () => {
    expect(() => buildMonths([Number.MAX_SAFE_INTEGER + 2])).toThrow(/not a safe integer/);
  });
});

describe('flatIndex', () => {
  it('is C-ordered [time][lat][lon]', () => {
    expect(flatIndex(0, 0, 0, 71, 196)).toBe(0);
    expect(flatIndex(0, 0, 5, 71, 196)).toBe(5);
    expect(flatIndex(0, 1, 0, 71, 196)).toBe(196);
    expect(flatIndex(1, 0, 0, 71, 196)).toBe(71 * 196);
  });
});
