import { describe, expect, it } from '@jest/globals';
import type { UpstreamOutcomeKind } from '../../upstream/upstream.types';
import { ForcedReresolveGate, isRetiredDatasetSignal } from './cmems-reresolve';

describe('isRetiredDatasetSignal', () => {
  it('fires on client_error ONLY — the 400-XML signature', () => {
    const expectations: Record<UpstreamOutcomeKind, boolean> = {
      ok: false,
      no_data: false,
      transient: false,
      rate_limited: false,
      // Payload-shape drift: a re-resolution cannot fix it, so re-resolving would only mask it.
      schema_error: false,
      budget_exhausted: false,
      client_error: true,
    };
    for (const [kind, expected] of Object.entries(expectations)) {
      expect(isRetiredDatasetSignal(kind as UpstreamOutcomeKind)).toBe(expected);
    }
  });
});

describe('ForcedReresolveGate', () => {
  it('grants one forced re-resolution per product per tour — storm protection', () => {
    const gate = new ForcedReresolveGate();
    gate.beginTour();

    expect(gate.tryAcquire('BLKSEA_ANALYSISFORECAST_PHY_007_001')).toBe(true);
    // The same product asking again in the same tour is the storm the gate exists to stop.
    expect(gate.tryAcquire('BLKSEA_ANALYSISFORECAST_PHY_007_001')).toBe(false);
    // A DIFFERENT product is its own budget.
    expect(gate.tryAcquire('MEDSEA_ANALYSISFORECAST_WAV_006_017')).toBe(true);
  });

  it('resets at the next tour', () => {
    const gate = new ForcedReresolveGate();
    gate.beginTour();
    expect(gate.tryAcquire('BLKSEA_ANALYSISFORECAST_PHY_007_001')).toBe(true);
    gate.beginTour();
    expect(gate.tryAcquire('BLKSEA_ANALYSISFORECAST_PHY_007_001')).toBe(true);
  });
});
