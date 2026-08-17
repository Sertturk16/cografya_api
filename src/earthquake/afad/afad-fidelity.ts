import type { AfadParsedEvent } from './afad-event.parse';
import { formatAfadUtc } from './afad-time';

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
    return `fidelity: occurredAtUtc re-serialises to "${roundTripped}" but the provider sent "${rawDate}"`;
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
      return `fidelity: ${key} stored as ${String(stored)} but the provider sent "${raw}"`;
    }
  }

  const rawLocation = record['location'];
  if (typeof rawLocation !== 'string' || rawLocation !== event.providerLocationRaw) {
    return 'fidelity: providerLocationRaw does not match the provider location byte for byte';
  }
  if (!rawLocation.trimStart().startsWith(event.placeNameTr)) {
    // The derived label must be a PREFIX of what the provider said — never a rewrite, never a
    // string assembled from somewhere else.
    return `fidelity: derived placeNameTr "${event.placeNameTr}" is not a prefix of the provider location`;
  }

  return null;
}
