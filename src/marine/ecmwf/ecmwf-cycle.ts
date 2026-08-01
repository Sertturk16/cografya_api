import { ECMWF_STEP_HOURS, type EcmwfStream } from './ecmwf.constants';
import { EcmwfContractError } from './ecmwf.errors';
import type { EcmwfIndexExpectation } from './ecmwf-index';

/**
 * Cycle selection, URL construction and step ordering — the pure arithmetic of the scheduled
 * ingest (yeni-M3 SPEC §4.2/§9.2/§9.4). Nothing here touches the network or the database.
 *
 * ## Vocabulary
 * A CYCLE is one model run, identified by its 00/06/12/18 UTC start. ECMWF publishes a cycle
 * 7–9 hours after its hour (measured, F2 §5), so "the newest cycle" is a guess that must be
 * probed: the candidate walk starts at `now − 9 h` floored to the previous 6-hour slot and
 * falls back one cycle at a time when the provider answers 404 (an EXPECTED state — the quiet
 * abandon class, board item NEW-1).
 */

/** Publication lag the candidate walk assumes — the provider's own measured 7–9 h, upper bound. */
export const ECMWF_PUBLICATION_LAG_HOURS = 9;

/** Hours between model runs: 00/06/12/18 UTC. */
export const ECMWF_CYCLE_INTERVAL_HOURS = 6;

/**
 * How many cycles the walk may fall back from the newest candidate (SPEC §4.2: "en fazla 3
 * çevrim geriye"). 1 + 3 candidates cover 18 hours; anything older is already close to the
 * 24 h cycle-age ceiling and not worth a request.
 */
export const ECMWF_MAX_FALLBACK_CYCLES = 3;

/** The resolution path segment of every Faz-1 URL. */
const ECMWF_RESOLUTION_PATH = 'ifs/0p25';

/**
 * Candidate cycles, newest first: floor `now − 9 h` to the previous 6-hour UTC slot, then walk
 * back {@link ECMWF_MAX_FALLBACK_CYCLES} more. Same arithmetic as the probe tool's
 * (`probe-marine-ecmwf.ts`), with the count the runtime SPEC fixes.
 */
export function candidateCycles(now: Date): Date[] {
  const shifted = new Date(now.getTime() - ECMWF_PUBLICATION_LAG_HOURS * 3_600_000);
  const flooredHour =
    Math.floor(shifted.getUTCHours() / ECMWF_CYCLE_INTERVAL_HOURS) * ECMWF_CYCLE_INTERVAL_HOURS;
  const newest = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), flooredHour),
  );
  return Array.from(
    { length: 1 + ECMWF_MAX_FALLBACK_CYCLES },
    (_unused, index) => new Date(newest.getTime() - index * ECMWF_CYCLE_INTERVAL_HOURS * 3_600_000),
  );
}

/** `YYYYMMDD` + `HH` halves of a cycle, the provider's own path vocabulary. */
function formatCycle(cycle: Date): { day: string; hour: string } {
  const iso = cycle.toISOString();
  return { day: iso.slice(0, 10).replace(/-/g, ''), hour: iso.slice(11, 13) };
}

/**
 * `{base}/{YYYYMMDD}/{HH}z/ifs/0p25/{stream}/{YYYYMMDDHH0000}-{step}h-{stream}-fc.{ext}`
 *
 * The layout the probe tool verified live (its artifact records these exact URLs answering
 * 200/206). `baseUrl` is a parameter because the runtime may target the S3 mirror
 * (`ECMWF_FAILOVER_BASE_URL`) with the identical path.
 */
export function buildEcmwfUrl(
  baseUrl: string,
  cycle: Date,
  stream: EcmwfStream,
  stepHours: number,
  extension: 'index' | 'grib2',
): string {
  const { day, hour } = formatCycle(cycle);
  const stamp = `${day}${hour}0000`;
  return (
    `${baseUrl}/${day}/${hour}z/${ECMWF_RESOLUTION_PATH}/${stream}/` +
    `${stamp}-${String(stepHours)}h-${stream}-fc.${extension}`
  );
}

/**
 * The `.index` vocabulary for one requested (cycle, stream, step) — what
 * `assertIndexRecordsMatchRequest` holds the answer against. Derived from the same `Date` the
 * URL is built from, so the ask and the check cannot drift apart (the probe's own rule).
 */
export function indexExpectation(
  cycle: Date,
  stream: EcmwfStream,
  stepHours: number,
): EcmwfIndexExpectation {
  const { day, hour } = formatCycle(cycle);
  return { date: day, time: `${hour}00`, step: String(stepHours), stream };
}

/** All forecast steps of a cycle at the given horizon: 0, 3, … `forecastHours`. */
export function cycleSteps(forecastHours: number): number[] {
  if (forecastHours <= 0 || forecastHours % ECMWF_STEP_HOURS !== 0) {
    throw new EcmwfContractError(
      `forecastHours ${String(forecastHours)} is not a positive multiple of the ` +
        `${String(ECMWF_STEP_HOURS)}-hour step — the env schema should have refused this.`,
    );
  }
  return Array.from(
    { length: forecastHours / ECMWF_STEP_HOURS + 1 },
    (_unused, index) => index * ECMWF_STEP_HOURS,
  );
}

/**
 * The order missing steps are ingested in (SPEC §9.2): FIRST the step whose valid time is
 * nearest to `now` — so the instant value stands up after a single step even on a fresh cycle —
 * then everything else ascending. A partial cycle is useful by construction.
 */
export function orderStepsForIngest(
  missingSteps: readonly number[],
  cycle: Date,
  now: Date,
): number[] {
  if (missingSteps.length === 0) return [];

  const nowOffsetHours = (now.getTime() - cycle.getTime()) / 3_600_000;
  let nearest = missingSteps[0];
  if (nearest === undefined) return [];
  for (const step of missingSteps) {
    if (Math.abs(step - nowOffsetHours) < Math.abs(nearest - nowOffsetHours)) {
      nearest = step;
    }
  }

  const rest = missingSteps.filter((step) => step !== nearest).sort((a, b) => a - b);
  return [nearest, ...rest];
}

/** Age of a cycle in seconds at `now` — the quantity the THIRD staleness ceiling caps (§9.4). */
export function cycleAgeSeconds(cycle: Date, now: Date): number {
  return Math.max(0, (now.getTime() - cycle.getTime()) / 1000);
}

/**
 * The third-staleness-ceiling verdict, as a pure function (SPEC §9.4).
 *
 * The other two ceilings cannot see this failure: a two-day-old cycle still produces a step
 * whose `validAtUtc` is ≈ now, and the read path's `fetchedAtUtc` is the COMPILE time, which is
 * always fresh. Only the cycle's own age exposes a stalled ingest, and a breach must suppress
 * publication rather than label it.
 */
export function isCycleWithinMaxAge(cycle: Date, now: Date, maxAgeSeconds: number): boolean {
  return cycleAgeSeconds(cycle, now) <= maxAgeSeconds;
}
