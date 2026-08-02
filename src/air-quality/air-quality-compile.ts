import {
  AirQualityAveragingPeriod,
  AirQualityCategory,
  AirQualityFreshness,
  AirQualityIndexSystem,
  AirQualityPollutant,
  AirQualitySource,
  AirQualityStatus,
  AirQualityUnit,
  ALL_AIR_QUALITY_POLLUTANTS,
} from './air-quality.types';
import type { AirQualityIndexDto } from './dto/air-quality-index.dto';
import type { AirQualityPollutantValueDto } from './dto/air-quality-pollutant-value.dto';
import type { AirQualitySeriesDto } from './dto/air-quality-series.dto';
import { computeEaqi } from './eaqi/eaqi';
import type {
  AirQualityStoredConcentrations,
  AirQualityStoredSupport,
} from './entities/air-quality-run.entity';

/**
 * The A2b read path's PURE half: stored run → publishable series → the EAQI value for one step.
 *
 * No I/O, no clock of its own, no database, no cache, no HTTP. Everything below is a function of
 * its arguments, which is what lets the reader wrap it with the cache and the run-age ceiling and
 * still promise "a request never reaches ADS".
 *
 * ## The layering that must not be collapsed (SPEC §0 + A2b plan §3)
 * What the cache holds is the compiled RAW run ({@link CompiledRun}) — merged arrays and their
 * time axis. The EAQI index and "the step nearest to now" are computed AFTER the cache, per
 * request ({@link buildIndexDto}). Caching the selected step instead would freeze it for the
 * whole `ok` TTL (3600 s) while the `validAt` ceiling (5400 s) stayed blind to it — silent
 * staleness of exactly the kind the ceilings exist to prevent.
 *
 * ## The product boundary is a table invariant, and stays one here
 * The store keeps the ANALYSIS product (D−1) and the FORECAST product (D…D+N) in separate
 * columns on purpose (SAPMA 8 / DEC 2026-08-02b): "a forecast hour labelled as analysis" must
 * not be a one-line coding mistake. This module is the only place they ever meet, it concatenates
 * them in exactly one direction (analysis first, forecast second), and it publishes the seam as
 * `analysisEndUtc` so a consumer can always tell which half a step came from. BOTH halves are
 * model output; neither is an observation.
 *
 * ## `forecastHours` is a SPAN, `analysisHours` is a STEP COUNT (rider M9, review #80)
 * The step count is derived from the ARRAYS THEMSELVES; the two run columns are read only to
 * VALIDATE that derivation (`forecastSteps === forecastHours + 1`, `analysisSteps ===
 * analysisHours`). `forecastHours` is never used as a length anywhere in this file — a mismatch
 * makes the row unreadable and it is skipped loudly, rather than publishing a series that is one
 * step short at an index nobody looks at.
 */

/** Hours between published steps. CAMS is hourly and A2b publishes every stored hour. */
export const AIR_QUALITY_STEP_HOURS = 1;

const MS_PER_HOUR = 3_600_000;

/**
 * The model grid resolution published on every value (`gridResolutionDegrees`).
 *
 * A CONSTANT and not a stored column, by Atlas ruling (A2b plan Q4): a `grid_step_degrees` column
 * would mean a migration plus an ingest change, i.e. leaving A2b's "read path only" boundary. The
 * decoder deliberately hardcodes 0.1 NOWHERE (`cams/cams-grid.ts` derives the signed step from
 * the file's own axis), so this constant would otherwise be an unaudited second source of one
 * fact. The spec beside this file closes that gap by asserting it against the MEASURED axis steps
 * in the committed probe artifact.
 */
export const CAMS_GRID_RESOLUTION_DEGREES = 0.1;

/** The run-level facts a compile needs. A structural subset of `AirQualityRun`. */
export interface CompilableRun {
  readonly runUtc: Date;
  /** A SPAN. Validation input only — never a length. */
  readonly forecastHours: number;
  /** A STEP COUNT. Validation input only — never a length. */
  readonly analysisHours: number;
  readonly datasetId: string;
}

/** One stored province row plus the plate code it is published under. */
export interface CompilableRow {
  readonly plateCode: string;
  readonly gridLatitude: number;
  readonly gridLongitude: number;
  readonly distanceKm: number;
  readonly concentrations: AirQualityStoredConcentrations;
  readonly support: AirQualityStoredSupport;
  readonly analysisConcentrations: AirQualityStoredConcentrations | null;
  readonly analysisSupport: AirQualityStoredSupport | null;
  readonly ingestedAt: Date;
}

/** One province's merged, normalised series — the cacheable unit. */
export interface CompiledProvinceSeries {
  readonly plateCode: string;
  readonly gridLatitude: number;
  readonly gridLongitude: number;
  readonly distanceKm: number;
  readonly ingestedAtUtc: string;
  /** analysis ⧺ forecast per pollutant, exactly `timesUtc.length` entries each. */
  readonly concentrations: Record<AirQualityPollutant, (number | null)[]>;
  /** The MERGED structural verdict — see {@link mergeSupport}. */
  readonly support: Record<AirQualityPollutant, 'ok' | 'not_supported'>;
}

/**
 * The whole compiled run — the value that goes INTO the cache.
 *
 * Every member is a JSON primitive so the Redis round trip is lossless (`Date` would come back a
 * string and silently change type). Province IDENTITY (slug, name, coordinates) is deliberately
 * absent: it is joined from Postgres per request, so a seed correction can never live on as a
 * stale slug inside a cached payload.
 */
export interface CompiledRun {
  readonly runUtc: string;
  readonly datasetId: string;
  /**
   * The instant the ANALYSIS half ends and the FORECAST half begins — always the run base time,
   * or `null` when this run carries no analysis product at all.
   */
  readonly analysisEndUtc: string | null;
  readonly stepHours: number;
  readonly timesUtc: string[];
  readonly horizonEndUtc: string;
  readonly provinces: CompiledProvinceSeries[];
}

/** A row the shape guard refused, with the reason — the caller logs and counts it. */
export interface SkippedRow {
  readonly plateCode: string;
  readonly reason: string;
}

export type CompileRunOutcome =
  | {
      readonly kind: 'ok';
      readonly run: CompiledRun;
      readonly skipped: readonly SkippedRow[];
      /** How many stored values the R2 normalisation had to null out. Alarm material. */
      readonly normalisedValues: number;
    }
  | {
      readonly kind: 'schema_error';
      readonly reason: string;
      readonly skipped: readonly SkippedRow[];
    };

/**
 * The R2 normalisation — the mandatory second defence in front of `computeEaqi`.
 *
 * `subIndexBand` THROWS `RangeError` on a negative or non-finite concentration, by design: a
 * `_FillValue` of −999 banded as `good` is this leg's #1 silent-failure class. But `concentrations`
 * is a schemaless jsonb column, so "the decoder already null-classified it" is a claim about a
 * PAST write, not a property of the bytes being read. If a −999 ever reaches here, that throw
 * escapes the never-throw refresh closure and 500s a public page — a cold-path outage caused by a
 * guard meant to protect us.
 *
 * So every value passes through here first: `null`, non-finite and negative all become `null`,
 * i.e. exactly the "missing" the EAQI contract expects, and the caller COUNTS the substitutions so
 * the condition is never silent. Applied both at compile time (before the cache) and again when
 * building the EAQI input (after the cache), because a cache entry written by an earlier
 * deployment is inside the retention window and is not covered by today's compile.
 */
export function normaliseConcentration(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/** `true` when `value` is one of the two stored support verdicts. */
function isSupportVerdict(value: unknown): value is 'ok' | 'not_supported' {
  return value === 'ok' || value === 'not_supported';
}

/**
 * The measured length of a stored concentration block, or a refusal reason.
 *
 * Written against a WIDENED view on purpose: the entity type CLAIMS these are five parallel
 * number arrays, and that claim is exactly what a schemaless jsonb column cannot guarantee.
 */
function measureBlock(block: unknown, label: string): { length: number } | { reason: string } {
  if (typeof block !== 'object' || block === null) {
    return { reason: `\`${label}\` is not an object` };
  }
  const members = block as Record<string, unknown>;
  let length: number | null = null;
  for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) {
    const values = members[pollutant];
    if (!Array.isArray(values)) return { reason: `\`${label}.${pollutant}\` is not an array` };
    if (length === null) {
      length = values.length;
    } else if (values.length !== length) {
      return {
        reason:
          `\`${label}\` is ragged: ${pollutant} holds ${String(values.length)} entries while an ` +
          `earlier pollutant holds ${String(length)}`,
      };
    }
  }
  return length === null ? { reason: `\`${label}\` carries no pollutant` } : { length };
}

/** All five support verdicts present and legal, or a refusal reason. */
function checkSupport(support: unknown, label: string): string | null {
  if (typeof support !== 'object' || support === null) return `\`${label}\` is not an object`;
  const members = support as Record<string, unknown>;
  for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) {
    if (!isSupportVerdict(members[pollutant])) {
      return `\`${label}.${pollutant}\` is not a support verdict`;
    }
  }
  return null;
}

/**
 * Why a stored row cannot be read — or `null` when it holds the written shape.
 *
 * The marine `describeUnreadableCandidate` pattern (`ecmwf-series.reader.ts`), widened to this
 * leg's schema and carrying the M9 length validation. EVERY member the compile below dereferences
 * is covered: a member that passes this guard and then dies as a `TypeError` would be
 * indistinguishable from a bug and would escape the never-throw closure as a 500.
 */
export function describeUnreadableRow(row: CompilableRow, run: CompilableRun): string | null {
  const widened: {
    gridLatitude?: unknown;
    gridLongitude?: unknown;
    distanceKm?: unknown;
    ingestedAt?: unknown;
    analysisConcentrations?: unknown;
    analysisSupport?: unknown;
  } = row;

  // An empty plate code means the store's projected join did not hydrate the province relation.
  // Refusing it here routes the failure through the loud skip path rather than letting the row
  // compile into a payload no province can ever match — a silently all-unavailable hub.
  if (typeof row.plateCode !== 'string' || row.plateCode.length === 0) {
    return 'the row carries no plate code — the province join did not resolve';
  }

  for (const [name, value] of [
    ['gridLatitude', widened.gridLatitude],
    ['gridLongitude', widened.gridLongitude],
    ['distanceKm', widened.distanceKm],
  ] as const) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `\`${name}\` is not a finite number`;
    }
  }
  if (!(widened.ingestedAt instanceof Date) || Number.isNaN(widened.ingestedAt.getTime())) {
    return '`ingestedAt` is not a valid Date';
  }

  const forecast = measureBlock(row.concentrations, 'concentrations');
  if ('reason' in forecast) return forecast.reason;
  if (forecast.length < 1) return '`concentrations` holds zero steps';
  // M9: the SPAN column must agree with the measured step count. The columns are validation
  // input, never the length itself.
  if (forecast.length !== run.forecastHours + 1) {
    return (
      `forecast step count ${String(forecast.length)} contradicts the run's forecastHours ` +
      `span ${String(run.forecastHours)} (expected ${String(run.forecastHours + 1)} steps)`
    );
  }
  const forecastSupport = checkSupport(row.support, 'support');
  if (forecastSupport !== null) return forecastSupport;

  const analysisPresent = widened.analysisConcentrations !== null;
  if (!analysisPresent) {
    // A run that claims an analysis product while THIS row carries none is inconsistent: the
    // analysis write updates the 81 rows and the run column in one transaction.
    if (run.analysisHours !== 0) {
      return (
        `the run claims ${String(run.analysisHours)} analysis step(s) but this row holds no ` +
        'analysis product'
      );
    }
    if (widened.analysisSupport !== null) {
      return '`analysisSupport` is present while `analysisConcentrations` is null';
    }
    return null;
  }

  const analysis = measureBlock(widened.analysisConcentrations, 'analysisConcentrations');
  if ('reason' in analysis) return analysis.reason;
  // M9's other half: `analysisHours` is a STEP COUNT, so it is compared directly.
  if (analysis.length !== run.analysisHours) {
    return (
      `analysis step count ${String(analysis.length)} contradicts the run's analysisHours ` +
      `${String(run.analysisHours)}`
    );
  }
  const analysisSupport = checkSupport(widened.analysisSupport, 'analysisSupport');
  if (analysisSupport !== null) return analysisSupport;
  return null;
}

/**
 * The MERGED structural verdict for one pollutant.
 *
 * `not_supported` means "the model carried no value for this pollutant across the entire run"
 * (SPEC §7.4). A run with two products therefore only earns it when BOTH halves say so: if the
 * analysis half carried the pollutant, the model demonstrably carries it, and calling the merged
 * series structurally unsupported would overstate the refusal. A pollutant that is genuinely
 * absent from just one half still degrades honestly — its values there are `null`, so the
 * per-step status becomes `no_data`, which is what a per-step gap means.
 */
function mergeSupport(
  forecast: 'ok' | 'not_supported',
  analysis: 'ok' | 'not_supported' | null,
): 'ok' | 'not_supported' {
  if (forecast === 'ok') return 'ok';
  return analysis === 'ok' ? 'ok' : 'not_supported';
}

/**
 * Compile one stored run into its cacheable, publishable form.
 *
 * Never throws. A row that does not hold the written shape is SKIPPED (the caller counts and logs
 * it) so one corrupt province cannot darken the other eighty; only when NO readable row is left
 * does the outcome degrade to `schema_error`. `CamsContractError` is deliberately not used here:
 * a bad row in OUR store is not a record of the PROVIDER's contract, and raising the ingest's
 * contract signal from a read would send the diagnosis to the wrong file (A2b plan D-A2b-3).
 */
export function compileRun(input: {
  run: CompilableRun;
  rows: readonly CompilableRow[];
}): CompileRunOutcome {
  const { run, rows } = input;
  const skipped: SkippedRow[] = [];
  const readable: CompilableRow[] = [];
  for (const row of rows) {
    const refusal = describeUnreadableRow(row, run);
    if (refusal === null) readable.push(row);
    else skipped.push({ plateCode: row.plateCode, reason: refusal });
  }

  const first = readable[0];
  if (first === undefined) {
    return {
      kind: 'schema_error',
      reason:
        rows.length === 0
          ? `run ${run.runUtc.toISOString()} holds no province series rows`
          : `every stored series row of run ${run.runUtc.toISOString()} is unreadable`,
      skipped,
    };
  }

  // Lengths are derived from the arrays, and the guard above already proved every readable row
  // agrees with the run columns — so all readable rows share these two counts.
  const analysisSteps = first.analysisConcentrations === null ? 0 : run.analysisHours;
  const forecastSteps = run.forecastHours + 1;
  const totalSteps = analysisSteps + forecastSteps;

  const seriesStartMs = run.runUtc.getTime() - analysisSteps * MS_PER_HOUR;
  const timesMs = Array.from(
    { length: totalSteps },
    (_unused, index) => seriesStartMs + index * MS_PER_HOUR,
  );
  const timesUtc = timesMs.map((ms) => new Date(ms).toISOString());
  const horizonEndUtc = timesUtc[timesUtc.length - 1];
  if (horizonEndUtc === undefined) {
    // Unreachable: `forecastSteps >= 1` is enforced by the shape guard.
    return { kind: 'schema_error', reason: 'compiled series lost its last step', skipped };
  }

  let normalisedValues = 0;
  const provinces: CompiledProvinceSeries[] = readable.map((row) => {
    const concentrations = {} as Record<AirQualityPollutant, (number | null)[]>;
    const support = {} as Record<AirQualityPollutant, 'ok' | 'not_supported'>;
    for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) {
      const analysisHalf = row.analysisConcentrations?.[pollutant] ?? [];
      const forecastHalf = row.concentrations[pollutant];
      // Typed with `undefined` deliberately: jsonb can hand back a sparse or short array, and the
      // whole point of this loop is to survive shapes the entity type only CLAIMS are impossible.
      const stored: (number | null | undefined)[] = [...analysisHalf, ...forecastHalf];
      const merged: (number | null)[] = [];
      for (const raw of stored) {
        const normalised = normaliseConcentration(raw);
        // A stored value that WAS a number and came out null is the R2 condition: counted, so a
        // −999 leaking past the decoder can never be silent.
        if (normalised === null && typeof raw === 'number') normalisedValues += 1;
        merged.push(normalised);
      }
      concentrations[pollutant] = merged;
      support[pollutant] = mergeSupport(
        row.support[pollutant],
        row.analysisSupport?.[pollutant] ?? null,
      );
    }
    return {
      plateCode: row.plateCode,
      gridLatitude: row.gridLatitude,
      gridLongitude: row.gridLongitude,
      distanceKm: row.distanceKm,
      ingestedAtUtc: row.ingestedAt.toISOString(),
      concentrations,
      support,
    };
  });

  return {
    kind: 'ok',
    skipped,
    normalisedValues,
    run: {
      runUtc: run.runUtc.toISOString(),
      datasetId: run.datasetId,
      // The seam is the run base time exactly, or nothing at all — never a fabricated instant.
      analysisEndUtc: analysisSteps > 0 ? run.runUtc.toISOString() : null,
      stepHours: AIR_QUALITY_STEP_HOURS,
      timesUtc,
      horizonEndUtc,
      provinces,
    },
  };
}

/**
 * Index of the step nearest to `nowMs` — no interpolation on the time axis (SPEC §7.4). With
 * hourly steps the published instant is at most ±30 minutes from `now`.
 *
 * When `now` falls outside the series the nearest END step wins. That is not a licence to publish
 * a four-day-old run: the run-age ceiling has already refused those before this is reached.
 * Returns `null` only for an empty axis, which the shape guard makes unreachable.
 */
export function selectStepIndex(timesUtc: readonly string[], nowMs: number): number | null {
  if (timesUtc.length === 0) return null;
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [index, iso] of timesUtc.entries()) {
    const distance = Math.abs(new Date(iso).getTime() - nowMs);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

/** The EAQI input for one step: `not_supported` pollutants are missing by construction. */
function eaqiInputAt(
  province: CompiledProvinceSeries,
  stepIndex: number,
): Record<AirQualityPollutant, number | null> {
  const values = {} as Record<AirQualityPollutant, number | null>;
  for (const pollutant of ALL_AIR_QUALITY_POLLUTANTS) {
    if (province.support[pollutant] === 'not_supported') {
      values[pollutant] = null;
      continue;
    }
    // Normalised AGAIN on purpose — see `normaliseConcentration`: a cache entry written by an
    // earlier deployment never passed through today's compile, and `subIndexBand` throws.
    values[pollutant] = normaliseConcentration(province.concentrations[pollutant][stepIndex]);
  }
  return values;
}

/** Cache-derived provenance the index carries. All optional — the cold path has none. */
export interface IndexProvenance {
  readonly freshness: AirQualityFreshness | null;
  readonly fetchedAtUtc: string | null;
  readonly staleSinceUtc: string | null;
}

/**
 * The published EAQI value for one province at one step — computed per request, after the cache.
 *
 * `computeEaqi` and `EAQI_BANDS_EEA_2024` are CALLED, never re-implemented (A2b acceptance
 * criterion 8): the band table, the `(lo, hi]` rule and the dominant-pollutant tie-break order
 * have exactly one home, `eaqi/`.
 *
 * Status mapping is SPEC §7.4 verbatim: a structurally unsupported pollutant is `not_supported`,
 * a per-step gap is `no_data`, both land in `missingPollutants`, and only ALL FIVE missing
 * collapses the overall status to `no_data` with null band/category/dominant — a partial index is
 * still published, because honesty here means SAYING what is missing, not hiding what is known.
 */
export function buildIndexDto(input: {
  compiled: CompiledRun;
  province: CompiledProvinceSeries;
  stepIndex: number;
  provenance: IndexProvenance;
}): AirQualityIndexDto {
  const { compiled, province, stepIndex, provenance } = input;
  const values = eaqiInputAt(province, stepIndex);
  const eaqi = computeEaqi(values);

  const pollutants: AirQualityPollutantValueDto[] = ALL_AIR_QUALITY_POLLUTANTS.map((pollutant) => {
    const value = values[pollutant];
    const sub = eaqi.subIndexes[pollutant];
    return {
      pollutant,
      value,
      unit: AirQualityUnit.MicrogramPerCubicMeter,
      averagingPeriod: AirQualityAveragingPeriod.Hourly,
      subIndexBand: sub === null ? null : sub.band,
      subIndexCategory: sub === null ? null : sub.category,
      status:
        province.support[pollutant] === 'not_supported'
          ? AirQualityStatus.NotSupported
          : value === null
            ? AirQualityStatus.NoData
            : AirQualityStatus.Ok,
    };
  });

  const status = eaqi.band === null ? AirQualityStatus.NoData : AirQualityStatus.Ok;
  return {
    band: eaqi.band,
    category: eaqi.category,
    dominantPollutant: eaqi.dominantPollutant,
    indexSystem: AirQualityIndexSystem.EaqiEea2024,
    status,
    // The DTO's own invariant: freshness describes a SERVED value, so it is null whenever there
    // is not one.
    freshness: status === AirQualityStatus.Ok ? provenance.freshness : null,
    pollutants,
    missingPollutants: eaqi.missingPollutants,
    validAtUtc: compiled.timesUtc[stepIndex] ?? null,
    modelRunAtUtc: compiled.runUtc,
    ingestedAtUtc: province.ingestedAtUtc,
    fetchedAtUtc: provenance.fetchedAtUtc,
    staleSinceUtc: provenance.staleSinceUtc,
    source: AirQualitySource.CamsEuropeAq,
    datasetId: compiled.datasetId,
    gridLatitude: province.gridLatitude,
    gridLongitude: province.gridLongitude,
    distanceKm: province.distanceKm,
    gridResolutionDegrees: CAMS_GRID_RESOLUTION_DEGREES,
  };
}

/**
 * The value published when there is nothing to publish (SPEC §10 COLD-BEHAVIOR).
 *
 * Every provenance field is null and `pollutants` is empty rather than five `no_data` rows: a
 * pollutant row asserts "we looked at this cell", and on the cold path we looked at nothing.
 * `missingPollutants` still lists all five — the question "what is missing?" has a complete and
 * honest answer even here.
 */
export function unavailableIndexDto(): AirQualityIndexDto {
  return {
    band: null,
    category: null,
    dominantPollutant: null,
    indexSystem: AirQualityIndexSystem.EaqiEea2024,
    status: AirQualityStatus.Unavailable,
    freshness: null,
    pollutants: [],
    missingPollutants: [...ALL_AIR_QUALITY_POLLUTANTS],
    validAtUtc: null,
    modelRunAtUtc: null,
    ingestedAtUtc: null,
    fetchedAtUtc: null,
    staleSinceUtc: null,
    source: AirQualitySource.CamsEuropeAq,
    datasetId: null,
    gridLatitude: null,
    gridLongitude: null,
    distanceKm: null,
    gridResolutionDegrees: CAMS_GRID_RESOLUTION_DEGREES,
  };
}

/**
 * The full hourly series for one province — the detail endpoint's `series`.
 *
 * Per-step EAQI is computed for every step here (and only here): the hub needs one step per
 * province, the detail needs every step for ONE province, so nothing pays for the other's work.
 *
 * INVARIANT, asserted by unit and e2e tests: every array in the returned object has exactly
 * `timesUtc.length` entries, consecutive `timesUtc` are exactly one hour apart, and the steps
 * before `analysisEndUtc` come from the analysis product while the rest come from the forecast.
 */
export function buildSeriesDto(
  compiled: CompiledRun,
  province: CompiledProvinceSeries,
): AirQualitySeriesDto {
  const bands: (number | null)[] = [];
  const categories: (AirQualityCategory | null)[] = [];
  const dominantPollutants: (AirQualityPollutant | null)[] = [];
  for (let index = 0; index < compiled.timesUtc.length; index += 1) {
    const eaqi = computeEaqi(eaqiInputAt(province, index));
    bands.push(eaqi.band);
    categories.push(eaqi.category);
    dominantPollutants.push(eaqi.dominantPollutant);
  }

  return {
    timesUtc: [...compiled.timesUtc],
    stepHours: compiled.stepHours,
    horizonEndUtc: compiled.horizonEndUtc,
    analysisEndUtc: compiled.analysisEndUtc,
    bands,
    categories,
    dominantPollutants,
    concentrations: {
      pm2_5: [...province.concentrations[AirQualityPollutant.Pm2_5]],
      pm10: [...province.concentrations[AirQualityPollutant.Pm10]],
      no2: [...province.concentrations[AirQualityPollutant.No2]],
      o3: [...province.concentrations[AirQualityPollutant.O3]],
      so2: [...province.concentrations[AirQualityPollutant.So2]],
    },
  };
}
