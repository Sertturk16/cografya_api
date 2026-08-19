import { describe, expect, it } from '@jest/globals';
import { OperationDeadline } from './operation-deadline';

/**
 * The arithmetic is asserted with an injected clock; the SIGNAL is asserted with a real, very
 * short timeout. Both halves matter and they fail differently: a wrong `remainingMs` produces a
 * retry that cannot finish, while a signal that never fires produces a hung socket.
 */
describe('OperationDeadline', () => {
  function clockFrom(start: number): { now: () => number; advance: (ms: number) => void } {
    let current = start;
    return {
      now: () => current,
      advance: (ms: number) => {
        current += ms;
      },
    };
  }

  it('refuses a non-positive budget instead of silently never expiring', () => {
    expect(() => new OperationDeadline(0)).toThrow(/positive budget/);
    expect(() => new OperationDeadline(-1)).toThrow(/positive budget/);
    expect(() => new OperationDeadline(Number.NaN)).toThrow(/positive budget/);
  });

  it('counts the budget down and never reports a negative remainder', () => {
    const clock = clockFrom(1_000);
    const deadline = new OperationDeadline(6_000, clock.now);

    expect(deadline.remainingMs()).toBe(6_000);
    clock.advance(2_500);
    expect(deadline.remainingMs()).toBe(3_500);
    clock.advance(10_000);
    expect(deadline.remainingMs()).toBe(0);
    expect(deadline.hasExpired()).toBe(true);
  });

  it('answers `canAfford` on the REMAINING budget, which is what gates a retry', () => {
    const clock = clockFrom(0);
    const deadline = new OperationDeadline(6_000, clock.now);

    // The whole point of the type: a retry is judged against what is LEFT, not against the
    // original budget. SPEC v1 judged each call against its own fresh timeout, which is how a
    // "6 s" operation became 12.5 s.
    expect(deadline.canAfford(1_750)).toBe(true);
    clock.advance(4_500);
    expect(deadline.remainingMs()).toBe(1_500);
    expect(deadline.canAfford(1_750)).toBe(false);
  });

  it('caps a single call at the per-call limit when the budget is larger', async () => {
    const deadline = new OperationDeadline(5_000);
    const signal = deadline.signalFor(20);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(signal.aborted).toBe(true);
  });

  it('caps a single call at the REMAINING budget when that is smaller than the per-call limit', async () => {
    // 25 ms of operation budget, a 10 s per-call limit: the call must still die at 25 ms, or one
    // slow socket eats a budget it was never granted.
    const deadline = new OperationDeadline(25);
    const signal = deadline.signalFor(10_000);

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(signal.aborted).toBe(true);
  });

  describe('cutsCallShort — telling OUR brake from a provider hang (review #124 SFH124R2-I1)', () => {
    it('is false while the budget can still pay for a full per-call cap', () => {
      const clock = clockFrom(0);
      const deadline = new OperationDeadline(12_000, clock.now);

      expect(deadline.cutsCallShort(5_000)).toBe(false);
      clock.advance(7_000); // exactly one cap left: the call still gets all of it
      expect(deadline.remainingMs()).toBe(5_000);
      expect(deadline.cutsCallShort(5_000)).toBe(false);
    });

    it('is true once less than one cap is left — the elevation leg’s late tiles', () => {
      const clock = clockFrom(0);
      const deadline = new OperationDeadline(12_000, clock.now);

      clock.advance(10_000);
      expect(deadline.cutsCallShort(5_000)).toBe(true);
    });

    it('is FALSE at every point of a budget whose cap is the whole budget — the boundary', () => {
      // `CMEMS_SINGLE_CALL_TIMEOUT_MS` (6 000) == `MARINE_UPSTREAM_DEADLINE_MS` (6 000) is a
      // recorded decision (review #81 M5), and the env schema blesses the same equality on the
      // elevation leg. There the clamp binds on every call, so a "was it clamped?" answer of
      // `true` would excuse every abort that leg can produce and disarm its breaker for good.
      const clock = clockFrom(0);
      const deadline = new OperationDeadline(6_000, clock.now);

      expect(deadline.cutsCallShort(6_000)).toBe(false);
      clock.advance(1); // one millisecond of our own work already clamps the cap
      expect(deadline.cutsCallShort(6_000)).toBe(false);
      clock.advance(5_999);
      expect(deadline.hasExpired()).toBe(true);
      expect(deadline.cutsCallShort(6_000)).toBe(false);
      // A cap LARGER than the budget is the same case, not a stronger one.
      expect(deadline.cutsCallShort(9_000)).toBe(false);
    });
  });

  it('aborts every outstanding call signal once the operation ceiling elapses', async () => {
    const deadline = new OperationDeadline(20);
    const first = deadline.signalFor(10_000);
    const second = deadline.signalFor(10_000);

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(true);
    expect(deadline.signal.aborted).toBe(true);
  });
});
