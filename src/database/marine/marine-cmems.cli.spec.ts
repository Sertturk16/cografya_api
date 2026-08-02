import { describe, expect, it } from '@jest/globals';
import { parseCmemsPhase } from './marine-cmems.cli';

describe('parseCmemsPhase', () => {
  it('accepts exactly --phase=probe', () => {
    expect(parseCmemsPhase(['--phase=probe'])).toBe('probe');
  });

  it('refuses load with the Redis-only rationale — no load phase exists or is planned', () => {
    expect(() => parseCmemsPhase(['--phase=load'])).toThrow(/Redis only/);
  });

  it('refuses a missing or mistyped flag instead of defaulting a network call', () => {
    expect(() => parseCmemsPhase([])).toThrow(/Usage/);
    expect(() => parseCmemsPhase(['--phase=prob'])).toThrow(/Usage/);
    expect(() => parseCmemsPhase(['--phase='])).toThrow(/Usage/);
  });
});
