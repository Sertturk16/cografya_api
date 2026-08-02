import { describe, expect, it } from '@jest/globals';
import { AirQualityPollutant, AirQualityStatus } from '../air-quality.types';
import { CamsContractError } from './cams.errors';
import { CAMS_DECODER_VERSION, decodeCamsFile } from './cams-decode';
import { NC_SHORT, parseNetcdf3 } from './netcdf3';
import {
  buildNetcdf3,
  buildZipArchive,
  type FixtureFileSpec,
  type FixtureVariable,
} from './netcdf3-fixture.builder';

/**
 * Decode-orchestration tests over PROGRAMMATIC fixtures (plan §5.5): the real production file
 * carries ZERO missing values (measured, 6 620 250/6 620 250 present), so the `_FillValue`,
 * `not_supported`, wrong-unit and wrong-day paths can ONLY be exercised synthetically. The
 * real-bytes anchor is `cams-golden.spec.ts` over the committed probe fixture.
 */

const FILL = -999;

interface MiniFileOptions {
  pm25Data?: number[];
  pm25Attributes?: FixtureVariable['attributes'];
  extraVariables?: FixtureVariable[];
  timeLongName?: string;
  timeUnits?: string;
}

/** (time=2, level=1, latitude=2, longitude=3) around the measured TR axes. */
function miniSpec(options: MiniFileOptions = {}): FixtureFileSpec {
  return {
    recordCount: 2,
    dimensions: [
      { name: 'longitude', length: 3 },
      { name: 'latitude', length: 2 },
      { name: 'level', length: 1 },
      { name: 'time', length: 'record' },
    ],
    variables: [
      { name: 'longitude', dimensions: ['longitude'], data: [25.55, 25.65, 25.75] },
      { name: 'latitude', dimensions: ['latitude'], data: [42.45, 42.35] },
      { name: 'level', dimensions: ['level'], data: [0] },
      {
        name: 'time',
        dimensions: ['time'],
        attributes: [
          { name: 'units', value: options.timeUnits ?? 'hours' },
          { name: 'long_name', value: options.timeLongName ?? 'FORECAST time from 20260801' },
        ],
        data: [0, 1],
      },
      {
        name: 'pm2p5_conc',
        dimensions: ['time', 'level', 'latitude', 'longitude'],
        attributes: options.pm25Attributes ?? [
          { name: 'units', value: 'µg/m3' },
          { name: '_FillValue', value: [FILL] },
        ],
        data: options.pm25Data ?? [1, 2, 3, 4, 5, 6, 11, 12, 13, 14, 15, 16],
      },
      ...(options.extraVariables ?? []),
    ],
  };
}

function miniFile(options: MiniFileOptions = {}): Uint8Array {
  return buildZipArchive([{ name: 'ENS_FORECAST.nc', bytes: buildNetcdf3(miniSpec(options)) }]);
}

/** Zip a hand-mutated spec (the negative-fixture path). */
function zipSpec(spec: FixtureFileSpec): Uint8Array {
  return buildZipArchive([{ name: 'ENS_FORECAST.nc', bytes: buildNetcdf3(spec) }]);
}

const POINT = { plateCode: '39', latitude: 42.44, longitude: 25.66 };
const DECODE_OPTIONS = {
  expectedRunDate: '20260801',
  points: [POINT],
  pollutants: [AirQualityPollutant.Pm2_5],
};

describe('decodeCamsFile — happy path', () => {
  it('extracts the right cell, verbatim values, evidence fields and decoder version', () => {
    const decoded = decodeCamsFile(miniFile(), DECODE_OPTIONS);

    expect(decoded.entryName).toBe('ENS_FORECAST.nc');
    expect(decoded.zipMethod).toBe(0);
    expect(decoded.innerFormat).toBe('netcdf3-classic');
    expect(decoded.decoderVersion).toBe(CAMS_DECODER_VERSION);
    expect(decoded.timeHours).toEqual([0, 1]);
    expect(decoded.latitudeAxis.step).toBeCloseTo(-0.1, 4); // descending, signed
    expect(decoded.fileVariableNames[AirQualityPollutant.Pm2_5]).toBe('pm2p5_conc');
    expect(decoded.units[AirQualityPollutant.Pm2_5]).toBe('µg/m3');
    expect(decoded.fillValues[AirQualityPollutant.Pm2_5]).toBe(FILL);

    const province = decoded.provinces[0];
    expect(province).toBeDefined();
    expect(province?.outsideDomain).toBe(false);
    expect(province?.gridLatitude).toBeCloseTo(42.45, 3);
    expect(province?.gridLongitude).toBeCloseTo(25.65, 3);
    expect(province?.distanceKm).toBeLessThan(province?.thresholdKm ?? 0);
    // Row-major (lat, lon): record 0 → [1,2,3 / 4,5,6]; cell (0,1) = 2; record 1 → 12.
    expect(province?.series[AirQualityPollutant.Pm2_5]).toEqual([2, 12]);
    expect(province?.support[AirQualityPollutant.Pm2_5]).toBe(AirQualityStatus.Ok);
  });
});

describe('decodeCamsFile — null classification (SPEC §7.4, hand-built fixtures)', () => {
  it('_FillValue (−999) → null per step; NEGATIVE values → null (second line of defence)', () => {
    const decoded = decodeCamsFile(
      // Cell (0,1): record 0 carries the fill value, record 1 carries a negative. A second
      // point on the healthy cell (0,0) keeps the file PARTIALLY usable — a fully unusable
      // request is the outcome-guard refusal tested below, not this class.
      miniFile({ pm25Data: [1, FILL, 3, 4, 5, 6, 11, -0.5, 13, 14, 15, 16] }),
      {
        ...DECODE_OPTIONS,
        points: [POINT, { plateCode: '40', latitude: 42.44, longitude: 25.56 }],
      },
    );
    const province = decoded.provinces.find((row) => row.plateCode === POINT.plateCode);
    expect(province?.series[AirQualityPollutant.Pm2_5]).toEqual([null, null]);
    // Every step missing → the structural not_supported class.
    expect(province?.support[AirQualityPollutant.Pm2_5]).toBe(AirQualityStatus.NotSupported);
    // The healthy neighbour is untouched: per-province classification, no cross-talk.
    const healthy = decoded.provinces.find((row) => row.plateCode === '40');
    expect(healthy?.series[AirQualityPollutant.Pm2_5]).toEqual([1, 11]);
    expect(healthy?.support[AirQualityPollutant.Pm2_5]).toBe(AirQualityStatus.Ok);
  });

  it('SOME steps missing → per-step nulls, support stays ok — and NO neighbour/interpolation fill', () => {
    const decoded = decodeCamsFile(
      miniFile({ pm25Data: [1, FILL, 3, 4, 5, 6, 11, 12, 13, 14, 15, 16] }),
      DECODE_OPTIONS,
    );
    const province = decoded.provinces[0];
    expect(province?.series[AirQualityPollutant.Pm2_5]).toEqual([null, 12]);
    expect(province?.support[AirQualityPollutant.Pm2_5]).toBe(AirQualityStatus.Ok);
    // The neighbouring cells hold plausible values (1, 3…) — the null PROVES none was
    // borrowed. Interpolation/averaging/nearest-full-cell are banned (SPEC §7.4).
  });

  it('missing _FillValue attribute → schema error, never "treat everything as valid"', () => {
    const archive = miniFile({ pm25Attributes: [{ name: 'units', value: 'µg/m3' }] });
    expect(() => decodeCamsFile(archive, DECODE_OPTIONS)).toThrow(CamsContractError);
    expect(() => decodeCamsFile(archive, DECODE_OPTIONS)).toThrow(/no scalar _FillValue/);
  });

  it('an implausibly LARGE value (NetCDF default-fill leak, ~9.97e36) → null, never band 6', () => {
    const decoded = decodeCamsFile(
      // Cell (0,1), record 0 carries the float default fill; record 1 is healthy.
      miniFile({ pm25Data: [1, 9.96921e36, 3, 4, 5, 6, 11, 12, 13, 14, 15, 16] }),
      DECODE_OPTIONS,
    );
    const province = decoded.provinces[0];
    expect(province?.series[AirQualityPollutant.Pm2_5]).toEqual([null, 12]);
    expect(province?.support[AirQualityPollutant.Pm2_5]).toBe(AirQualityStatus.Ok);
  });
});

describe('decodeCamsFile — contract refusals', () => {
  it('expected pollutant variable missing from the file → schema error', () => {
    const archive = miniFile();
    expect(() =>
      decodeCamsFile(archive, {
        ...DECODE_OPTIONS,
        pollutants: [AirQualityPollutant.Pm2_5, AirQualityPollutant.No2],
      }),
    ).toThrow(/no2_conc/);
  });

  it('wrong unit string → schema error, including the Greek-mu (U+03BC) lookalike', () => {
    const greekMu = miniFile({
      pm25Attributes: [
        { name: 'units', value: 'μg/m3' }, // looks identical, is not
        { name: '_FillValue', value: [FILL] },
      ],
    });
    expect(() => decodeCamsFile(greekMu, DECODE_OPTIONS)).toThrow(/canonical/);

    const kgm3 = miniFile({
      pm25Attributes: [
        { name: 'units', value: 'kg m-3' },
        { name: '_FillValue', value: [FILL] },
      ],
    });
    expect(() => decodeCamsFile(kgm3, DECODE_OPTIONS)).toThrow(/canonical/);
  });

  it("WRONG DAY'S FILE: time long_name without the requested YYYYMMDD → schema error", () => {
    const archive = miniFile({ timeLongName: 'FORECAST time from 20260731' });
    expect(() => decodeCamsFile(archive, DECODE_OPTIONS)).toThrow(/WRONG DAY/);
  });

  it('an ANALYSIS-shaped long_name is REFUSED for a forecast request (product-type binding)', () => {
    // The run-day check is still a SUBSTRING search (the global attribute KEY varies by type),
    // but the product word is bound too: an analysis file must never publish as forecast steps.
    const analysisShaped = miniFile({ timeLongName: 'ANALYSIS time from 20260801' });
    expect(() => decodeCamsFile(analysisShaped, DECODE_OPTIONS)).toThrow(/WRONG PRODUCT TYPE/);
    // The binding is product IDENTITY, not prose casing: a benign casing drift still decodes,
    // and a differently-cased analysis product is still refused.
    expect(() =>
      decodeCamsFile(miniFile({ timeLongName: 'Forecast time from 20260801' }), DECODE_OPTIONS),
    ).not.toThrow();
    expect(() =>
      decodeCamsFile(miniFile({ timeLongName: 'analysis time from 20260801' }), DECODE_OPTIONS),
    ).toThrow(/WRONG PRODUCT TYPE/);
  });

  // ── `@4` product-type matrix (plan §10-D7) — all four corners, none of them implicit ──
  it('expectedProduct defaults to FORECAST — the pre-@4 contract is unchanged', () => {
    // The regression nail: no caller that omits the option may change behaviour, which is why
    // the option is optional rather than required.
    expect(DECODE_OPTIONS).not.toHaveProperty('expectedProduct');
    expect(() => decodeCamsFile(miniFile(), DECODE_OPTIONS)).not.toThrow();
    expect(() =>
      decodeCamsFile(miniFile({ timeLongName: 'ANALYSIS time from 20260801' }), DECODE_OPTIONS),
    ).toThrow(/WRONG PRODUCT TYPE/);
  });

  it('expectedProduct ANALYSIS accepts the analysis file and REFUSES the forecast file', () => {
    const analysisFile = miniFile({ timeLongName: 'ANALYSIS time from 20260801' });
    const decoded = decodeCamsFile(analysisFile, {
      ...DECODE_OPTIONS,
      expectedProduct: 'ANALYSIS',
    });
    // The hour ladder is NOT loosened for the second product — measured 0…23, so `hour ===
    // index` still holds and is still asserted (probe overlay §12).
    expect(decoded.timeHours).toEqual([0, 1]);

    // The refusal runs in BOTH directions: a forecast archive answered for an analysis request
    // would silently backdate 97 forecast steps into the "past" half of the published series.
    expect(() =>
      decodeCamsFile(miniFile(), { ...DECODE_OPTIONS, expectedProduct: 'ANALYSIS' }),
    ).toThrow(/WRONG PRODUCT TYPE/);
  });

  it('the run-day guard still applies to the analysis product (D−1 is a DIFFERENT day)', () => {
    // The whole point of requesting D−1 is that its 24 hours are fully in the past; a file for
    // the wrong day would be the one mistake that makes the merged series silently discontinuous.
    expect(() =>
      decodeCamsFile(miniFile({ timeLongName: 'ANALYSIS time from 20260801' }), {
        ...DECODE_OPTIONS,
        expectedRunDate: '20260731',
        expectedProduct: 'ANALYSIS',
      }),
    ).toThrow(/WRONG DAY/);
  });

  it('non-"hours" time units → schema error (a CF epoch here would shift every validAtUtc)', () => {
    const archive = miniFile({ timeUnits: 'hours since 2026-08-01 00:00:00' });
    expect(() => decodeCamsFile(archive, DECODE_OPTIONS)).toThrow(/expected the measured/);
  });

  it('ONE point outside the domain → outsideDomain + not_supported, all-null series (no throw)', () => {
    const decoded = decodeCamsFile(miniFile(), {
      ...DECODE_OPTIONS,
      points: [POINT, { plateCode: '99', latitude: 10, longitude: 10 }],
    });
    const province = decoded.provinces.find((row) => row.plateCode === '99');
    expect(province?.outsideDomain).toBe(true);
    expect(province?.gridLatitude).toBeNull();
    expect(province?.distanceKm).toBeNull();
    expect(province?.support[AirQualityPollutant.Pm2_5]).toBe(AirQualityStatus.NotSupported);
    expect(province?.series[AirQualityPollutant.Pm2_5]).toEqual([null, null]);
    // The in-domain point is untouched by its neighbour's absence.
    const inside = decoded.provinces.find((row) => row.plateCode === POINT.plateCode);
    expect(inside?.outsideDomain).toBe(false);
  });

  it('EVERY point outside the domain → loud wrong-file failure, never 81 quiet not_supported rows', () => {
    expect(() =>
      decodeCamsFile(miniFile(), {
        ...DECODE_OPTIONS,
        points: [
          { plateCode: '98', latitude: 10, longitude: 10 },
          { plateCode: '99', latitude: -60, longitude: 120 },
        ],
      }),
    ).toThrow(/EVERY requested point/);
  });

  it('an ALL-FILL file → loud nothing-usable failure, never a quiet all-not_supported envelope (OUTCOME guard)', () => {
    // Every structural pin passes (unit, _FillValue, shape, time) — only the OUTCOME is empty.
    const allFill = miniFile({ pm25Data: new Array<number>(12).fill(FILL) });
    expect(() => decodeCamsFile(allFill, DECODE_OPTIONS)).toThrow(CamsContractError);
    expect(() => decodeCamsFile(allFill, DECODE_OPTIONS)).toThrow(/nothing usable/);
  });

  it('malformed expectedRunDate, empty pollutant list and empty point list are refused', () => {
    expect(() =>
      decodeCamsFile(miniFile(), { ...DECODE_OPTIONS, expectedRunDate: '2026-08-01' }),
    ).toThrow(/YYYYMMDD/);
    expect(() => decodeCamsFile(miniFile(), { ...DECODE_OPTIONS, pollutants: [] })).toThrow(
      /zero pollutants/,
    );
    // Zero points would otherwise decode the whole file into a quiet zero-row "success".
    expect(() => decodeCamsFile(miniFile(), { ...DECODE_OPTIONS, points: [] })).toThrow(
      /zero points/,
    );
  });

  it('duplicate plateCodes in the requested points are refused (the series map would collapse them)', () => {
    expect(() =>
      decodeCamsFile(miniFile(), {
        ...DECODE_OPTIONS,
        points: [POINT, { ...POINT, latitude: 42.36 }],
      }),
    ).toThrow(/duplicate plateCode/);
  });
});

describe('decodeCamsFile — element type + packing pins (a packed variable is the silent lane)', () => {
  it('a re-typed (NC_SHORT) data variable is refused, not decoded off-by-scale', () => {
    // The builder deliberately cannot write a non-float variable, so the type code is
    // BYTE-PATCHED: pm2p5_conc is the LAST header entry, and a variable entry ends with
    // [nc_type][vsize][begin] — its nc_type int32 sits exactly 12 bytes before the header end
    // (= the first fixed variable's begin).
    const nc = buildNetcdf3(miniSpec());
    const parsed = parseNetcdf3(nc);
    const headerEnd = Math.min(...parsed.variables.map((variable) => variable.begin));
    const patched = Uint8Array.from(nc);
    new DataView(patched.buffer).setInt32(headerEnd - 12, NC_SHORT, false);
    // Sanity: the patch landed on the intended variable, nowhere else.
    expect(parseNetcdf3(patched).variable('pm2p5_conc').ncType).toBe(NC_SHORT);

    const archive = buildZipArchive([{ name: 'ENS_FORECAST.nc', bytes: patched }]);
    expect(() => decodeCamsFile(archive, DECODE_OPTIONS)).toThrow(/not the measured NC_FLOAT/);
  });

  it.each(['scale_factor', 'add_offset'])('CF packing attribute "%s" is refused', (attribute) => {
    const archive = miniFile({
      pm25Attributes: [
        { name: 'units', value: 'µg/m3' },
        { name: '_FillValue', value: [FILL] },
        { name: attribute, value: [0.1] },
      ],
    });
    expect(() => decodeCamsFile(archive, DECODE_OPTIONS)).toThrow(/packing attribute/);
  });
});

describe('decodeCamsFile — the time axis carries the SAME pins (R2-SFH-I1: no exempt axis)', () => {
  it('a re-typed (NC_SHORT) time variable is refused, not decoded into ×-skewed hours', () => {
    // Same self-verifying byte-patch idiom as the data-variable pin, but with `time` moved to
    // the LAST header slot so its nc_type int32 sits exactly 12 bytes before the header end.
    const spec = miniSpec();
    const time = spec.variables.find((variable) => variable.name === 'time');
    if (time === undefined) throw new Error('fixture spec lost its time variable');
    spec.variables = [...spec.variables.filter((variable) => variable.name !== 'time'), time];
    // Sanity: the reorder alone changes nothing.
    expect(() => decodeCamsFile(zipSpec(spec), DECODE_OPTIONS)).not.toThrow();

    const nc = buildNetcdf3(spec);
    const parsed = parseNetcdf3(nc);
    const headerEnd = Math.min(...parsed.variables.map((variable) => variable.begin));
    const patched = Uint8Array.from(nc);
    new DataView(patched.buffer).setInt32(headerEnd - 12, NC_SHORT, false);
    // Sanity: the patch landed on the time variable, nowhere else.
    expect(parseNetcdf3(patched).variable('time').ncType).toBe(NC_SHORT);

    const archive = buildZipArchive([{ name: 'ENS_FORECAST.nc', bytes: patched }]);
    expect(() => decodeCamsFile(archive, DECODE_OPTIONS)).toThrow(/"time" is nc_type/);
  });

  it.each(['scale_factor', 'add_offset'])(
    'CF packing attribute "%s" on time is refused',
    (attribute) => {
      const spec = miniSpec();
      for (const variable of spec.variables) {
        if (variable.name === 'time') {
          variable.attributes = [...(variable.attributes ?? []), { name: attribute, value: [3] }];
        }
      }
      expect(() => decodeCamsFile(zipSpec(spec), DECODE_OPTIONS)).toThrow(/packing attribute/);
    },
  );

  it('time VALUES off the measured 0,1,2,… hour ladder are refused (validAtUtc skew)', () => {
    // Non-integral step, and an integral-but-shifted ladder — both would silently mislabel
    // every published step while the step COUNT still looks right.
    for (const badHours of [
      [0, 1.5],
      [1, 2],
      [0, 2],
    ]) {
      const spec = miniSpec();
      for (const variable of spec.variables) {
        if (variable.name === 'time') variable.data = badHours;
      }
      expect(() => decodeCamsFile(zipSpec(spec), DECODE_OPTIONS)).toThrow(/hour ladder/);
    }
  });
});

describe('decodeCamsFile — the six untested fail-closed branches (schema_error class)', () => {
  it('level dimension length ≠ 1 → refusal (level=1 is the slab arithmetic’s sole guard)', () => {
    const spec = miniSpec();
    const level = spec.dimensions.find((dimension) => dimension.name === 'level');
    if (level !== undefined) level.length = 2;
    for (const variable of spec.variables) {
      if (variable.name === 'level') variable.data = [0, 1];
      if (variable.name === 'pm2p5_conc') {
        variable.data = Array.from({ length: 24 }, (_unused, index) => index + 1);
      }
    }
    expect(() => decodeCamsFile(zipSpec(spec), DECODE_OPTIONS)).toThrow(
      /single "level" \(surface\) level/,
    );
  });

  it('level dimension ABSENT → the same refusal (0 levels found)', () => {
    const spec = miniSpec();
    spec.dimensions = spec.dimensions.filter((dimension) => dimension.name !== 'level');
    spec.variables = spec.variables
      .filter((variable) => variable.name !== 'level')
      .map((variable) =>
        variable.name === 'pm2p5_conc'
          ? { ...variable, dimensions: ['time', 'latitude', 'longitude'] }
          : variable,
      );
    expect(() => decodeCamsFile(zipSpec(spec), DECODE_OPTIONS)).toThrow(/single "level"/);
  });

  it('data variable with the dimensions in the WRONG ORDER → shape refusal', () => {
    const spec = miniSpec();
    for (const variable of spec.variables) {
      if (variable.name === 'pm2p5_conc') {
        variable.dimensions = ['time', 'latitude', 'level', 'longitude'];
      }
    }
    expect(() => decodeCamsFile(zipSpec(spec), DECODE_OPTIONS)).toThrow(/has shape/);
  });

  it('units attribute ABSENT on the data variable → refusal', () => {
    const archive = miniFile({ pm25Attributes: [{ name: '_FillValue', value: [FILL] }] });
    expect(() => decodeCamsFile(archive, DECODE_OPTIONS)).toThrow(/no units attribute/);
  });

  it('time long_name ABSENT → refusal (the run day cannot be cross-validated)', () => {
    const spec = miniSpec();
    for (const variable of spec.variables) {
      if (variable.name === 'time') {
        variable.attributes = [{ name: 'units', value: 'hours' }];
      }
    }
    expect(() => decodeCamsFile(zipSpec(spec), DECODE_OPTIONS)).toThrow(/no long_name/);
  });

  it('time is NOT the record dimension → refusal (unexpected file layout)', () => {
    const spec = miniSpec();
    spec.recordCount = 0;
    const time = spec.dimensions.find((dimension) => dimension.name === 'time');
    if (time !== undefined) time.length = 2; // fixed, not 'record'
    expect(() => decodeCamsFile(zipSpec(spec), DECODE_OPTIONS)).toThrow(/not the record dimension/);
  });

  it('non-scalar _FillValue (two elements) → refusal, never "pick one"', () => {
    const archive = miniFile({
      pm25Attributes: [
        { name: 'units', value: 'µg/m3' },
        { name: '_FillValue', value: [FILL, FILL] },
      ],
    });
    expect(() => decodeCamsFile(archive, DECODE_OPTIONS)).toThrow(/no scalar _FillValue/);
  });
});

describe('decodeCamsFile — structural cross-ties + the catch-all wrapper', () => {
  it('a coordinate variable declared on the WRONG dimension → refusal (axis↔grid tie)', () => {
    const spec = miniSpec();
    for (const variable of spec.variables) {
      if (variable.name === 'longitude') {
        variable.dimensions = ['latitude'];
        variable.data = [25.55, 25.65];
      }
    }
    expect(() => decodeCamsFile(zipSpec(spec), DECODE_OPTIONS)).toThrow(/its own dimension/);
  });

  it('an UNANTICIPATED internal failure surfaces as CamsContractError (plan §5.2-D2 wrapper)', () => {
    const archive = Uint8Array.from(miniFile());
    // Detach the underlying buffer: the DataView construction inside the decode path then
    // throws a plain TypeError — exactly the "not one of our guards" class the wrapper wraps.
    structuredClone(archive.buffer, { transfer: [archive.buffer] });
    expect(() => decodeCamsFile(archive, DECODE_OPTIONS)).toThrow(CamsContractError);
    expect(() => decodeCamsFile(archive, DECODE_OPTIONS)).toThrow(/unexpected decoder failure/);
  });

  it('wrapper-origin errors carry unexpected=true; pinned-guard refusals carry unexpected=false', () => {
    // A2's run record keeps the two apart: "fix the decoder" vs "the provider drifted".
    const detached = Uint8Array.from(miniFile());
    structuredClone(detached.buffer, { transfer: [detached.buffer] });
    let wrapperError: unknown = null;
    try {
      decodeCamsFile(detached, DECODE_OPTIONS);
    } catch (error: unknown) {
      wrapperError = error;
    }
    expect(wrapperError).toBeInstanceOf(CamsContractError);
    expect(wrapperError instanceof CamsContractError && wrapperError.unexpected).toBe(true);

    let guardError: unknown = null;
    try {
      decodeCamsFile(miniFile({ timeLongName: 'FORECAST time from 20260731' }), DECODE_OPTIONS);
    } catch (error: unknown) {
      guardError = error;
    }
    expect(guardError).toBeInstanceOf(CamsContractError);
    expect(guardError instanceof CamsContractError && guardError.unexpected).toBe(false);
  });
});
