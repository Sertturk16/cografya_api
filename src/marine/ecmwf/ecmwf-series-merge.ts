import type {
  EcmwfStoredSeries,
  EcmwfStoredSupport,
} from '../entities/marine-ecmwf-point-series.entity';
import { classifyFieldSeries, normaliseSample } from './ecmwf-support';
import { EcmwfContractError } from './ecmwf.errors';

/**
 * Pure merge/bookkeeping arithmetic of the ingest store — no I/O, unit-tested directly.
 *
 * Steps arrive OUT OF ORDER by design (nearest-to-now first, then ascending; SPEC §9.2), so the
 * stored parallel arrays are maintained sorted-by-step at merge time rather than trusted to
 * arrive sorted. The invariant every function here preserves is the one the read path publishes:
 * `steps` is ascending and unique, and every field array is exactly `steps.length` long.
 */

/** One step's raw samples for one point — what a decoded range reduces to. */
export interface EcmwfStepSample {
  readonly u10: number | null;
  readonly v10: number | null;
  readonly swh: number | null;
  readonly mwd: number | null;
}

/**
 * Merge one step into a stored series (or start one from scratch with `existing = null`).
 *
 * Re-ingesting an already-present step REPLACES that step's samples rather than duplicating the
 * step or refusing: the only way a step arrives twice is a re-run over a re-published cycle,
 * and the later download is the more current claim about the same (cycle, step) — refusing
 * would freeze whichever transient answer came first.
 */
export function mergeStepIntoSeries(
  existing: EcmwfStoredSeries | null,
  stepHour: number,
  sample: EcmwfStepSample,
): EcmwfStoredSeries {
  const base: EcmwfStoredSeries = existing ?? { steps: [], u10: [], v10: [], swh: [], mwd: [] };
  assertParallel(base);

  if (!Number.isInteger(stepHour) || stepHour < 0) {
    throw new EcmwfContractError(`step hour ${String(stepHour)} is not a non-negative integer.`);
  }

  const merged = base.steps
    .map((step, index) => ({
      step,
      u10: base.u10[index] ?? null,
      v10: base.v10[index] ?? null,
      swh: base.swh[index] ?? null,
      mwd: base.mwd[index] ?? null,
    }))
    .filter((entry) => entry.step !== stepHour);

  merged.push({
    step: stepHour,
    u10: normaliseSample(sample.u10),
    v10: normaliseSample(sample.v10),
    swh: normaliseSample(sample.swh),
    mwd: normaliseSample(sample.mwd),
  });
  merged.sort((a, b) => a.step - b.step);

  return {
    steps: merged.map((entry) => entry.step),
    u10: merged.map((entry) => entry.u10),
    v10: merged.map((entry) => entry.v10),
    swh: merged.map((entry) => entry.swh),
    mwd: merged.map((entry) => entry.mwd),
  };
}

/**
 * The per-field §7.3 verdict over a (possibly partial) stored series.
 *
 * Recomputed on EVERY merge, from the cycle's own evidence — never carried over from the probe
 * artifact or an earlier cycle, because the mask can move between cycles (the measured Muğla
 * `pp1d` class). With one step ingested the verdict is provisional by nature; it converges as
 * the cycle fills, and the read path treats it as what it is: this cycle's observed truth.
 */
export function classifyStoredSeries(series: EcmwfStoredSeries): EcmwfStoredSupport {
  assertParallel(series);
  return {
    u10: classifyFieldSeries(series.u10).support,
    v10: classifyFieldSeries(series.v10).support,
    swh: classifyFieldSeries(series.swh).support,
    mwd: classifyFieldSeries(series.mwd).support,
  };
}

/** Does `stepsDone` cover every step of the horizon? The cycle-completion check. */
export function isCycleComplete(
  stepsDone: readonly number[],
  allSteps: readonly number[],
): boolean {
  const done = new Set(stepsDone);
  return allSteps.every((step) => done.has(step));
}

/** `stepsDone` plus one step — unique, ascending, order-independent of arrival. */
export function addStepDone(stepsDone: readonly number[], stepHour: number): number[] {
  return [...new Set([...stepsDone, stepHour])].sort((a, b) => a - b);
}

/**
 * The parallel-array invariant, asserted at every boundary a stored blob crosses.
 *
 * jsonb is schemaless: a row written by a future buggy version, or edited by hand, would
 * otherwise flow straight into index arithmetic where a short array reads as `undefined` and
 * publishes as a fabricated gap. Refusing loudly is the honest failure.
 */
export function assertParallel(series: EcmwfStoredSeries): void {
  const expected = series.steps.length;
  const lengths: Record<string, number> = {
    u10: series.u10.length,
    v10: series.v10.length,
    swh: series.swh.length,
    mwd: series.mwd.length,
  };
  for (const [field, length] of Object.entries(lengths)) {
    if (length !== expected) {
      throw new EcmwfContractError(
        `stored series is corrupt: "${field}" holds ${String(length)} samples for ` +
          `${String(expected)} steps.`,
      );
    }
  }
  for (let index = 1; index < series.steps.length; index += 1) {
    const previous = series.steps[index - 1];
    const current = series.steps[index];
    if (previous === undefined || current === undefined || previous >= current) {
      throw new EcmwfContractError('stored series is corrupt: steps are not strictly ascending.');
    }
  }
}
