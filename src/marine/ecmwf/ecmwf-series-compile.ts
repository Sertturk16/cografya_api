import type {
  EcmwfStoredSeries,
  EcmwfStoredSupport,
} from '../entities/marine-ecmwf-point-series.entity';
import { MarineSource } from '../marine.types';
import { deriveWindDirection, deriveWindSpeed } from './ecmwf-wind';
import { assertParallel } from './ecmwf-series-merge';
import { ECMWF_STEP_HOURS } from './ecmwf.constants';
import { EcmwfContractError } from './ecmwf.errors';

/**
 * Stored raw samples → the published series shape (yeni-M3 SPEC §9.3, §11.2). Pure; the reader
 * service wraps it with the cache and the cycle-age ceiling.
 */

/** The compiled, publishable series of one point — `MarineSeriesDto` plus its cell metadata. */
export interface EcmwfCompiledSeries {
  readonly stepHours: number;
  readonly timesUtc: string[];
  /** Entirely null: ECMWF Open Data publishes no SST in any stream (measured §M4). M4 fills it. */
  readonly seaSurfaceTemperature: (number | null)[];
  readonly waveHeight: (number | null)[];
  readonly waveDirection: (number | null)[];
  readonly windSpeed10m: (number | null)[];
  readonly windDirection10m: (number | null)[];
  readonly source: MarineSource.Ecmwf;
  readonly modelRunAtUtc: string;
  readonly horizonEndUtc: string;
  /** Per-field §7.3 verdict, for M4's status mapping. */
  readonly support: EcmwfStoredSupport;
  /** The valid time nearest to `now` inside the series — the cache entry's `validAtMs`. */
  readonly validAtMs: number;
}

/** A half-open slice of an ascending, unique step array: `[startIndex, endIndexExclusive)`. */
export interface PublishedRun {
  readonly startIndex: number;
  readonly endIndexExclusive: number;
}

/**
 * The PUBLICATION-RUN POLICY, in one shared pure function (review #76 CR-2 + SFH-4/CR-6).
 *
 * SPEC §10 fixes WHAT may be published (only actually-ingested steps, uniform `stepHours`) but
 * is silent on WHICH contiguous run wins when a hole splits the stored steps. The chosen policy:
 * **the maximal contiguous run containing the step whose valid time is nearest to `now`.**
 *
 * Why the nearest-to-now anchor and not the first stored step: the ingest itself fetches
 * nearest-to-now FIRST (SPEC §9.2) precisely so the instant value stands up before the ascending
 * fill completes. Anchoring the run at `steps[0]` threw that priority away at read time — a
 * stored `[0, 9]` compiled to `[0]`, whose valid time is hours old, and M2's 3 h `validAt`
 * ceiling then suppressed the whole point while a valid-now sample sat in Postgres. Anchoring on
 * the step nearest to `now` publishes the slice the product actually cares about; steps outside
 * the run are withheld (logged by the caller, never silent) and re-attach as holes fill.
 *
 * Both consumers — the series compile below and `/layers`' `horizonEndUtc`
 * (`marine.service.ts`) — MUST derive from this same function, so the two published contract
 * fields cannot disagree about where the horizon ends.
 *
 * `steps` must be ascending and unique (the stored invariant). An empty array yields the empty
 * run `[0, 0)`.
 */
export function selectPublishedRun(
  steps: readonly number[],
  cycleUtc: Date,
  now: Date,
): PublishedRun {
  if (steps.length === 0) return { startIndex: 0, endIndexExclusive: 0 };

  const nowOffsetHours = (now.getTime() - cycleUtc.getTime()) / 3_600_000;
  let anchor = 0;
  for (let index = 1; index < steps.length; index += 1) {
    const candidate = steps[index];
    const best = steps[anchor];
    if (candidate === undefined || best === undefined) break;
    if (Math.abs(candidate - nowOffsetHours) < Math.abs(best - nowOffsetHours)) anchor = index;
  }

  let startIndex = anchor;
  while (startIndex > 0) {
    const previous = steps[startIndex - 1];
    const current = steps[startIndex];
    if (previous === undefined || current === undefined) break;
    if (current - previous !== ECMWF_STEP_HOURS) break;
    startIndex -= 1;
  }
  let endIndexExclusive = anchor + 1;
  while (endIndexExclusive < steps.length) {
    const previous = steps[endIndexExclusive - 1];
    const current = steps[endIndexExclusive];
    if (previous === undefined || current === undefined) break;
    if (current - previous !== ECMWF_STEP_HOURS) break;
    endIndexExclusive += 1;
  }
  return { startIndex, endIndexExclusive };
}

/** One retained cycle offered to {@link selectPublishableCycle}, newest first. */
export interface PublishableCycleCandidate {
  readonly cycleUtc: Date;
  /** Ascending, unique ingested steps — a cycle's `stepsDone` or a point row's `values.steps`. */
  readonly steps: readonly number[];
}

/**
 * The CYCLE-PRECEDENCE POLICY, in one shared pure function (review #76 CR-1).
 *
 * SPEC §10 is silent on which retained cycle serves a read while a newer cycle is still
 * filling. "Newest cycle with a row wins" collapsed the published horizon from +120 h to the
 * newer cycle's first handful of steps for up to an hour, four times a day, while a COMPLETE
 * cycle sat retained and unused. The chosen policy: **the cycle whose published run
 * ({@link selectPublishedRun}) is LONGEST wins; on a tie, the newest.** A filling cycle
 * therefore takes over exactly when it holds at least as much publishable data as the incumbent
 * — never earlier — and a cold start still publishes a one-step cycle immediately, because it
 * has no competition.
 *
 * `candidates` must be sorted newest-first (the store's `DESC` reads) and must already be
 * filtered by the cycle-age ceiling — age policy stays with the caller, where the loud
 * suppression event lives. Returns the index of the winner, or `null` for an empty list.
 */
export function selectPublishableCycle(
  candidates: readonly PublishableCycleCandidate[],
  now: Date,
): number | null {
  let winner: number | null = null;
  let winnerRunLength = 0;
  for (const [index, candidate] of candidates.entries()) {
    const run = selectPublishedRun(candidate.steps, candidate.cycleUtc, now);
    const runLength = run.endIndexExclusive - run.startIndex;
    // Strictly greater: on a tie the earlier (newer) candidate keeps the win.
    if (runLength > winnerRunLength) {
      winner = index;
      winnerRunLength = runLength;
    }
  }
  return winner;
}

/**
 * Compile the published run of a stored series into the published shape.
 *
 * ## Why only one contiguous run
 * The frozen contract says `stepHours: 3` — a single uniform spacing. Ingest priority can leave
 * a hole (nearest-to-now landed, a budget stop interrupted the ascending fill), and publishing
 * `timesUtc` across a hole would make the declared spacing a lie at exactly one index. WHICH run
 * is published is the {@link selectPublishedRun} policy; `horizonEndUtc` says exactly what is
 * held. Withheld steps are logged by the caller (the reader), never silent.
 *
 * ## Derivations happen HERE, at read time
 * Wind speed/bearing come from the stored raw `u10`/`v10` through the regression-tested pair in
 * `ecmwf-wind.ts` — the stored record stays the provider's own numbers (SPEC §9.1).
 */
export function compileEcmwfSeries(input: {
  stored: EcmwfStoredSeries;
  support: EcmwfStoredSupport;
  cycleUtc: Date;
  now: Date;
}): { series: EcmwfCompiledSeries; withheldSteps: number } {
  const { stored, support, cycleUtc, now } = input;
  assertParallel(stored);
  if (stored.steps.length === 0) {
    throw new EcmwfContractError('cannot compile a series from zero ingested steps.');
  }

  const run = selectPublishedRun(stored.steps, cycleUtc, now);
  const steps = stored.steps.slice(run.startIndex, run.endIndexExclusive);
  const withheldSteps = stored.steps.length - steps.length;

  const u10 = stored.u10.slice(run.startIndex, run.endIndexExclusive);
  const v10 = stored.v10.slice(run.startIndex, run.endIndexExclusive);
  const swh = stored.swh.slice(run.startIndex, run.endIndexExclusive);
  const mwd = stored.mwd.slice(run.startIndex, run.endIndexExclusive);

  const timesMs = steps.map((step) => cycleUtc.getTime() + step * 3_600_000);
  const timesUtc = timesMs.map((ms) => new Date(ms).toISOString());
  const lastTimeMs = timesMs[timesMs.length - 1];
  if (lastTimeMs === undefined) {
    throw new EcmwfContractError(
      'compiled series lost its last step — unreachable by construction.',
    );
  }

  // The instant-value anchor: the step nearest to `now` among those actually held.
  let validAtMs = timesMs[0] ?? lastTimeMs;
  for (const ms of timesMs) {
    if (Math.abs(ms - now.getTime()) < Math.abs(validAtMs - now.getTime())) validAtMs = ms;
  }

  return {
    withheldSteps,
    series: {
      stepHours: ECMWF_STEP_HOURS,
      timesUtc,
      seaSurfaceTemperature: steps.map(() => null),
      waveHeight: swh,
      waveDirection: mwd,
      windSpeed10m: steps.map((_step, index) =>
        deriveWindSpeed(u10[index] ?? null, v10[index] ?? null),
      ),
      windDirection10m: steps.map((_step, index) =>
        deriveWindDirection(u10[index] ?? null, v10[index] ?? null),
      ),
      source: MarineSource.Ecmwf,
      modelRunAtUtc: cycleUtc.toISOString(),
      horizonEndUtc: new Date(lastTimeMs).toISOString(),
      support,
      validAtMs,
    },
  };
}
