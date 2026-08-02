import { describe, expect, it } from '@jest/globals';
import { selectCmemsTime } from './cmems-time';

const OPEN = { startUtc: null, endUtc: null };

describe('selectCmemsTime', () => {
  it('picks the NEAREST hour, in both directions, in the measured wire format', () => {
    const down = selectCmemsTime(Date.parse('2026-08-02T14:20:00Z'), OPEN);
    expect(down.timeIso).toBe('2026-08-02T14:00:00Z');
    expect(down.clamped).toBe(false);

    const up = selectCmemsTime(Date.parse('2026-08-02T14:40:00Z'), OPEN);
    expect(up.timeIso).toBe('2026-08-02T15:00:00Z');
  });

  it('emits second precision with NO milliseconds — the measured accepted format', () => {
    const selection = selectCmemsTime(Date.parse('2026-08-02T14:00:00Z'), OPEN);
    expect(selection.timeIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/);
    expect(selection.validAtMs).toBe(Date.parse(selection.timeIso));
  });

  it('clamps down onto the FLOORED extent end (a horizon edge must not 400)', () => {
    const selection = selectCmemsTime(Date.parse('2026-08-12T09:20:00Z'), {
      startUtc: '2021-04-16T12:00:00Z',
      endUtc: '2026-08-11T11:30:00Z',
    });
    // The newest servable HOUR inside an extent ending 11:30 is 11:00, not 12:00.
    expect(selection.timeIso).toBe('2026-08-11T11:00:00Z');
    expect(selection.clamped).toBe(true);
  });

  it('clamps up onto the CEILED extent start', () => {
    const selection = selectCmemsTime(Date.parse('2021-01-01T00:00:00Z'), {
      startUtc: '2021-04-16T12:30:00Z',
      endUtc: '2026-08-11T11:00:00Z',
    });
    expect(selection.timeIso).toBe('2021-04-16T13:00:00Z');
    expect(selection.clamped).toBe(true);
  });

  it('does not clamp when the nearest hour already sits inside the extent', () => {
    const selection = selectCmemsTime(Date.parse('2026-08-02T14:10:00Z'), {
      startUtc: '2022-12-18T00:00:00Z',
      endUtc: '2026-08-11T11:00:00Z',
    });
    expect(selection).toEqual({
      timeIso: '2026-08-02T14:00:00Z',
      validAtMs: Date.parse('2026-08-02T14:00:00Z'),
      clamped: false,
    });
  });

  it('refuses to invent a time inside an inverted extent — sends the nearest hour instead', () => {
    // Start above end after hour rounding: the call will fail loudly as a 400 (the honest
    // outcome for a nonsensical catalogue answer), rather than this function guessing.
    const nowMs = Date.parse('2026-08-02T14:00:00Z');
    const selection = selectCmemsTime(nowMs, {
      startUtc: '2026-08-02T16:45:00Z',
      endUtc: '2026-08-02T16:50:00Z',
    });
    expect(selection.timeIso).toBe('2026-08-02T14:00:00Z');
    expect(selection.clamped).toBe(false);
  });

  it('treats an unparseable bound as no bound', () => {
    const selection = selectCmemsTime(Date.parse('2026-08-02T14:00:00Z'), {
      startUtc: 'not-a-date',
      endUtc: null,
    });
    expect(selection.timeIso).toBe('2026-08-02T14:00:00Z');
  });
});
