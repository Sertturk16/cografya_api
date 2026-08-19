import { describe, expect, it } from '@jest/globals';
import { parseTerrainPhase } from './elevation.cli';

/**
 * The flag guard, pinned. It is one line of parsing and it is the only thing standing between
 * a mistyped command and an unintended network run — the same reason the marine and ERA5 CLIs
 * pin theirs.
 */
describe('terrain probe CLI', () => {
  it('accepts the one legal phase', () => {
    expect(parseTerrainPhase(['--phase=probe'])).toBe('probe');
  });

  it('refuses a missing flag instead of defaulting to a network run', () => {
    expect(() => parseTerrainPhase([])).toThrow(/--phase=probe/);
  });

  it('refuses an unknown phase', () => {
    expect(() => parseTerrainPhase(['--phase=fetch'])).toThrow(/--phase=probe/);
  });

  it('explains why there is no load phase rather than reporting an unknown flag', () => {
    // `load` is the phase a reader of ENGINEERING.md §5 would REASONABLY expect, since every
    // other import here has one. Answering it with a generic usage line would leave them
    // hunting for a phase that does not exist by design.
    expect(() => parseTerrainPhase(['--phase=load'])).toThrow(/no load phase/);
  });
});
