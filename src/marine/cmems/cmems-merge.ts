import type { CachedRead } from '../../upstream/cache/upstream-cache.service';
import type { UpstreamOutcomeKind } from '../../upstream/upstream.types';
import type { EcmwfPointSeriesRead } from '../ecmwf/ecmwf-series.reader';
import { MarineFreshness, MarineSource, MarineStatus, MarineUnit } from '../marine.types';
import type { CmemsPointValue } from './cmems-response';

/**
 * The merge / resolution core (plan §5): frozen source matrix → per-field published values.
 *
 * Everything here is a PURE function over `CachedRead`s — no I/O, no clock reads (a `nowMs` is
 * always passed in), so the whole §5 rule set is table-testable offline. M4b's endpoints call
 * these; nothing calls them in M4a (zero runtime delta).
 *
 * The frozen source matrix (catalogue, measured):
 *  - **SST**: CMEMS primary, NO fallback — ECMWF Open Data carries no `sst` in any stream, so
 *    an "ECMWF fill" for SST is not a policy choice we rejected, it is a call that cannot be
 *    made. The absence of a fallback parameter in {@link resolveSst} makes that structural.
 *  - **Wave pair**: CMEMS primary, ECMWF fallback — resolved as a PAIR, never per half.
 *  - **Wind pair**: ECMWF only.
 */

/** The instant fields of a conditions/overview payload — `MarineValueDto`'s camelCase names. */
export type MarineInstantField =
  'seaSurfaceTemperature' | 'waveHeight' | 'waveDirection' | 'windSpeed10m' | 'windDirection10m';

/** Canonical unit per instant field — published even when the value is absent. */
export const MARINE_INSTANT_UNITS: Readonly<Record<MarineInstantField, MarineUnit>> = {
  seaSurfaceTemperature: MarineUnit.Celsius,
  waveHeight: MarineUnit.Meter,
  waveDirection: MarineUnit.DegreeTrue,
  windSpeed10m: MarineUnit.MeterPerSecond,
  windDirection10m: MarineUnit.DegreeTrue,
};

/**
 * One published instant value — `MarineValueDto`'s exact field set as a plain shape.
 *
 * An interface rather than the DTO class: the DTO is the CONTROLLER's serialisation concern
 * (M4b maps 1:1); the merge core stays importable by tests and the warmup with no Nest
 * decorators in sight.
 */
export interface MarineInstantValue {
  readonly value: number | null;
  readonly unit: MarineUnit;
  readonly status: MarineStatus;
  readonly freshness: MarineFreshness | null;
  readonly validAtUtc: string | null;
  readonly fetchedAtUtc: string | null;
  readonly modelRunAtUtc: string | null;
  readonly staleSinceUtc: string | null;
  readonly source: MarineSource | null;
  readonly datasetId: string | null;
  readonly gridLatitude: number | null;
  readonly gridLongitude: number | null;
  readonly distanceKm: number | null;
}

/**
 * Upstream outcome kind → published status (SPEC-ADDENDUM §7.7 mapping).
 *
 * Everything that is not "the provider answered with a value/absence" collapses to
 * `unavailable`: the finer distinction (429 vs breaker vs schema drift) is an OPERATIONS
 * concern that lives in logs and metrics, not something a student's widget can act on.
 */
export function marineStatusFromKind(kind: UpstreamOutcomeKind): MarineStatus {
  if (kind === 'ok') return MarineStatus.Ok;
  if (kind === 'no_data') return MarineStatus.NoData;
  return MarineStatus.Unavailable;
}

function freshnessOf(read: CachedRead<unknown>): MarineFreshness | null {
  if (read.freshness === 'fresh') return MarineFreshness.Fresh;
  if (read.freshness === 'stale') return MarineFreshness.Stale;
  return null;
}

/** An absent value carrying an honest status — the shared "nothing to show" shape. */
function absentValue(
  field: MarineInstantField,
  status: MarineStatus,
  read: CachedRead<unknown> | null,
): MarineInstantValue {
  return {
    value: null,
    unit: MARINE_INSTANT_UNITS[field],
    status,
    // The §7.7 invariant: freshness is ALWAYS null when status !== ok.
    freshness: null,
    validAtUtc: null,
    fetchedAtUtc: read?.fetchedAtUtc ?? null,
    modelRunAtUtc: null,
    staleSinceUtc: null,
    // No value ⇒ no provenance claim. `source` names who produced THIS number; with no
    // number, naming a provider would be an implication, not a fact.
    source: null,
    datasetId: null,
    gridLatitude: null,
    gridLongitude: null,
    distanceKm: null,
  };
}

/**
 * A CMEMS cached read → one published instant value (`source: 'cmems'`).
 *
 * ## Exported for the table-driven unit tests ONLY — never call this for a wave half
 * (review #81 M3) Runtime consumers use {@link resolveSst} / {@link resolveWavePair} /
 * {@link resolveWindPair}, which are the ONLY functions encoding the pair-consistency rule.
 * Calling `cmemsInstant('waveHeight', …)` directly bypasses that rule and is exactly how one
 * model's direction gets drawn over another model's height (K6's arrow form). It stays
 * exported because the §5.4 edge-case tables test it in isolation; production code must not.
 */
export function cmemsInstant(
  field: MarineInstantField,
  read: CachedRead<CmemsPointValue>,
): MarineInstantValue {
  if (read.value === null || read.kind !== 'ok') {
    return absentValue(field, marineStatusFromKind(read.kind), read);
  }
  return {
    value: read.value.value,
    unit: read.value.unit,
    status: MarineStatus.Ok,
    freshness: freshnessOf(read),
    // The time WE sent — the reply carries no time field (SPEC v1 §3.1); the cache echoes it.
    validAtUtc: read.value.validAtUtc,
    fetchedAtUtc: read.fetchedAtUtc,
    // CMEMS publishes no model-run time per value — honest null, never fabricated.
    modelRunAtUtc: null,
    staleSinceUtc: read.staleSinceUtc,
    source: MarineSource.Cmems,
    datasetId: read.value.datasetId,
    gridLatitude: read.value.gridLatitude,
    gridLongitude: read.value.gridLongitude,
    distanceKm: read.value.distanceKm,
  };
}

/** The compiled-series sample arrays an ECMWF instant can be cut from. */
type EcmwfInstantField = Exclude<MarineInstantField, 'seaSurfaceTemperature'>;

/** Which stored support verdictS govern a published field (wind derives from a u/v PAIR). */
const ECMWF_SUPPORT_KEYS: Readonly<
  Record<EcmwfInstantField, readonly ('u10' | 'v10' | 'swh' | 'mwd')[]>
> = {
  waveHeight: ['swh'],
  waveDirection: ['mwd'],
  windSpeed10m: ['u10', 'v10'],
  windDirection10m: ['u10', 'v10'],
};

const ECMWF_SERIES_ARRAYS: Readonly<
  Record<EcmwfInstantField, 'waveHeight' | 'waveDirection' | 'windSpeed10m' | 'windDirection10m'>
> = {
  waveHeight: 'waveHeight',
  waveDirection: 'waveDirection',
  windSpeed10m: 'windSpeed10m',
  windDirection10m: 'windDirection10m',
};

/** Index of the step whose valid time is nearest to `now`, or `null` for an empty series. */
export function nearestStepIndex(timesUtc: readonly string[], nowMs: number): number | null {
  let winner: number | null = null;
  let winnerDelta = Number.POSITIVE_INFINITY;
  for (const [index, iso] of timesUtc.entries()) {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) continue;
    const delta = Math.abs(ms - nowMs);
    if (delta < winnerDelta) {
      winner = index;
      winnerDelta = delta;
    }
  }
  return winner;
}

/**
 * One instant value cut from the ECMWF compiled series at the step nearest to `now`
 * (§5.4): `validAtUtc` is that step's REAL time (±1.5 h ≤ the 3 h `validAt` ceiling),
 * `modelRunAtUtc` is the cycle, and freshness/staleness pass through the `CachedRead`.
 *
 * ## Exported for the unit tests ONLY — same bypass hazard as {@link cmemsInstant}
 * (review #81 M3) A runtime caller cutting a single wave half from here would sidestep the
 * pair-consistency rule in {@link resolveWavePair}. Production code goes through the three
 * `resolve*` functions, full stop.
 */
export function ecmwfInstantFromSeries(
  field: EcmwfInstantField,
  read: CachedRead<EcmwfPointSeriesRead>,
  nowMs: number,
): MarineInstantValue {
  if (read.value === null || read.kind !== 'ok') {
    return absentValue(field, marineStatusFromKind(read.kind), read);
  }
  const { series } = read.value;
  const index = nearestStepIndex(series.timesUtc, nowMs);
  if (index === null) {
    // A compiled series is never empty by construction (the compiler throws on zero steps);
    // an empty one here is a stored-shape surprise and is published as an honest absence.
    return absentValue(field, MarineStatus.Unavailable, read);
  }

  // `not_supported` wins over `no_data` (the F2 masked-parameter class): a PAIR-derived wind
  // field is not supported when EITHER component is.
  const supportKeys = ECMWF_SUPPORT_KEYS[field];
  const supported = supportKeys.every((key) => series.support[key] === 'ok');
  if (!supported) {
    return absentValue(field, MarineStatus.NotSupported, read);
  }

  // The stored samples are already normalised (`NaN` → `null`), but jsonb is schemaless, so
  // the finite check stays: a `NaN` published as a number is the exact bug class the
  // normalisation exists to kill. A gap at this step is `no_data` — the field IS carried
  // here (`support` said so above), there is simply nothing at this instant.
  const sample = series[ECMWF_SERIES_ARRAYS[field]][index] ?? null;
  if (sample === null || !Number.isFinite(sample)) {
    return absentValue(field, MarineStatus.NoData, read);
  }

  return {
    value: sample,
    unit: MARINE_INSTANT_UNITS[field],
    status: MarineStatus.Ok,
    freshness: freshnessOf(read),
    validAtUtc: series.timesUtc[index] ?? null,
    fetchedAtUtc: read.fetchedAtUtc,
    modelRunAtUtc: series.modelRunAtUtc,
    staleSinceUtc: read.staleSinceUtc,
    source: MarineSource.Ecmwf,
    // ECMWF publishes no per-value dataset id; the cycle in `modelRunAtUtc` is the provenance.
    datasetId: null,
    gridLatitude: read.value.gridLatitude,
    gridLongitude: read.value.gridLongitude,
    distanceKm: read.value.distanceKm,
  };
}

/**
 * §5.1 — SST: CMEMS or an honest absence. There is deliberately NO fallback parameter: ECMWF
 * Open Data has no SST stream, so the signature itself forbids the fill.
 */
export function resolveSst(read: CachedRead<CmemsPointValue>): MarineInstantValue {
  return cmemsInstant('seaSurfaceTemperature', read);
}

export interface WavePairInputs {
  /** The basin's CMEMS wave support (`not_supported` = Marmara: no call was ever made). */
  readonly cmemsSupport: 'supported' | 'not_supported';
  /** Present iff `cmemsSupport === 'supported'`. */
  readonly cmemsHeight: CachedRead<CmemsPointValue> | null;
  readonly cmemsDirection: CachedRead<CmemsPointValue> | null;
  readonly ecmwf: CachedRead<EcmwfPointSeriesRead>;
  readonly nowMs: number;
}

/**
 * §5.2 — the wave PAIR-CONSISTENCY rule: height and direction resolve as ONE unit.
 *
 * Both CMEMS `ok` → both CMEMS. ANYTHING else — Marmara's `not_supported`, one half `no_data`,
 * one half `unavailable` — sends BOTH halves to ECMWF's nearest step. Drawing one model's
 * direction over another model's height is the arrow form of silent mixing (K6) and is banned
 * even when each half individually looks fine.
 *
 * In the Marmara the published status is the FALLBACK's own status, never `not_supported`:
 * "CMEMS does not cover this" is already public in the catalogue and in `source`; the student
 * asks "is there a number", and ECMWF answers that.
 */
export function resolveWavePair(inputs: WavePairInputs): {
  readonly waveHeight: MarineInstantValue;
  readonly waveDirection: MarineInstantValue;
} {
  const bothCmemsOk =
    inputs.cmemsSupport === 'supported' &&
    inputs.cmemsHeight !== null &&
    inputs.cmemsDirection !== null &&
    inputs.cmemsHeight.kind === 'ok' &&
    inputs.cmemsHeight.value !== null &&
    inputs.cmemsDirection.kind === 'ok' &&
    inputs.cmemsDirection.value !== null;

  if (bothCmemsOk && inputs.cmemsHeight !== null && inputs.cmemsDirection !== null) {
    return {
      waveHeight: cmemsInstant('waveHeight', inputs.cmemsHeight),
      waveDirection: cmemsInstant('waveDirection', inputs.cmemsDirection),
    };
  }

  return {
    waveHeight: ecmwfInstantFromSeries('waveHeight', inputs.ecmwf, inputs.nowMs),
    waveDirection: ecmwfInstantFromSeries('waveDirection', inputs.ecmwf, inputs.nowMs),
  };
}

/** §5.3 — the wind pair: ECMWF's nearest step, both halves from the same read by shape. */
export function resolveWindPair(
  ecmwf: CachedRead<EcmwfPointSeriesRead>,
  nowMs: number,
): { readonly windSpeed10m: MarineInstantValue; readonly windDirection10m: MarineInstantValue } {
  return {
    windSpeed10m: ecmwfInstantFromSeries('windSpeed10m', ecmwf, nowMs),
    windDirection10m: ecmwfInstantFromSeries('windDirection10m', ecmwf, nowMs),
  };
}

/**
 * §5.5 — `seriesSourceDiffersFromInstant`: `true` when the series exists and at least one
 * `ok` instant field came from a different provider than the series (B12's whole purpose —
 * the chart and the headline can measurably disagree by ~1.5 °C at the same point).
 */
export function seriesSourceDiffersFromInstant(
  seriesSource: MarineSource | null,
  instants: readonly MarineInstantValue[],
): boolean {
  if (seriesSource === null) return false;
  return instants.some(
    (instant) => instant.status === MarineStatus.Ok && instant.source !== seriesSource,
  );
}

/** §5.6 — overview `dataAvailable`: any point's any field `ok`. */
export function overviewDataAvailable(points: readonly (readonly MarineInstantValue[])[]): boolean {
  return points.some((fields) => fields.some((field) => field.status === MarineStatus.Ok));
}
