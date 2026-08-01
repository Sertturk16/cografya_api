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

/**
 * Compile the CONTIGUOUS leading run of a stored series into the published shape.
 *
 * ## Why only the contiguous prefix
 * The frozen contract says `stepHours: 3` — a single uniform spacing. Ingest priority can leave
 * a hole (nearest-to-now landed, a budget stop interrupted the ascending fill), and publishing
 * `timesUtc` across a hole would make the declared spacing a lie at exactly one index. The
 * series therefore ends at the last step before the first hole; the instant value may briefly
 * live AHEAD of the chart's end, which is honest — `horizonEndUtc` says exactly what is held.
 * A dropped tail is logged by the caller (the reader), never silent.
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
}): { series: EcmwfCompiledSeries; droppedStepsAfterHole: number } {
  const { stored, support, cycleUtc, now } = input;
  assertParallel(stored);
  if (stored.steps.length === 0) {
    throw new EcmwfContractError('cannot compile a series from zero ingested steps.');
  }

  // The contiguous run from the FIRST ingested step: each next step must be exactly one grid
  // step later. (In practice the first is 0 and the run is the whole array.)
  let runLength = 1;
  while (runLength < stored.steps.length) {
    const previous = stored.steps[runLength - 1];
    const current = stored.steps[runLength];
    if (previous === undefined || current === undefined) break;
    if (current - previous !== ECMWF_STEP_HOURS) break;
    runLength += 1;
  }
  const droppedStepsAfterHole = stored.steps.length - runLength;

  const steps = stored.steps.slice(0, runLength);
  const u10 = stored.u10.slice(0, runLength);
  const v10 = stored.v10.slice(0, runLength);
  const swh = stored.swh.slice(0, runLength);
  const mwd = stored.mwd.slice(0, runLength);

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
    droppedStepsAfterHole,
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
