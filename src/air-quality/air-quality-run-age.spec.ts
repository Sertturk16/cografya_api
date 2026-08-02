import { describe, expect, it } from '@jest/globals';
import { isRunWithinMaxAge, runAgeSeconds } from './air-quality-run-age';

const RUN = new Date('2026-08-02T00:00:00.000Z');
/** The SPEC §9.4 default, restated locally so the test states the boundary it checks. */
const MAX_AGE_SECONDS = 172_800;

describe('air-quality run-age ceiling', () => {
  it('measures age in seconds from the run base time', () => {
    expect(runAgeSeconds(RUN, new Date('2026-08-02T01:00:00.000Z'))).toBe(3600);
    expect(runAgeSeconds(RUN, RUN)).toBe(0);
  });

  it('clamps a FUTURE run to age zero rather than going negative', () => {
    // A clock skew must not make a run look "younger than new" and slip past a `< 0` comparison
    // somewhere downstream.
    expect(runAgeSeconds(RUN, new Date('2026-08-01T00:00:00.000Z'))).toBe(0);
  });

  it('is inclusive at the ceiling and exclusive one millisecond past it', () => {
    const atCeiling = new Date(RUN.getTime() + MAX_AGE_SECONDS * 1000);
    const pastCeiling = new Date(atCeiling.getTime() + 1);
    expect(isRunWithinMaxAge(RUN, atCeiling, MAX_AGE_SECONDS)).toBe(true);
    expect(isRunWithinMaxAge(RUN, pastCeiling, MAX_AGE_SECONDS)).toBe(false);
  });
});
