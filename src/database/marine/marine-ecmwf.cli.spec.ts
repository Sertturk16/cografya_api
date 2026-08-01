import { describe, expect, it } from '@jest/globals';
import { buildEcmwfUrl } from './probe-marine-ecmwf';
import { parseEcmwfPhase } from './marine-ecmwf.cli';

describe('parseEcmwfPhase', () => {
  it('accepts the one phase that exists', () => {
    expect(parseEcmwfPhase(['--phase=probe'])).toBe('probe');
  });

  it('says where the load phase went instead of pretending it is a typo', () => {
    // An operator reaching for `--phase=load` out of M1 muscle memory should be told that M3a
    // stores nothing, not handed a usage line that reads like they misspelled something.
    expect(() => parseEcmwfPhase(['--phase=load'])).toThrow(/M3b/);
  });

  it('refuses a missing or unknown phase rather than defaulting', () => {
    // A default of `probe` would put a live network call in whatever script forgot the flag.
    expect(() => parseEcmwfPhase([])).toThrow(/--phase=probe/);
    expect(() => parseEcmwfPhase(['--phase='])).toThrow();
    expect(() => parseEcmwfPhase(['--phase=prob'])).toThrow();
    expect(() => parseEcmwfPhase(['probe'])).toThrow();
  });
});

describe('buildEcmwfUrl', () => {
  const cycle = new Date('2026-07-30T12:00:00.000Z');

  it('builds the provider s published path layout', () => {
    expect(buildEcmwfUrl(cycle, 'oper', 72, 'index')).toBe(
      'https://data.ecmwf.int/forecasts/20260730/12z/ifs/0p25/oper/20260730120000-72h-oper-fc.index',
    );
    expect(buildEcmwfUrl(cycle, 'wave', 0, 'grib2')).toBe(
      'https://data.ecmwf.int/forecasts/20260730/12z/ifs/0p25/wave/20260730120000-0h-wave-fc.grib2',
    );
  });

  it('zero-pads the cycle hour, so 00z is not built as 0z', () => {
    expect(buildEcmwfUrl(new Date('2026-07-30T00:00:00.000Z'), 'oper', 3, 'index')).toContain(
      '/00z/',
    );
  });
});
