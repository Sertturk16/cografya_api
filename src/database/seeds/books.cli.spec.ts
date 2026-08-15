import { describe, expect, it } from '@jest/globals';
import { parseBooksSeedCliArgs } from './books.cli';

/**
 * The argument parser, which is the only thing standing between a typo and a write.
 *
 * ## Why this file exists
 * `books.cli.ts` was split so the parser could be an exported pure function — the entry point owns
 * `process.argv` and the usage banner, and "a refusal written into an entry point cannot be pinned
 * at all" (playbook §8). The split was made and then not used: no spec imported this module, so the
 * unrecognised-argument refusal the file devotes a docblock section to was unpinned, and the
 * comment justifying the `require.main === module` guard named a spec that did not exist
 * (PR #109 review, `TA109-M1`). Importing this module is also what makes that comment true: if the
 * guard were wrong, `main()` would run here against Jest's argv.
 *
 * Two of the three flags decide something irreversible — `--check` decides whether anything is
 * written at all, `--allow-removals` decides whether rows may be DELETED — so the parser's defaults
 * are asserted as explicitly as its refusals.
 */
describe('parseBooksSeedCliArgs', () => {
  it('defaults to "write, and delete nothing" when no argument is given', () => {
    expect(parseBooksSeedCliArgs([])).toEqual({ checkOnly: false, allowRemovals: false });
  });

  it('reads --check as "validate only"', () => {
    expect(parseBooksSeedCliArgs(['--check'])).toEqual({ checkOnly: true, allowRemovals: false });
  });

  it('reads --allow-removals without turning the run into a check', () => {
    expect(parseBooksSeedCliArgs(['--allow-removals'])).toEqual({
      checkOnly: false,
      allowRemovals: true,
    });
  });

  it('accepts both flags together, in either order', () => {
    expect(parseBooksSeedCliArgs(['--check', '--allow-removals'])).toEqual({
      checkOnly: true,
      allowRemovals: true,
    });
    expect(parseBooksSeedCliArgs(['--allow-removals', '--check'])).toEqual({
      checkOnly: true,
      allowRemovals: true,
    });
  });

  it.each([
    ['a typo of --check', '--chek'],
    ['a typo of --allow-removals', '--allow-removal'],
    ['an unknown flag', '--dry-run'],
    ['a bare word', 'check'],
  ])('REFUSES %s rather than ignoring it, and names it', (_label, argument) => {
    // Ignoring it would mean "write to the database" to somebody who typed "validate only", and
    // "delete nothing" to somebody who typed "authorise the deletion".
    expect(() => parseBooksSeedCliArgs([argument])).toThrow(new RegExp(argument));
    expect(() => parseBooksSeedCliArgs([argument])).toThrow(/Usage/);
  });

  it('names EVERY unrecognised argument, not just the first', () => {
    expect(() => parseBooksSeedCliArgs(['--chek', '--check', '--nope'])).toThrow(
      /"--chek", "--nope"/,
    );
  });
});
