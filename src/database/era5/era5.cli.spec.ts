import { describe, expect, it } from '@jest/globals';
import { parseEra5CliArgs } from './era5.cli';

describe('parseEra5CliArgs', () => {
  it('accepts the one supported invocation', () => {
    expect(parseEra5CliArgs(['--phase=fetch', '--raw-dir=/var/tmp/era5'])).toEqual({
      phase: 'fetch',
      rawDir: '/var/tmp/era5',
      fromFile: null,
    });
  });

  it('accepts the offline re-run flag', () => {
    expect(
      parseEra5CliArgs(['--phase=fetch', '--raw-dir=/var/tmp/era5', '--from-file=/var/tmp/x.nc']),
    ).toMatchObject({ fromFile: '/var/tmp/x.nc' });
  });

  it('REFUSES a missing phase — a default would put a network call in a forgetful script', () => {
    expect(() => parseEra5CliArgs(['--raw-dir=/var/tmp/era5'])).toThrow(/Usage/);
  });

  it('REFUSES --phase=load with a pointer to PR-2, rather than silently doing nothing', () => {
    expect(() => parseEra5CliArgs(['--phase=load', '--raw-dir=/var/tmp/era5'])).toThrow(/PR-2/);
  });

  it('REFUSES an unknown phase', () => {
    expect(() => parseEra5CliArgs(['--phase=probe', '--raw-dir=/var/tmp/era5'])).toThrow(/Usage/);
  });

  it('REFUSES a missing --raw-dir — the 19 MB raw file must never default into the repo', () => {
    expect(() => parseEra5CliArgs(['--phase=fetch'])).toThrow(/--raw-dir is mandatory/);
  });

  it('REFUSES a relative --raw-dir', () => {
    expect(() => parseEra5CliArgs(['--phase=fetch', '--raw-dir=./data'])).toThrow(/ABSOLUTE/);
  });

  it('REFUSES a relative --from-file', () => {
    expect(() =>
      parseEra5CliArgs(['--phase=fetch', '--raw-dir=/var/tmp/era5', '--from-file=x.nc']),
    ).toThrow(/ABSOLUTE/);
  });
});
