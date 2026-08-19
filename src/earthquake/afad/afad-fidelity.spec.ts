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
  type: 'ML',
  location: 'Göksun (Kahramanmaraş)',
  country: 'Türkiye',
  province: 'Kahramanmaraş',
  district: 'Göksun',
  isEventUpdate: false,
  lastUpdateDate: null,
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

  it('catches the province/district reads shifted by one key', () => {
    // The failure that made the string fields worth checking at all (review #118 SFH118-M4):
    // `provider_province` is the SOLE input to the province cross-link, so reading `district` into
    // it publishes a plausible, in-range, correctly-shaped wrong province on every event.
    const shifted = event({ providerProvince: 'Göksun', providerDistrict: 'Kahramanmaraş' });
    expect(checkAfadFidelity(RAW, shifted, 0)).toContain('province');
  });

  it('catches a magnitude type stored as something the provider did not send', () => {
    expect(checkAfadFidelity(RAW, event({ magnitudeTypeRaw: 'MW' }), 0)).toContain('type');
  });

  it('folds an absent country and an empty one together, the way the parser does', () => {
    // `readNullableString` turns both `null` and `''` into `null`, so the check must too — or a
    // legitimately country-less open-sea row would be refused by its own fidelity rule.
    const openSea = event({ providerCountry: null });
    expect(checkAfadFidelity({ ...RAW, country: null }, openSea, 0)).toBeNull();
    expect(checkAfadFidelity({ ...RAW, country: '' }, openSea, 0)).toBeNull();
    // The control: with the country present, storing null IS caught.
    expect(checkAfadFidelity(RAW, openSea, 0)).toContain('country');
  });

  it('catches a revision flag that does not match the provider’s', () => {
    expect(checkAfadFidelity(RAW, event({ isRevised: true }), 0)).toContain('isRevised');
  });

  it('catches a lastUpdateDate that exists on one side only', () => {
    const claimed = event({ providerUpdatedAtUtc: new Date(Date.UTC(2026, 7, 11, 12, 0, 0)) });
    expect(checkAfadFidelity(RAW, claimed, 0)).toContain('providerUpdatedAtUtc');

    const dropped = { ...RAW, lastUpdateDate: '2026-08-11T12:00:00' };
    expect(checkAfadFidelity(dropped, event(), 0)).toContain('providerUpdatedAtUtc');
  });

  it('accepts lastUpdateDate’s stated sub-millisecond truncation, and only that', () => {
    const raw = { ...RAW, lastUpdateDate: '2026-08-06T12:56:14.719149' };
    const stored = event({ providerUpdatedAtUtc: new Date(Date.UTC(2026, 7, 6, 12, 56, 14, 719)) });
    expect(checkAfadFidelity(raw, stored, 0)).toBeNull();

    // The same field shifted by three hours is NOT truncation, and is caught.
    const shifted = event({ providerUpdatedAtUtc: new Date(Date.UTC(2026, 7, 6, 9, 56, 14, 719)) });
    expect(checkAfadFidelity(raw, shifted, 0)).toContain('providerUpdatedAtUtc');
  });
});
