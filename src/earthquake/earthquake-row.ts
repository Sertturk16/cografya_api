import type { AfadParsedEvent } from './afad/afad-event.parse';
import type { EarthquakeEventUpsert } from './earthquake-ingest.store';
import { normaliseProvinceName, resolveBindingKind } from './scope/earthquake-binding';
import { isWithinTrScope } from './scope/tr-boundary';

/** AFAD's own spelling of the country, as it arrives on the wire. */
const TURKIYE = 'Türkiye';

/**
 * Turn one parsed AFAD event into the row we store: scope, binding kind, plate code.
 *
 * A pure function rather than a method, because TWO callers must classify identically — the
 * scheduled tours and the hand-run backfill. A second copy of this logic would be a second answer
 * to "is this event in scope", and the two would drift on the first correction.
 *
 * ## Both scope terms are load-bearing
 * `country === 'Türkiye'` is AFAD's own administrative determination and is reliable for events on
 * Turkish soil. It is not sufficient: the six measured open-water events carry `country: null`, so
 * a filter reading that field alone would drop every Aegean and Mediterranean offshore event —
 * precisely the failure `QUESTIONS.md` D-1 named. The geometric term is what catches them, at the
 * 200 km buffer ruled by `DEC 2026-08-17k` md.4.
 *
 * ## An unmatched province loses a link, never invents one
 * The plate code comes from matching the provider's province NAME against our own table. No match
 * means `null`: the event is still stored and published, it simply carries no cross-link. Guessing
 * would put an earthquake on a province page it never happened near, which is the exact factual
 * error `bindingKind` exists to prevent.
 */
export function buildEarthquakeRow(
  event: AfadParsedEvent,
  plateCodes: ReadonlyMap<string, string>,
  scopeBufferKm: number,
): EarthquakeEventUpsert {
  const inScope =
    event.providerCountry === TURKIYE ||
    isWithinTrScope(event.longitude, event.latitude, scopeBufferKm);

  const bindingPlateCode =
    event.providerProvince === null
      ? null
      : (plateCodes.get(normaliseProvinceName(event.providerProvince)) ?? null);

  return {
    providerEventId: event.providerEventId,
    occurredAtUtc: event.occurredAtUtc,
    latitude: event.latitude,
    longitude: event.longitude,
    depthKm: event.depthKm,
    magnitude: event.magnitude,
    magnitudeType: event.magnitudeType,
    magnitudeTypeRaw: event.magnitudeTypeRaw,
    providerCountry: event.providerCountry,
    providerProvince: event.providerProvince,
    providerDistrict: event.providerDistrict,
    providerLocationRaw: event.providerLocationRaw,
    placeNameTr: event.placeNameTr,
    bindingKind: resolveBindingKind({
      providerCountry: event.providerCountry,
      hasDistanceBracket: event.hasDistanceBracket,
      placeNameTr: event.placeNameTr,
    }),
    bindingPlateCode,
    bindingDistanceKm: event.bindingDistanceKm,
    inScope,
    isRevised: event.isRevised,
    providerUpdatedAtUtc: event.providerUpdatedAtUtc,
  };
}
