import { describe, expect, it } from '@jest/globals';
import { parsePhase } from './marine-points.cli';

/**
 * `parsePhase` has no default, on purpose, and the CLI's own docblock explains why: a default of
 * `probe` would put a network call in a deploy script, and a default of `load` would make a
 * mistyped flag silently skip the probe. That is a design decision worth a test — a well-meaning
 * `value ?? 'load'` would defeat it with nothing to catch it.
 */
describe('parsePhase', () => {
  it('accepts the two real phases', () => {
    expect(parsePhase(['--phase=probe'])).toBe('probe');
    expect(parsePhase(['--phase=load'])).toBe('load');
  });

  it('finds the flag among other arguments', () => {
    expect(parsePhase(['--verbose', '--phase=load'])).toBe('load');
  });

  it('REFUSES a missing phase rather than defaulting either way', () => {
    expect(() => parsePhase([])).toThrow(/Usage: pnpm db:import:marine-points/);
  });

  it('refuses an unknown phase and names the value it got', () => {
    expect(() => parsePhase(['--phase=fetch'])).toThrow(/fetch/);
    expect(() => parsePhase(['--phase='])).toThrow(/Usage/);
  });
});
