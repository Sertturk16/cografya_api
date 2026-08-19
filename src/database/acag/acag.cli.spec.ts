import { describe, expect, it } from '@jest/globals';
import { parseAcagCliArgs } from './acag.cli';

/**
 * The CLI's refusals are the operator-facing half of the two-phase rule: a flag that belongs to
 * the other phase is REFUSED rather than ignored, because silently accepting a no-op flag is how
 * somebody concludes a run did something it did not.
 */
describe('parseAcagCliArgs', () => {
  it('requires --phase, with no default', () => {
    expect(() => parseAcagCliArgs([])).toThrow(/--phase/);
    expect(() => parseAcagCliArgs(['--raw-dir=/tmp/x'])).toThrow(/--phase/);
  });

  it('refuses an unknown phase rather than guessing', () => {
    expect(() => parseAcagCliArgs(['--phase=probe'])).toThrow(/"probe"/);
  });

  it('parses a load invocation', () => {
    expect(parseAcagCliArgs(['--phase=load'])).toEqual({ phase: 'load' });
  });

  it('REFUSES fetch-only flags on the load phase instead of ignoring them', () => {
    expect(() => parseAcagCliArgs(['--phase=load', '--raw-dir=/tmp/x'])).toThrow(/--raw-dir/);
    expect(() => parseAcagCliArgs(['--phase=load', '--from-dir'])).toThrow(/--from-dir/);
    expect(() => parseAcagCliArgs(['--phase=load', '--keep-raw'])).toThrow(/--keep-raw/);
  });

  it('requires --raw-dir on fetch — the raw files must never land in the repo', () => {
    expect(() => parseAcagCliArgs(['--phase=fetch'])).toThrow(/--raw-dir is mandatory/);
    expect(() => parseAcagCliArgs(['--phase=fetch', '--raw-dir='])).toThrow(
      /--raw-dir is mandatory/,
    );
  });

  it('requires --raw-dir to be ABSOLUTE', () => {
    expect(() => parseAcagCliArgs(['--phase=fetch', '--raw-dir=./raw'])).toThrow(/ABSOLUTE/);
    expect(() => parseAcagCliArgs(['--phase=fetch', '--raw-dir=raw'])).toThrow(/ABSOLUTE/);
  });

  it('parses a fetch invocation with its optional flags', () => {
    expect(parseAcagCliArgs(['--phase=fetch', '--raw-dir=/var/tmp/acag'])).toEqual({
      phase: 'fetch',
      rawDir: '/var/tmp/acag',
      fromDir: false,
      keepRaw: false,
    });
    expect(parseAcagCliArgs(['--phase=fetch', '--raw-dir=/var/tmp/acag', '--keep-raw'])).toEqual({
      phase: 'fetch',
      rawDir: '/var/tmp/acag',
      fromDir: false,
      keepRaw: true,
    });
  });

  it('refuses --from-dir pointing at a directory that does not exist', () => {
    expect(() =>
      parseAcagCliArgs([
        '--phase=fetch',
        '--raw-dir=/var/tmp/acag-does-not-exist-9f1059f6',
        '--from-dir',
      ]),
    ).toThrow(/does not exist/);
  });
});
