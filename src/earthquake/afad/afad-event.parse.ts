import { MagnitudeType } from '../earthquake.types';
import { UpstreamSchemaError } from '../../upstream/upstream.types';
import { parseAfadUtc } from './afad-time';
import { checkAfadFidelity } from './afad-fidelity';
import { quoteProviderText } from './afad-log-safe';

/**
 * Turning one AFAD JSON row into the values we store — and refusing the ones we cannot vouch for.
 *
 * ## Everything arrives as a string, so `Number()` is banned here
 * `latitude`, `longitude`, `depth` and `magnitude` all come over the wire as strings (SPEC §3.2).
 * `Number('')` is 0, `Number(' 3 ')` is 3 and `Number('1e3')` is 1000 — three different ways for a
 * malformed payload to become a plausible number nobody ever questions. Every numeric field is
 * therefore shape-checked by regex first and converted second.
 *
 * ## A bad row is a ROW's failure
 * The tour continues and the row is counted and named. Only a broken ENVELOPE — a body that is not
 * an array, or a response that reached the safety limit — is a tour-level `schema_error`, because
 * those two mean we cannot tell what we are missing.
 */

/** Column scales from the E1 migration. A value finer than its column would be ROUNDED on write. */
const SCALE = {
  latitude: 6,
  longitude: 6,
  depthKm: 3,
  magnitude: 2,
  bindingDistanceKm: 2,
} as const;

/** Column lengths from the E1 migration, checked before the insert rather than by the insert. */
const MAX_LENGTH = {
  providerEventId: 32,
  magnitudeTypeRaw: 16,
  providerCountry: 64,
  providerProvince: 64,
  providerDistrict: 64,
  providerLocationRaw: 160,
  placeNameTr: 160,
} as const;

/**
 * What `binding_distance_km numeric(6,2)` can hold: four digits before the point, two after.
 *
 * The E1 column, not a measurement — the measured brackets run 1.57-160.82 km (SPEC §3.5) and a
 * ceiling set from those would refuse a legitimately larger future value. This one refuses only
 * what the database physically cannot store.
 */
const MAX_BINDING_DISTANCE_KM = 9_999.99;

/** A decimal number as the provider writes it. No exponent, no whitespace, no `+`. */
const DECIMAL = /^-?\d+(?:\.(\d+))?$/;

/**
 * The composite `location` form: `<place> - [NN.NN km] <district> (<province>)`.
 *
 * 88 of 630 measured rows carry it. The bracketed number is the distance to the nearest DISTRICT
 * CENTRE — not to the border, and it appears on lake and reservoir events too, so it is never a
 * scope signal (SPEC §3.5).
 */
const COMPOSITE_LOCATION =
  /^(?<place>.+?)\s*-\s*\[\s*(?<km>\d+(?:\.\d+)?)\s*km\s*\]\s*(?<district>.+?)\s*\((?<province>[^)]+)\)$/;

/** The marker that says "this string is TRYING to be the composite form". */
const COMPOSITE_HINT = /\[\s*\d/;

export interface AfadParsedLocation {
  readonly placeNameTr: string;
  readonly bindingDistanceKm: number | null;
  readonly hasDistanceBracket: boolean;
}

export interface AfadParsedEvent {
  readonly providerEventId: string;
  readonly occurredAtUtc: Date;
  readonly latitude: number;
  readonly longitude: number;
  readonly depthKm: number;
  readonly magnitude: number;
  readonly magnitudeType: MagnitudeType;
  readonly magnitudeTypeRaw: string;
  readonly providerCountry: string | null;
  readonly providerProvince: string | null;
  readonly providerDistrict: string | null;
  readonly providerLocationRaw: string;
  readonly placeNameTr: string;
  readonly bindingDistanceKm: number | null;
  readonly hasDistanceBracket: boolean;
  readonly isRevised: boolean;
  readonly providerUpdatedAtUtc: Date | null;
}

export interface AfadRowRejection {
  /** The provider's id when we could read it — a rejection nobody can locate is half a report. */
  readonly providerEventId: string | null;
  readonly reason: string;
}

export interface AfadParsedPayload {
  readonly fetchedCount: number;
  readonly accepted: readonly AfadParsedEvent[];
  readonly rejected: readonly AfadRowRejection[];
}

/**
 * Parse a whole `event/filter` response.
 *
 * @throws UpstreamSchemaError when the ENVELOPE is wrong — not an array, or exactly `safetyLimit`
 * rows. The second is not paranoia: `limit` is applied BEFORE `orderby` upstream (SPEC §3.4), so a
 * response sitting exactly on the ceiling is indistinguishable from a silently truncated window,
 * and quietly accepting it would drop events nobody ever hears about.
 */
export function parseAfadEventsBody(
  body: string,
  options: { readonly safetyLimit: number },
): AfadParsedPayload {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (error: unknown) {
    throw new UpstreamSchemaError(
      `AFAD event/filter body is not JSON: ${error instanceof Error ? error.message : 'unknown'}`,
    );
  }
  if (!Array.isArray(payload)) {
    throw new UpstreamSchemaError(
      `AFAD event/filter body is ${describeShape(payload)}, expected a JSON array`,
    );
  }
  if (payload.length >= options.safetyLimit) {
    throw new UpstreamSchemaError(
      `AFAD event/filter returned ${String(payload.length)} rows, at or above the safety limit ` +
        `${String(options.safetyLimit)} — the window may have been truncated upstream and this ` +
        `response cannot be trusted to be complete`,
    );
  }

  const accepted: AfadParsedEvent[] = [];
  const rejected: AfadRowRejection[] = [];
  for (const row of payload) {
    const outcome = parseAfadEvent(row);
    if (outcome.kind === 'ok') accepted.push(outcome.event);
    else rejected.push(outcome.rejection);
  }
  return { fetchedCount: payload.length, accepted, rejected };
}

export type AfadRowOutcome =
  | { readonly kind: 'ok'; readonly event: AfadParsedEvent }
  | { readonly kind: 'rejected'; readonly rejection: AfadRowRejection };

/** Parse one row. Exported for the probe's schema test, which runs it over the committed samples. */
export function parseAfadEvent(row: unknown): AfadRowOutcome {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    return reject(null, `row is ${describeShape(row)}, expected an object`);
  }
  const record = row as Record<string, unknown>;

  const providerEventId = readString(record, 'eventID');
  if (providerEventId === null || providerEventId === '') {
    return reject(null, 'eventID is missing or not a non-empty string');
  }
  if (providerEventId.length > MAX_LENGTH.providerEventId) {
    return reject(providerEventId, `eventID is longer than ${String(MAX_LENGTH.providerEventId)}`);
  }

  const rawDate = readString(record, 'date');
  if (rawDate === null) return reject(providerEventId, 'date is missing or not a string');
  const occurred = parseAfadUtc(rawDate);
  if (occurred === null) {
    return reject(providerEventId, `date ${quoteProviderText(rawDate)} is not a valid UTC stamp`);
  }
  if (occurred.subMillisecondRemainder !== 0) {
    // Sub-millisecond precision we cannot store is precision we would be silently inventing on the
    // way out. Never measured on `date`; refused rather than rounded (SPEC §13.1).
    return reject(
      providerEventId,
      `date ${quoteProviderText(rawDate)} carries sub-millisecond precision`,
    );
  }

  const latitude = readDecimal(record, 'latitude', SCALE.latitude);
  const longitude = readDecimal(record, 'longitude', SCALE.longitude);
  const depthKm = readDecimal(record, 'depth', SCALE.depthKm);
  const magnitude = readDecimal(record, 'magnitude', SCALE.magnitude);
  for (const [field, parsed] of [
    ['latitude', latitude],
    ['longitude', longitude],
    ['depth', depthKm],
    ['magnitude', magnitude],
  ] as const) {
    if (parsed === null) {
      return reject(
        providerEventId,
        `${field} ${quoteProviderText(record[field])} is not a decimal our column can hold ` +
          'without rounding',
      );
    }
  }
  // Re-stated for the type narrower; each was proven non-null by the loop above.
  if (latitude === null || longitude === null || depthKm === null || magnitude === null) {
    return reject(providerEventId, 'numeric field parsing failed');
  }

  // Ranges the E1 CHECK constraints enforce anyway. Checked here so the refusal names the field
  // instead of arriving as a Postgres constraint violation with a row nobody can identify.
  if (latitude < -90 || latitude > 90) return reject(providerEventId, 'latitude is out of range');
  if (longitude < -180 || longitude > 180) {
    return reject(providerEventId, 'longitude is out of range');
  }
  if (depthKm < -5 || depthKm > 1000) return reject(providerEventId, 'depth is out of range');
  if (magnitude < -1 || magnitude > 10) return reject(providerEventId, 'magnitude is out of range');

  const magnitudeTypeRaw = readString(record, 'type');
  if (magnitudeTypeRaw === null || magnitudeTypeRaw === '') {
    return reject(providerEventId, 'type is missing or not a non-empty string');
  }
  if (magnitudeTypeRaw.length > MAX_LENGTH.magnitudeTypeRaw) {
    return reject(providerEventId, 'type is longer than the column allows');
  }

  const providerLocationRaw = readString(record, 'location');
  if (providerLocationRaw === null || providerLocationRaw === '') {
    return reject(providerEventId, 'location is missing or not a non-empty string');
  }
  if (providerLocationRaw.length > MAX_LENGTH.providerLocationRaw) {
    return reject(providerEventId, 'location is longer than the column allows');
  }
  const location = parseAfadLocation(providerLocationRaw);
  if (location === null) {
    return reject(
      providerEventId,
      `location ${quoteProviderText(providerLocationRaw)} looks composite but does not match the ` +
        'known shape',
    );
  }
  if (location.placeNameTr.length > MAX_LENGTH.placeNameTr) {
    return reject(providerEventId, 'derived place name is longer than the column allows');
  }
  if (
    location.bindingDistanceKm !== null &&
    decimalScale(String(location.bindingDistanceKm)) > SCALE.bindingDistanceKm
  ) {
    return reject(providerEventId, 'bracket distance is finer than its column');
  }
  // The bracket distance was the one provider-derived number with no range refusal, so a glitched
  // `... - [123456.78 km] X (Y)` passed the parser and was refused by `numeric(6,2)` at the insert
  // instead — counted as `eq.row_write_failed` ("the DATABASE refused") when the payload was what
  // disagreed with the contract (review #118 CODE118-M2). The four numbers above are refused by
  // name here for exactly that reason.
  if (location.bindingDistanceKm !== null && location.bindingDistanceKm > MAX_BINDING_DISTANCE_KM) {
    return reject(providerEventId, 'bracket distance is larger than its column');
  }

  const providerCountry = readNullableString(record, 'country', MAX_LENGTH.providerCountry);
  if (providerCountry === false) return reject(providerEventId, 'country has an unusable value');
  const providerProvince = readNullableString(record, 'province', MAX_LENGTH.providerProvince);
  if (providerProvince === false) return reject(providerEventId, 'province has an unusable value');
  const providerDistrict = readNullableString(record, 'district', MAX_LENGTH.providerDistrict);
  if (providerDistrict === false) return reject(providerEventId, 'district has an unusable value');

  const isEventUpdate = record['isEventUpdate'];
  if (typeof isEventUpdate !== 'boolean') {
    return reject(providerEventId, 'isEventUpdate is missing or not a boolean');
  }

  const rawUpdatedAt = record['lastUpdateDate'];
  let providerUpdatedAtUtc: Date | null = null;
  if (rawUpdatedAt !== null && rawUpdatedAt !== undefined) {
    if (typeof rawUpdatedAt !== 'string') {
      return reject(providerEventId, 'lastUpdateDate is neither a string nor null');
    }
    const updated = parseAfadUtc(rawUpdatedAt);
    if (updated === null) {
      return reject(
        providerEventId,
        `lastUpdateDate ${quoteProviderText(rawUpdatedAt)} is not a valid UTC stamp`,
      );
    }
    // Unlike `date`, this one is MEASURED with microsecond precision (`…:14.719149`). A JS Date
    // holds milliseconds, so the tail is truncated — a stated, deterministic precision loss on a
    // field that answers "when was this revised", never "by how much".
    providerUpdatedAtUtc = updated.instant;
  }

  const event: AfadParsedEvent = {
    providerEventId,
    occurredAtUtc: occurred.instant,
    latitude,
    longitude,
    depthKm,
    magnitude,
    magnitudeType: normaliseMagnitudeType(magnitudeTypeRaw),
    magnitudeTypeRaw,
    providerCountry,
    providerProvince,
    providerDistrict,
    providerLocationRaw,
    placeNameTr: location.placeNameTr,
    bindingDistanceKm: location.bindingDistanceKm,
    hasDistanceBracket: location.hasDistanceBracket,
    isRevised: isEventUpdate,
    providerUpdatedAtUtc,
  };

  // THE WRITE-PATH FIDELITY GATE (`ENGINEERING.md` §5, SPEC §13.1). Nothing else in this leg
  // constructs a row, so passing here is the only way into the store.
  const infidelity = checkAfadFidelity(record, event, occurred.fractionDigits);
  if (infidelity !== null) return reject(providerEventId, infidelity);

  return { kind: 'ok', event };
}

/**
 * Split `location` into the reader-facing place name and the provider's bracket distance.
 *
 * Returns `null` for a string that carries the bracket marker but does not match the composite
 * shape: publishing `Ege Denizi - [56.72 km` as a place label would be a provider-internal format
 * leaking onto a page, and guessing at the boundary would be worse than refusing the row.
 */
export function parseAfadLocation(raw: string): AfadParsedLocation | null {
  const composite = COMPOSITE_LOCATION.exec(raw);
  if (composite !== null) {
    const place = composite.groups?.['place']?.trim() ?? '';
    const km = composite.groups?.['km'] ?? '';
    if (place === '' || km === '') return null;
    return { placeNameTr: place, bindingDistanceKm: Number(km), hasDistanceBracket: true };
  }
  if (COMPOSITE_HINT.test(raw)) return null;
  return { placeNameTr: raw.trim(), bindingDistanceKm: null, hasDistanceBracket: false };
}

/**
 * Map the provider's magnitude-type string onto our published token, case-insensitively.
 *
 * The provider's own casing is inconsistent (`ML`, `MW`, `Md` all measured) and its documentation
 * lists eight spellings. Anything outside the set becomes {@link MagnitudeType.Other} rather than
 * failing: mapping one-to-one onto a closed set would drop an entire tour into `schema_error` the
 * day AFAD publishes a new method — the provider adding a technique would darken our page
 * (SPEC §5.3). The raw string is stored beside it, so the normalisation is never a one-way door.
 */
export function normaliseMagnitudeType(raw: string): MagnitudeType {
  switch (raw.trim().toLowerCase()) {
    case 'ml':
      return MagnitudeType.Ml;
    case 'mw':
      return MagnitudeType.Mw;
    case 'ms':
      return MagnitudeType.Ms;
    case 'mb':
      return MagnitudeType.Mb;
    case 'md':
      return MagnitudeType.Md;
    case 'mwp':
      return MagnitudeType.Mwp;
    default:
      return MagnitudeType.Other;
  }
}

/** How many digits a decimal string carries after the point. */
export function decimalScale(raw: string): number {
  return DECIMAL.exec(raw)?.[1]?.length ?? 0;
}

function readDecimal(
  record: Record<string, unknown>,
  key: string,
  maxScale: number,
): number | null {
  const raw = record[key];
  if (typeof raw !== 'string') return null;
  if (!DECIMAL.test(raw)) return null;
  if (decimalScale(raw) > maxScale) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const raw = record[key];
  return typeof raw === 'string' ? raw : null;
}

/** `false` means "present but unusable"; `null` means a legitimately absent value. */
function readNullableString(
  record: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | null | false {
  const raw = record[key];
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return false;
  if (raw.length > maxLength) return false;
  return raw === '' ? null : raw;
}

function reject(providerEventId: string | null, reason: string): AfadRowOutcome {
  return { kind: 'rejected', rejection: { providerEventId, reason } };
}

function describeShape(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}
