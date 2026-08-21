import { describe, expect, it } from '@jest/globals';
import { parseReferenceSeedCliArgs } from './reference.cli';

/**
 * The argument parser, which is the only thing standing between a typo and a write.
 *
 * The parser is an exported pure function because "a refusal written into an entry point cannot be
 * pinned at all" (playbook §8), and this file is what uses that split — the `books.cli.spec.ts`
 * precedent, which exists because that split was once made and then left unpinned. Importing this
 * module is also what makes the `require.main === module` guard's comment true: if the guard were
 * wrong, `main()` would run here against Jest's own argv and try to reach a database.
 *
 * Both flags decide something irreversible — `--check` decides whether anything is written at all,
 * `--allow-removals` decides whether rows may be DELETED — so the defaults are asserted as
 * explicitly as the refusals.
 */
describe('parseReferenceSeedCliArgs', () => {
  it('defaults to "write, and delete nothing" when no argument is given', () => {
    expect(parseReferenceSeedCliArgs([])).toEqual({ checkOnly: false, allowRemovals: false });
  });

  it('reads --check as "validate only"', () => {
    expect(parseReferenceSeedCliArgs(['--check'])).toEqual({
      checkOnly: true,
      allowRemovals: false,
    });
  });

  it('reads --allow-removals without turning the run into a check', () => {
    expect(parseReferenceSeedCliArgs(['--allow-removals'])).toEqual({
      checkOnly: false,
      allowRemovals: true,
    });
  });

  it('accepts both flags together, in either order', () => {
    expect(parseReferenceSeedCliArgs(['--allow-removals', '--check'])).toEqual({
      checkOnly: true,
      allowRemovals: true,
    });
  });

  it('REFUSES an unrecognised argument instead of ignoring it', () => {
    // `--chek` would otherwise mean "write to the database" to somebody who typed "validate only".
    expect(() => parseReferenceSeedCliArgs(['--chek'])).toThrow(/unrecognised argument/);
  });

  it('names every unrecognised argument, not just the first', () => {
    expect(() => parseReferenceSeedCliArgs(['--chek', '--force'])).toThrow(/"--chek", "--force"/);
  });

  it('refuses a bare value as firmly as a mistyped flag', () => {
    // A path-looking argument is the shape somebody reaches for when they assume this CLI takes the
    // artefact as an argument. It does not: the artefact's location is a constant, so that a run
    // cannot be pointed at an uncommitted file.
    expect(() => parseReferenceSeedCliArgs(['data/reference/districts.tuik.json'])).toThrow(
      /unrecognised argument/,
    );
  });
});
