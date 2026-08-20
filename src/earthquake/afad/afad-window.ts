import { EarthquakeIngestJobKind, type EarthquakeIngestCadence } from '../earthquake.types';
import type { EarthquakeUpstreamConfig } from '../earthquake-upstream.config';
import { toAfadQueryStamp } from './afad-time';

/** The window a tour asks the provider for. Always explicit, always both ends. */
export interface AfadWindow {
  readonly startUtc: Date;
  readonly endUtc: Date;
}

/**
 * Build the window for one tour.
 *
 * ## `end` runs slightly into the future ON PURPOSE
 * `end = now + clockSkewSeconds`. If our clock sits a few seconds behind AFAD's, `end = now` drops
 * the newest event until the next tour — no data is lost (the windows overlap) but freshness falls
 * for no reason. A future `end` is accepted by the provider (measured, SPEC §3.7).
 *
 * ## Two cadences, because the revision window is measured in DAYS for big events
 * `recent` is the narrow, frequent tour. `reconcile` is the wide, rare one that catches late
 * revisions — Pazarcık M7.7 was revised 8.5 hours later, Elbistan M7.6 three days later
 * (SPEC §3.8), and those are precisely the rows that get read the most.
 *
 * ## The parameter is the CADENCE type, not the whole job-kind set
 * The span is chosen with `=== Recent ? … : …`, so any third member would silently take the
 * reconcile branch. `EarthquakeIngestCadence` excludes the hand-run backfill, which builds its
 * windows from `--from`/`--to` and must never reach this function.
 */
export function buildAfadWindow(
  jobKind: EarthquakeIngestCadence,
  nowMs: number,
  config: EarthquakeUpstreamConfig,
): AfadWindow {
  const spanMs =
    jobKind === EarthquakeIngestJobKind.Recent
      ? config.recentWindowHours * 3_600_000
      : config.reconcileWindowDays * 86_400_000;
  const endUtc = new Date(nowMs + config.clockSkewSeconds * 1000);
  return { startUtc: new Date(nowMs - spanMs), endUtc };
}

/**
 * `{base}/event/filter?start=…&end=…&limit=…`
 *
 * ## `orderby` is never sent, and `limit` never means "the latest N"
 * The provider applies `limit` BEFORE `orderby`: `limit=3&orderby=timedesc` returned the three
 * OLDEST events of the window (measured, SPEC §3.4). So ordering upstream buys nothing — we sort
 * ourselves — and `limit` is only ever the overflow ceiling whose breach is an alarm.
 *
 * Built by hand rather than with `URLSearchParams`, for the same measured reason the YouTube leg
 * does: the stamps contain `:` and `URLSearchParams` percent-encodes it, while the form proven to
 * work against this endpoint uses the literal colons. Both stamps are `[0-9T:-]` by construction
 * (`toAfadQueryStamp` slices an ISO string) and the limit is a validated integer, so there is
 * nothing here that could need escaping.
 */
export function buildAfadEventFilterUrl(
  baseUrl: string,
  window: AfadWindow,
  safetyLimit: number,
): string {
  const base = baseUrl.replace(/\/+$/, '');
  const start = toAfadQueryStamp(window.startUtc);
  const end = toAfadQueryStamp(window.endUtc);
  return `${base}/event/filter?start=${start}&end=${end}&limit=${String(safetyLimit)}`;
}
