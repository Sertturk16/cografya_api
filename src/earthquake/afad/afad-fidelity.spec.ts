import { describe, expect, it } from '@jest/globals';
import { MagnitudeType } from '../earthquake.types';
import { checkAfadFidelity } from './afad-fidelity';
import type { AfadParsedEvent } from './afad-event.parse';

/**
 * The fidelity rule, exercised directly.
 *
 * These cases are the ones no range or ordering invariant can see: a timestamp shifted by whole
 * hours, a latitude and longitude swapped, a magnitude rounded. Every input below stays inside
 * every constraint the database has, and every one of them is wrong.
 */

const RAW: Record<string, unknown> = {
  eventID: '725329',
  date: '2026-08-11T11:03:34',
  latitude: '38.05222',
  longitude: '36.63111',
  depth: '6.95',
  magnitude: '1.8',
  location: 'Göksun (Kahramanmaraş)',
};

function event(overrides: Partial<AfadParsedEvent> = {}): AfadParsedEvent {
  return {
    providerEventId: '725329',
    occurredAtUtc: new Date(Date.UTC(2026, 7, 11, 11, 3, 34)),
    latitude: 38.05222,
    longitude: 36.63111,
    depthKm: 6.95,
    magnitude: 1.8,
    magnitudeType: MagnitudeType.Ml,
    magnitudeTypeRaw: 'ML',
    providerCountry: 'Türkiye',
    providerProvince: 'Kahramanmaraş',
    providerDistrict: 'Göksun',
    providerLocationRaw: 'Göksun (Kahramanmaraş)',
    placeNameTr: 'Göksun (Kahramanmaraş)',
    bindingDistanceKm: null,
    hasDistanceBracket: false,
    isRevised: false,
    providerUpdatedAtUtc: null,
    ...overrides,
  };
}

describe('checkAfadFidelity', () => {
  it('passes a row whose stored values re-serialise to exactly what the provider sent', () => {
    expect(checkAfadFidelity(RAW, event(), 0)).toBeNull();
  });

  it('catches a whole-hour timezone shift', () => {
    const shifted = new Date(Date.UTC(2026, 7, 11, 14, 3, 34));
    expect(checkAfadFidelity(RAW, event({ occurredAtUtc: shifted }), 0)).toContain('occurredAtUtc');
  });

  it('catches a latitude/longitude swap, because it compares by NAME', () => {
    const swapped = event({ latitude: 36.63111, longitude: 38.05222 });
    expect(checkAfadFidelity(RAW, swapped, 0)).toContain('latitude');
  });

  it('catches a rounded magnitude', () => {
    expect(checkAfadFidelity(RAW, event({ magnitude: 1.75 }), 0)).toContain('magnitude');
  });

  it('catches a place label that is not a prefix of what the provider said', () => {
    const invented = event({ placeNameTr: 'Kahramanmaraş merkez' });
    expect(checkAfadFidelity(RAW, invented, 0)).toContain('placeNameTr');
  });

  it('catches a location string that was rewritten on the way in', () => {
    const rewritten = event({ providerLocationRaw: 'Goksun (Kahramanmaras)' });
    expect(checkAfadFidelity(RAW, rewritten, 0)).toContain('providerLocationRaw');
  });
});
