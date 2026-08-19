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

  /**
   * Unknown and mis-shaped flags are REFUSED, not ignored (review CODE123-M4 / SFH123-M2). The
   * two forms are mixed on one command line — `--phase=` and `--raw-dir=` take values while
   * `--keep-raw` is bare — so typing `--keep-raw=true` is the natural mistake, and it used to
   * parse as `keepRaw: false`: the full ~70 minute / 12 GB download followed by the deletion of
   * every raw file the operator had explicitly asked to keep.
   */
  it('REFUSES a bare flag written in the key=value form instead of silently ignoring it', () => {
    expect(() => parseAcagCliArgs(['--phase=fetch', '--raw-dir=/abs', '--keep-raw=true'])).toThrow(
      /--keep-raw is a bare flag/,
    );
    expect(() => parseAcagCliArgs(['--phase=fetch', '--raw-dir=/abs', '--from-dir=1'])).toThrow(
      /--from-dir is a bare flag/,
    );
  });

  it('REFUSES a value flag written without its value', () => {
    // Bare `--raw-dir` used to be invisible to `readFlag` and fell through to the generic
    // "mandatory" message; it now names the shape the operator got wrong.
    expect(() => parseAcagCliArgs(['--phase=fetch', '--raw-dir'])).toThrow(
      /--raw-dir requires a value/,
    );
  });

  it('REFUSES an unknown flag and a bare positional argument', () => {
    expect(() => parseAcagCliArgs(['--phase=fetch', '--raw-dir=/abs', '--fromdir'])).toThrow(
      /unknown flag/,
    );
    expect(() => parseAcagCliArgs(['--phase=load', '--verbose'])).toThrow(/unknown flag/);
    expect(() => parseAcagCliArgs(['--phase=load', 'extra'])).toThrow(/unexpected argument/);
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
