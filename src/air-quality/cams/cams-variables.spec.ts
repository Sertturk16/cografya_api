import { describe, expect, it } from '@jest/globals';
import { AirQualityPollutant, ALL_AIR_QUALITY_POLLUTANTS } from '../air-quality.types';
import { CAMS_CANONICAL_UNIT, CAMS_VARIABLES, camsVariableFor } from './cams-variables';

/**
 * Locks the three-way spelling table (SPEC §5.4 — "tek tabloda toplanması ve birim testiyle
 * kilitlenmesi pazarlık dışı"). These strings are the measured provider reality; a transposed
 * row here would read the wrong gas for a province with every other test green.
 */
describe('CAMS_VARIABLES', () => {
  it('carries exactly the measured request-name ↔ file-name ↔ token rows, in canonical order', () => {
    expect(CAMS_VARIABLES).toEqual([
      {
        pollutant: AirQualityPollutant.Pm2_5,
        requestName: 'particulate_matter_2.5um',
        fileVariableName: 'pm2p5_conc',
      },
      {
        pollutant: AirQualityPollutant.Pm10,
        requestName: 'particulate_matter_10um',
        fileVariableName: 'pm10_conc',
      },
      {
        pollutant: AirQualityPollutant.No2,
        requestName: 'nitrogen_dioxide',
        fileVariableName: 'no2_conc',
      },
      { pollutant: AirQualityPollutant.O3, requestName: 'ozone', fileVariableName: 'o3_conc' },
      {
        pollutant: AirQualityPollutant.So2,
        requestName: 'sulphur_dioxide',
        fileVariableName: 'so2_conc',
      },
    ]);
    expect(CAMS_VARIABLES.map((row) => row.pollutant)).toEqual([...ALL_AIR_QUALITY_POLLUTANTS]);
  });

  it('camsVariableFor resolves every enum member', () => {
    for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) {
      expect(camsVariableFor(pollutant).pollutant).toBe(pollutant);
    }
  });
});

describe('CAMS_CANONICAL_UNIT', () => {
  it('is µg/m3 with U+00B5 MICRO SIGN, not Greek mu U+03BC', () => {
    expect(CAMS_CANONICAL_UNIT).toHaveLength(5);
    expect(CAMS_CANONICAL_UNIT.codePointAt(0)).toBe(0x00b5);
    expect(CAMS_CANONICAL_UNIT.slice(1)).toBe('g/m3');
    // The Greek-mu lookalike must NOT equal the canonical string.
    expect('μg/m3').not.toBe(CAMS_CANONICAL_UNIT);
  });
});
