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

  it('accepts --phase=load, which takes no path flags at all', () => {
    expect(parseEra5CliArgs(['--phase=load'])).toEqual({ phase: 'load' });
  });

  it('REFUSES --raw-dir on the load phase rather than ignoring it', () => {
    // Silently accepting a flag that does nothing teaches an operator that it works, and the next
    // person copies the wrong command. The load phase never reads the raw .nc.
    expect(() => parseEra5CliArgs(['--phase=load', '--raw-dir=/var/tmp/era5'])).toThrow(
      /--raw-dir belongs to --phase=fetch only/,
    );
  });

  it('REFUSES --from-file on the load phase', () => {
    expect(() => parseEra5CliArgs(['--phase=load', '--from-file=/var/tmp/x.nc'])).toThrow(
      /--from-file belongs to --phase=fetch only/,
    );
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
