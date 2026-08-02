/**
 * The THIRD staleness ceiling, as pure arithmetic (SPEC §9.4). The marine `ecmwf-cycle.ts`
 * precedent, kept in this leg's own folder — `src/upstream` is deliberately NOT generalised
 * (SPEC §6.5).
 *
 * ## Why the two M2 ceilings cannot see this failure
 * A CAMS run covers +96 hours. A run from four days ago STILL yields a step whose valid time is
 * ≈ now, so `AIR_QUALITY_VALID_AT_MAX_AGE_SECONDS` never fires; and this leg's `fetchedAtUtc` is
 * the COMPILE moment, which is always fresh, so `AIR_QUALITY_STALE_MAX_SECONDS` never fires
 * either. Only the run's own age exposes a stalled ingest, and a breach must SUPPRESS publication
 * rather than label it — a plausible number of unknown vintage on a page that teaches geography
 * is worse than no number.
 */

/** Age of a run in seconds at `now`. Never negative: a future run reads as brand new. */
export function runAgeSeconds(runUtc: Date, now: Date): number {
  return Math.max(0, (now.getTime() - runUtc.getTime()) / 1000);
}

/** The ceiling verdict. `true` while the run may still be published. */
export function isRunWithinMaxAge(runUtc: Date, now: Date, maxAgeSeconds: number): boolean {
  return runAgeSeconds(runUtc, now) <= maxAgeSeconds;
}
