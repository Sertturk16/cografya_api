import { describe, expect, it } from '@jest/globals';
import { AirQualityPollutant, AirQualityStatus } from '../air-quality.types';
import { CamsContractError } from './cams.errors';
import { CAMS_DECODER_VERSION, decodeCamsFile } from './cams-decode';
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
function miniFile(options: MiniFileOptions = {}): Uint8Array {
  const spec: FixtureFileSpec = {
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
      // Cell (0,1): record 0 carries the fill value, record 1 carries a negative.
      miniFile({ pm25Data: [1, FILL, 3, 4, 5, 6, 11, -0.5, 13, 14, 15, 16] }),
      DECODE_OPTIONS,
    );
    const province = decoded.provinces[0];
    expect(province?.series[AirQualityPollutant.Pm2_5]).toEqual([null, null]);
    // Every step missing → the structural not_supported class.
    expect(province?.support[AirQualityPollutant.Pm2_5]).toBe(AirQualityStatus.NotSupported);
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
    expect(() => decodeCamsFile(archive, DECODE_OPTIONS)).toThrow(/_FillValue/);
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

  it('the cross-check is a SUBSTRING search on time:long_name (the global key varies by type)', () => {
    const analysisShaped = miniFile({ timeLongName: 'ANALYSIS time from 20260801' });
    expect(() => decodeCamsFile(analysisShaped, DECODE_OPTIONS)).not.toThrow();
  });

  it('non-"hours" time units → schema error (a CF epoch here would shift every validAtUtc)', () => {
    const archive = miniFile({ timeUnits: 'hours since 2026-08-01 00:00:00' });
    expect(() => decodeCamsFile(archive, DECODE_OPTIONS)).toThrow(/hours/);
  });

  it('a point outside the domain → outsideDomain + not_supported, all-null series (no throw)', () => {
    const decoded = decodeCamsFile(miniFile(), {
      ...DECODE_OPTIONS,
      points: [{ plateCode: '99', latitude: 10, longitude: 10 }],
    });
    const province = decoded.provinces[0];
    expect(province?.outsideDomain).toBe(true);
    expect(province?.gridLatitude).toBeNull();
    expect(province?.distanceKm).toBeNull();
    expect(province?.support[AirQualityPollutant.Pm2_5]).toBe(AirQualityStatus.NotSupported);
    expect(province?.series[AirQualityPollutant.Pm2_5]).toEqual([null, null]);
  });

  it('malformed expectedRunDate and empty pollutant list are refused', () => {
    expect(() =>
      decodeCamsFile(miniFile(), { ...DECODE_OPTIONS, expectedRunDate: '2026-08-01' }),
    ).toThrow(/YYYYMMDD/);
    expect(() => decodeCamsFile(miniFile(), { ...DECODE_OPTIONS, pollutants: [] })).toThrow(
      /zero pollutants/,
    );
  });
});
