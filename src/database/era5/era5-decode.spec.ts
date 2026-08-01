import { describe, expect, it } from '@jest/globals';
import {
  buildMonths,
  decodeEra5File,
  ERA5_UNITS_UNREADABLE_REASON,
  flatIndex,
} from './era5-decode';
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

  it('reads both core variables', () => {
    const decoded = decode();
    expect(decoded.variables.map((variable) => variable.mapping.fileName)).toEqual(['t2m', 'tp']);
  });

  it('carries the global `history` attribute — the stream=moda evidence for the tp factor', () => {
    expect(decode().globalAttributeSummary.history ?? '').toContain('"stream": ["moda"]');
  });

  it('records string and single-string-array attributes, and DROPS anything else', () => {
    // The summary is a string→string provenance map. Non-strings are dropped on purpose (see the
    // function docblock); the test exists so the drop stays a decision rather than a surprise.
    const summary = decode({
      globalAttributes: {
        Conventions: 'CF-1.7',
        history: 'filter_by_keys: {"stream": ["moda"]}',
        institution: ['ECMWF'],
        GRIB_subCentre: 0,
        someList: ['a', 'b'],
      },
    }).globalAttributeSummary;
    expect(summary.Conventions).toBe('CF-1.7');
    expect(summary.institution).toBe('ECMWF');
    expect(Object.keys(summary)).not.toContain('GRIB_subCentre');
    expect(Object.keys(summary)).not.toContain('someList');
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

  // ── the guards that replaced the unreadable attributes (Atlas ruling O-1) ──
  // Every one of these used to be an attribute lookup. They are data scans now, because this
  // decoder reads dense-stored attributes back as an EMPTY BAG with no error — which made the
  // packing guard in particular a check that could never fire.

  it('REFUSES PACKED values via the physical band — the guard `scale_factor` used to pretend to be', () => {
    const latCount = TEST_LATITUDE_AXIS.length;
    const lonCount = TEST_LONGITUDE_AXIS.length;
    // What a packed int16 file looks like when read raw: plausible-looking integers, wildly
    // outside the physical band. The old attribute check would have passed this file.
    const values = new Float64Array(2 * latCount * lonCount).fill(14_237);
    values[0] = Number.NaN;
    expect(() => decode({ variables: [{ name: 't2m', attributes: {}, values }] })).toThrow(
      /outside the physical band/,
    );
  });

  it('names PACKING as the likely cause, so the next reader is not left guessing', () => {
    const values = new Float64Array(
      2 * TEST_LATITUDE_AXIS.length * TEST_LONGITUDE_AXIS.length,
    ).fill(14_237);
    values[0] = Number.NaN;
    expect(() => decode({ variables: [{ name: 't2m', attributes: {}, values }] })).toThrow(
      /scale_factor\/add_offset/,
    );
  });

  it('REFUSES each numeric sentinel appearing as a reading', () => {
    const latCount = TEST_LATITUDE_AXIS.length;
    const lonCount = TEST_LONGITUDE_AXIS.length;
    for (const sentinel of [3.4028234663852886e38, -999, 9.969209968386869e36]) {
      const values = new Float64Array(2 * latCount * lonCount).fill(288);
      values[0] = Number.NaN;
      values[17] = sentinel;
      expect(() => decode({ variables: [{ name: 't2m', attributes: {}, values }] })).toThrow(
        /masquerading as a reading/,
      );
    }
  });

  it('REFUSES a grid with NO masked cell — NaN must still be how missing-ness is expressed', () => {
    const values = new Float64Array(
      2 * TEST_LATITUDE_AXIS.length * TEST_LONGITUDE_AXIS.length,
    ).fill(288);
    expect(() => decode({ variables: [{ name: 't2m', attributes: {}, values }] })).toThrow(
      /contains NO masked cell/,
    );
  });

  it('KEEPS NaN as data — the sea mask is information, not corruption', () => {
    const decoded = decode({ maskedCells: new Set(['0,0', '1,1']) });
    expect(decoded.maskedCellCount).toBe(2);
  });

  it('reports units as null (unreadable) rather than pretending the file has none', () => {
    // The decoder cannot read dense-stored attributes; the manifest states the reason explicitly.
    expect(ERA5_UNITS_UNREADABLE_REASON).toContain('not readable');
    expect(ERA5_UNITS_UNREADABLE_REASON).toContain('stream=moda');
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

  it('proves the EPOCH from the values, not from an attribute', () => {
    // Read as anything other than seconds-since-1970, these integers do not land on a gapless run
    // of month-starts — so passing `buildMonths` IS the epoch proof.
    const decoded = decode({ monthCount: 3 });
    expect(decoded.months.map((month) => month.year)).toEqual([1991, 1991, 1991]);
    expect(decoded.months.map((month) => month.month)).toEqual([1, 2, 3]);
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
