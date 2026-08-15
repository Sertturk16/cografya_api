import { describe, expect, it } from '@jest/globals';
import { isSnapshotServable } from './youtube-serving';

/**
 * SPEC §8.3 — the three-step ageing rule, with a fake clock.
 *
 * The unit half of §13 items 9 and 11; the e2e asserts the same rule through the public endpoint.
 * Both exist because they can fail for different reasons: this one catches the arithmetic, that one
 * catches a mapper that forgot to call it.
 */
const SOFT_MAX_AGE_HOURS = 600;
const HOUR_MS = 3_600_000;
const NOW_MS = Date.parse('2026-08-15T12:00:00.000Z');

function agedHours(hours: number): { fetchedAtUtc: Date; missingSinceUtc: null } {
  return { fetchedAtUtc: new Date(NOW_MS - hours * HOUR_MS), missingSinceUtc: null };
}

describe('isSnapshotServable', () => {
  it('serves a snapshot younger than the soft threshold', () => {
    expect(isSnapshotServable(agedHours(0), NOW_MS, SOFT_MAX_AGE_HOURS)).toBe(true);
    expect(isSnapshotServable(agedHours(1), NOW_MS, SOFT_MAX_AGE_HOURS)).toBe(true);
    expect(isSnapshotServable(agedHours(599), NOW_MS, SOFT_MAX_AGE_HOURS)).toBe(true);
  });

  it('stops serving AT the threshold, not after it', () => {
    // The boundary is the case worth pinning: a snapshot served one hour too long looks exactly
    // like one served correctly, and only this comparison decides which it is.
    expect(isSnapshotServable(agedHours(600), NOW_MS, SOFT_MAX_AGE_HOURS)).toBe(false);
    expect(isSnapshotServable(agedHours(601), NOW_MS, SOFT_MAX_AGE_HOURS)).toBe(false);
  });

  it('does not serve a row between the soft and hard thresholds — the middle state', () => {
    // 700 h is past soft (600) and below hard (720): the row still EXISTS, and the contract
    // publishes `youtube: null` for it. That middle state is the point of having two numbers.
    expect(isSnapshotServable(agedHours(700), NOW_MS, SOFT_MAX_AGE_HOURS)).toBe(false);
  });

  it('never serves a missing video, at ANY age', () => {
    const fresh = { fetchedAtUtc: new Date(NOW_MS), missingSinceUtc: new Date(NOW_MS) };
    expect(isSnapshotServable(fresh, NOW_MS, SOFT_MAX_AGE_HOURS)).toBe(false);
  });

  it('refuses a snapshot from the future rather than treating it as extra fresh', () => {
    const ahead = { fetchedAtUtc: new Date(NOW_MS + HOUR_MS), missingSinceUtc: null };
    expect(isSnapshotServable(ahead, NOW_MS, SOFT_MAX_AGE_HOURS)).toBe(false);
  });

  it('reads the threshold it is given, so lowering the env value takes effect', () => {
    // Guards against a constant creeping back in: the same row, two configured ceilings.
    expect(isSnapshotServable(agedHours(100), NOW_MS, 600)).toBe(true);
    expect(isSnapshotServable(agedHours(100), NOW_MS, 24)).toBe(false);
  });
});
