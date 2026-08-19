import { describe, expect, it } from '@jest/globals';
import { parseAfadEvent, type AfadParsedEvent } from './afad/afad-event.parse';
import { buildEarthquakeRow } from './earthquake-row';
import { EarthquakeBindingKind } from './earthquake.types';

const PLATE_CODES = new Map([
  ['kahramanmaraş', '46'],
  ['muğla', '48'],
  ['ığdır', '76'],
]);

const BUFFER_KM = 200;

function parse(overrides: Record<string, unknown>): AfadParsedEvent {
  const outcome = parseAfadEvent({
    rms: '0.29',
    eventID: '1',
    location: 'Göksun (Kahramanmaraş)',
    latitude: '38.05222',
    longitude: '36.63111',
    depth: '6.95',
    type: 'ML',
    magnitude: '1.8',
    country: 'Türkiye',
    province: 'Kahramanmaraş',
    district: 'Göksun',
    neighborhood: null,
    date: '2026-08-11T11:03:34',
    isEventUpdate: false,
    lastUpdateDate: null,
    ...overrides,
  });
  if (outcome.kind !== 'ok') throw new Error(outcome.rejection.reason);
  return outcome.event;
}

describe('buildEarthquakeRow', () => {
  it('puts an event inside Türkiye in scope on the provider’s own determination', () => {
    const row = buildEarthquakeRow(parse({}), PLATE_CODES, BUFFER_KM);
    expect(row.inScope).toBe(true);
    expect(row.bindingKind).toBe(EarthquakeBindingKind.Inside);
    expect(row.bindingPlateCode).toBe('46');
  });

  it('keeps an open-water event whose country is null — the case a country filter would drop', () => {
    // `QUESTIONS.md` D-1's named failure: six of 630 measured events carry `country: null`, and a
    // scope test reading that field alone would silently lose every one of them.
    const row = buildEarthquakeRow(
      parse({
        country: null,
        province: 'Muğla',
        location: 'Ege Denizi',
        longitude: '27.0',
        latitude: '36.9',
      }),
      PLATE_CODES,
      BUFFER_KM,
    );
    expect(row.inScope).toBe(true);
    expect(row.bindingKind).toBe(EarthquakeBindingKind.OffshoreNear);
    expect(row.bindingPlateCode).toBe('48');
  });

  it('files a neighbouring-country event across the border while still binding a province', () => {
    // The measured hazard: AFAD fills `province` for foreign events too, so the plate code is
    // present and the KIND is the only thing stopping a page from calling it a Turkish earthquake.
    const row = buildEarthquakeRow(
      parse({
        country: 'Azerbaycan',
        province: 'Iğdır',
        location: 'Kelbecer (Azerbaycan) - [137.19 km] Aralık (Iğdır)',
        latitude: '40.1',
        longitude: '46.0',
      }),
      PLATE_CODES,
      BUFFER_KM,
    );
    expect(row.bindingKind).toBe(EarthquakeBindingKind.AcrossBorder);
    expect(row.bindingPlateCode).toBe('76');
    expect(row.bindingDistanceKm).toBe(137.19);
  });

  it('never invents a plate code for a province it does not know', () => {
    const row = buildEarthquakeRow(parse({ province: 'Atlantis' }), PLATE_CODES, BUFFER_KM);
    expect(row.bindingPlateCode).toBeNull();
    // The event is still stored and still in scope — it loses a cross-link, not its existence.
    expect(row.inScope).toBe(true);
  });

  it('marks a far-away event out of scope instead of dropping it', () => {
    const row = buildEarthquakeRow(
      parse({ country: 'Portekiz', province: null, latitude: '38.0', longitude: '-28.0' }),
      PLATE_CODES,
      BUFFER_KM,
    );
    expect(row.inScope).toBe(false);
  });

  it('carries every provider field through unchanged', () => {
    const event = parse({});
    const row = buildEarthquakeRow(event, PLATE_CODES, BUFFER_KM);
    expect(row.providerEventId).toBe(event.providerEventId);
    expect(row.occurredAtUtc).toBe(event.occurredAtUtc);
    expect(row.latitude).toBe(event.latitude);
    expect(row.longitude).toBe(event.longitude);
    expect(row.magnitude).toBe(event.magnitude);
    expect(row.magnitudeTypeRaw).toBe(event.magnitudeTypeRaw);
    expect(row.providerLocationRaw).toBe(event.providerLocationRaw);
  });
});
