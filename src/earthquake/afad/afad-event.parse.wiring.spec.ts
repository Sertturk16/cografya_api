import { afterEach, describe, expect, it, jest } from '@jest/globals';
import * as fidelity from './afad-fidelity';
import { parseAfadEvent } from './afad-event.parse';

/**
 * Does the parser still ASK the fidelity gate?
 *
 * `afad-fidelity.spec.ts` exercises `checkAfadFidelity` as a pure function, so it stays green with
 * the gate disconnected — and the gate is unreachable from any input the parser accepts, by design,
 * since the event it checks is built from the same record. So no black-box input can cover the one
 * line that wires it, and deleting that line left the whole suite green while the publishing line
 * ran with no write-path fidelity rule at all — the state `ENGINEERING.md` §5 forbids (review #118
 * TA118-I1).
 *
 * The seam is the call itself: stub the checker, and assert its verdict comes back out of
 * `parseAfadEvent`. No production signature changes for it.
 */

/** A row every OTHER check in the parser accepts, so only the fidelity verdict can decide it. */
function goodRow(): Record<string, unknown> {
  return {
    eventID: '635298',
    location: 'Göksun (Kahramanmaraş)',
    latitude: '38.05222',
    longitude: '36.63111',
    depth: '6.95',
    type: 'ML',
    magnitude: '1.8',
    country: 'Türkiye',
    province: 'Kahramanmaraş',
    district: 'Göksun',
    date: '2026-08-11T11:03:34',
    isEventUpdate: false,
    lastUpdateDate: null,
  };
}

describe('the write-path fidelity gate is WIRED into parseAfadEvent', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('accepts the row when the checker returns null — the control for the case below', () => {
    // Without this, "rejected" below would also be produced by a row the parser refuses for some
    // unrelated reason, and the test would prove nothing about the wiring.
    const spy = jest.spyOn(fidelity, 'checkAfadFidelity').mockReturnValue(null);

    const outcome = parseAfadEvent(goodRow());

    expect(spy).toHaveBeenCalledTimes(1);
    expect(outcome.kind).toBe('ok');
  });

  it('rejects the row with the checker’s own reason when it refuses', () => {
    jest
      .spyOn(fidelity, 'checkAfadFidelity')
      .mockReturnValue('fidelity: a reason only this stub can produce');

    const outcome = parseAfadEvent(goodRow());

    expect(outcome.kind).toBe('rejected');
    expect(outcome.kind === 'rejected' ? outcome.rejection.reason : null).toBe(
      'fidelity: a reason only this stub can produce',
    );
    // The refusal names the row, so an operator can find it — the same contract every other
    // rejection in this parser keeps.
    expect(outcome.kind === 'rejected' ? outcome.rejection.providerEventId : null).toBe('635298');
  });

  it('is handed the RECORD, the built event and the fraction width, not a subset', () => {
    // The three arguments are what make the check a by-name comparison rather than a re-derivation
    // of what we already believe; a call site that dropped one would still compile.
    const spy = jest.spyOn(fidelity, 'checkAfadFidelity').mockReturnValue(null);

    parseAfadEvent({ ...goodRow(), date: '1999-08-17T00:01:39.07' });

    const call = spy.mock.calls[0];
    expect(call?.[0]).toMatchObject({ eventID: '635298' });
    expect(call?.[1]).toMatchObject({ providerEventId: '635298', magnitude: 1.8 });
    expect(call?.[2]).toBe(2);
  });
});
