import type { AfadParsedEvent } from './afad-event.parse';
import { formatAfadUtc } from './afad-time';
import { quoteProviderText } from './afad-log-safe';

/**
 * The write-path fidelity rule for the earthquake line (`ENGINEERING.md` §5, SPEC §13.1).
 *
 * ## Why range invariants are not enough
 * This line PUBLISHES numbers derived from an external source, and the failures that matter are
 * the plausible ones. A timestamp shifted by three hours, a latitude and longitude swapped, a
 * magnitude rounded from 4.25 to 4.3 — every one of them satisfies every range, ordering and
 * count check the suite could run, and every one of them is wrong on the page.
 *
 * So before a row may be written, the values we are about to store are turned BACK into the
 * provider's own form and compared with the bytes the provider actually sent, field by field, by
 * NAME. Comparing by name is what catches the swap: `latitude` is checked against the raw
 * `latitude`, so a transposed pair fails even though both numbers are individually valid.
 *
 * Tolerance is zero. A `null` return means the row may be written; a string is the reason it may
 * not, and it reaches the caller as that ROW's `schema_error`.
 */
export function checkAfadFidelity(
  record: Record<string, unknown>,
  event: AfadParsedEvent,
  fractionDigits: number,
): string | null {
  const rawDate = record['date'];
  if (typeof rawDate !== 'string') return 'fidelity: date is no longer a string';
  const roundTripped = formatAfadUtc(event.occurredAtUtc, fractionDigits);
  if (roundTripped !== rawDate) {
    // The three-hour class of bug lands EXACTLY here and nowhere else.
    return `fidelity: occurredAtUtc re-serialises to "${roundTripped}" but the provider sent ${quoteProviderText(rawDate)}`;
  }

  for (const [key, stored] of [
    ['latitude', event.latitude],
    ['longitude', event.longitude],
    ['depth', event.depthKm],
    ['magnitude', event.magnitude],
  ] as const) {
    const raw = record[key];
    if (typeof raw !== 'string') return `fidelity: ${key} is no longer a string`;
    // `Number` is safe here BECAUSE the parser already refused anything that is not a plain
    // decimal — this is the confirming read, not the parsing read.
    if (Number(raw) !== stored) {
      return `fidelity: ${key} stored as ${String(stored)} but the provider sent ${quoteProviderText(raw)}`;
    }
  }

  const rawLocation = record['location'];
  if (typeof rawLocation !== 'string' || rawLocation !== event.providerLocationRaw) {
    return 'fidelity: providerLocationRaw does not match the provider location byte for byte';
  }
  if (!rawLocation.trimStart().startsWith(event.placeNameTr)) {
    // The derived label must be a PREFIX of what the provider said — never a rewrite, never a
    // string assembled from somewhere else.
    return `fidelity: derived placeNameTr ${quoteProviderText(event.placeNameTr)} is not a prefix of the provider location`;
  }

  // The verbatim STRINGS, checked by name for the same reason the numbers are: `provider_province`
  // is the SOLE input to the province cross-link, so reading `district` into it — or shifting the
  // three reads by one key — publishes a plausible, in-range, correctly-shaped wrong province on
  // every event, which no range or count invariant can see (`ENGINEERING.md` §5, review #118
  // SFH118-M4). `readNullableString` folds an absent value and an empty one to the same `null`, so
  // the expectation folds them the same way rather than assuming one of them.
  for (const [key, stored] of [
    ['type', event.magnitudeTypeRaw],
    ['country', event.providerCountry],
    ['province', event.providerProvince],
    ['district', event.providerDistrict],
  ] as const) {
    const raw = record[key];
    const expected = raw === null || raw === undefined || raw === '' ? null : raw;
    if (expected !== stored) {
      return `fidelity: ${key} stored as ${quoteProviderText(stored)} but the provider sent ${quoteProviderText(raw)}`;
    }
  }

  const rawIsUpdate = record['isEventUpdate'];
  if (rawIsUpdate !== event.isRevised) {
    return `fidelity: isRevised stored as ${String(event.isRevised)} but the provider sent ${quoteProviderText(rawIsUpdate)}`;
  }

  const rawUpdatedAt = record['lastUpdateDate'];
  const updatedAtAbsent = rawUpdatedAt === null || rawUpdatedAt === undefined;
  if (updatedAtAbsent !== (event.providerUpdatedAtUtc === null)) {
    return 'fidelity: providerUpdatedAtUtc and the provider lastUpdateDate disagree about existing';
  }
  if (typeof rawUpdatedAt === 'string' && event.providerUpdatedAtUtc !== null) {
    // A byte round trip is not available here on purpose: this field is MEASURED with microsecond
    // precision and a JS Date holds milliseconds, so the tail is a stated, deliberate truncation
    // (`afad-event.parse.ts`). The whole-second prefix is the strongest check that stays true of
    // that truncation — and it is the part a three-hour shift or a wrong-key read would break.
    const wholeSecond = formatAfadUtc(event.providerUpdatedAtUtc, 0);
    if (!rawUpdatedAt.startsWith(wholeSecond)) {
      return `fidelity: providerUpdatedAtUtc re-serialises to "${wholeSecond}" which is not how the provider's lastUpdateDate starts`;
    }
  }

  return null;
}
