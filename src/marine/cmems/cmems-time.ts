/**
 * Explicit `time=` selection + the temporal-extent clamp (plan §3.2 / §5).
 *
 * ## Why a time is ALWAYS sent
 * The GetFeatureInfo reply carries NO time field at all, yet the `time=` parameter measurably
 * changes the value (SPEC v1 §3.1). Defaulting it would publish a number whose model moment
 * nobody knows: `validAtUtc` on the published value is BY DEFINITION the time we sent, so an
 * explicit, hour-aligned time is chosen here and nowhere else.
 *
 * ## Why hour-aligned, and why nearest
 * Every routed dataset is hourly (`PT1H-*`, the resolver guarantees it), and the measured
 * accepted format is a second-precision ISO instant on the hour (`2026-08-02T14:00:00Z`). The
 * NEAREST hour keeps the published instant within ±30 minutes of "now" — well inside the 3 h
 * `validAt` ceiling.
 *
 * ## The clamp
 * A time outside the dataset's temporal extent answers HTTP 400 + XML (measured; the error
 * body even prints the valid range). Around a horizon edge — our clock ahead of the
 * provider's newest published hour — the clamp turns a guaranteed 400 into the newest
 * available hour, honestly labelled by `validAtUtc`. Clamping is bounded by the ceilings: if
 * the extent end is hours behind now, the value the clamp fetches is REFUSED downstream by
 * the `validAtMaxAgeSeconds` ceiling, so the clamp can never smuggle old water in as fresh.
 */

export interface CmemsTimeSelection {
  /** Second-precision UTC instant on the hour — exactly the measured accepted wire format. */
  readonly timeIso: string;
  readonly validAtMs: number;
  /** `true` when the extent moved the instant off the nearest hour (worth a log line). */
  readonly clamped: boolean;
}

const HOUR_MS = 3_600_000;

/** Format an hour-aligned epoch as the measured wire format (no milliseconds). */
function toWireIso(ms: number): string {
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

/** Parse an extent bound; `null`/unparseable → no bound (open-ended interval). */
function boundMs(iso: string | null): number | null {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Choose the `time=` for one call: nearest hour to `now`, clamped into the resolved extent.
 *
 * The clamp floors the END bound to the hour (an extent ending `…T11:30Z` cannot serve
 * `…T12:00Z`; the newest servable hour is `…T11:00Z`) and CEILS the start bound for the same
 * reason mirrored. An inverted or empty extent yields the nearest hour unclamped — the call
 * then fails loudly as a 400 rather than this function inventing a time inside a nonsensical
 * interval.
 */
export function selectCmemsTime(
  nowMs: number,
  extent: { readonly startUtc: string | null; readonly endUtc: string | null },
): CmemsTimeSelection {
  const nearestHourMs = Math.round(nowMs / HOUR_MS) * HOUR_MS;

  const startMs = boundMs(extent.startUtc);
  const endMs = boundMs(extent.endUtc);
  const floorEndMs = endMs === null ? null : Math.floor(endMs / HOUR_MS) * HOUR_MS;
  const ceilStartMs = startMs === null ? null : Math.ceil(startMs / HOUR_MS) * HOUR_MS;

  let selected = nearestHourMs;
  if (floorEndMs !== null && selected > floorEndMs) selected = floorEndMs;
  if (ceilStartMs !== null && selected < ceilStartMs) selected = ceilStartMs;

  // Inverted after rounding (start above end): refuse to invent, send the nearest hour.
  if (ceilStartMs !== null && floorEndMs !== null && ceilStartMs > floorEndMs) {
    selected = nearestHourMs;
  }

  return {
    timeIso: toWireIso(selected),
    validAtMs: selected,
    clamped: selected !== nearestHourMs,
  };
}
