import {
  ECMWF_DATA_REPRESENTATION_TEMPLATE,
  ECMWF_GRID_COLUMNS,
  ECMWF_GRID_FIRST_LATITUDE,
  ECMWF_GRID_FIRST_LONGITUDE,
  ECMWF_GRID_ROWS,
  ECMWF_GRID_SCANNING_MODE,
  ECMWF_PARAMS,
} from '../../marine/ecmwf/ecmwf.constants';
import { mapPointToGrid } from '../../marine/ecmwf/ecmwf-grid';
import { deriveWindDirection, deriveWindSpeed } from '../../marine/ecmwf/ecmwf-wind';
import { MarineImportError } from './marine-assertions';
import { MARINE_POINT_CANDIDATES } from './marine-candidates';
import type {
  EcmwfProbeAssertionResult,
  MarineEcmwfProbeArtifact,
} from './marine-ecmwf-artifact.types';

/**
 * The ECMWF probe's acceptance criteria — pure, so both the probe and the unit suite run the
 * identical checks over the identical evidence.
 *
 * ## Re-derived, never trusted
 * The artifact records its own verdicts. That array is a claim inside the file being validated,
 * so these functions recompute every one of them from the recorded evidence and refuse a
 * disagreement — a file cannot corroborate itself (the M1 discipline, applied to a second
 * provider).
 *
 * ## What is asserted, and why each one exists
 * - **the grid mapping**, recomputed from the coordinate rather than read back: the recorded row,
 *   column, index and distance must be what `mapPointToGrid` produces today. This is the check
 *   that catches the axis bug — a probe run before an axis change and read after it disagrees;
 * - **the in-cell offset against the latitude-dependent threshold**: exceeding it means our
 *   arithmetic picked the wrong cell, which is the ONLY thing that distance can prove;
 * - **the message envelopes**: CCSDS, 1440 × 721, first column at 180°, scanning mode 0. The
 *   provider changing any of these must fail a review, not pass one quietly;
 * - **bitmap accounting**: decoded finite values must equal section 5's own count, which is how a
 *   decoder that ignores the land mask is caught;
 * - **the wind derivation**, recomputed from the recorded raw components: the artifact's derived
 *   bearing must still be what the current code produces, so a convention flip cannot land
 *   without the evidence disagreeing.
 */

function check(id: string, passed: boolean, detail: string): EcmwfProbeAssertionResult {
  return { id, passed, detail };
}

/** Every run-level verdict, in a stable order. */
export function evaluateEcmwfProbeAssertions(
  artifact: MarineEcmwfProbeArtifact,
): EcmwfProbeAssertionResult[] {
  const results: EcmwfProbeAssertionResult[] = [];

  // ── g0: the artifact describes the CURRENT candidate table ──────────────────
  const candidateDrift: string[] = [];
  if (artifact.points.length !== MARINE_POINT_CANDIDATES.length) {
    candidateDrift.push(
      `artifact holds ${String(artifact.points.length)} point(s), the candidate table has ` +
        `${String(MARINE_POINT_CANDIDATES.length)}`,
    );
  }
  for (const [index, candidate] of MARINE_POINT_CANDIDATES.entries()) {
    const point = artifact.points[index];
    if (point === undefined) {
      candidateDrift.push(`${candidate.slugTr}: absent from the artifact`);
      continue;
    }
    if (
      point.slugTr !== candidate.slugTr ||
      point.latitude !== candidate.latitude ||
      point.longitude !== candidate.longitude ||
      point.seaBasin !== candidate.seaBasin ||
      point.plateCode !== candidate.plateCode ||
      point.displayOrder !== candidate.displayOrder
    ) {
      candidateDrift.push(
        `${candidate.slugTr}: the artifact describes a different point than the candidate table`,
      );
    }
  }
  results.push(
    check(
      'g0-candidates-current',
      candidateDrift.length === 0,
      candidateDrift.length === 0
        ? `${String(artifact.points.length)} points match the candidate table`
        : candidateDrift.join('; '),
    ),
  );

  // ── g1: the recorded grid mapping is what the code produces today ───────────
  const mappingDrift: string[] = [];
  const overThreshold: string[] = [];
  let maxDistanceKm = 0;
  for (const point of artifact.points) {
    const mapping = mapPointToGrid(point.latitude, point.longitude);
    if (
      mapping.gridLatitude !== point.gridLatitude ||
      mapping.gridLongitude !== point.gridLongitude ||
      mapping.row !== point.gridRow ||
      mapping.column !== point.gridColumn ||
      mapping.index !== point.gridIndex
    ) {
      mappingDrift.push(
        `${point.slugTr}: artifact says cell ${String(point.gridIndex)} ` +
          `(${String(point.gridLatitude)}, ${String(point.gridLongitude)}), re-derivation says ` +
          `${String(mapping.index)} (${String(mapping.gridLatitude)}, ` +
          `${String(mapping.gridLongitude)})`,
      );
    }
    maxDistanceKm = Math.max(maxDistanceKm, point.distanceKm);
    if (!(point.distanceKm <= point.thresholdKm)) {
      overThreshold.push(
        `${point.slugTr}: ${point.distanceKm.toFixed(2)} km against a ` +
          `${point.thresholdKm.toFixed(2)} km ceiling`,
      );
    }
  }
  results.push(
    check(
      'g1-grid-mapping-reproducible',
      mappingDrift.length === 0,
      mappingDrift.length === 0
        ? 'every recorded cell is what mapPointToGrid produces today'
        : mappingDrift.join('; '),
    ),
  );
  results.push(
    check(
      'g2-grid-threshold',
      overThreshold.length === 0,
      overThreshold.length === 0
        ? `largest in-cell offset ${maxDistanceKm.toFixed(2)} km, all within their latitude ceiling`
        : `offset(s) above half a cell diagonal — the arithmetic picked the wrong cell: ` +
            overThreshold.join('; '),
    ),
  );

  // ── g3: every parameter we publish was actually probed ──────────────────────
  const probedParams = new Set(artifact.messages.map((message) => message.param));
  const missingParams = ECMWF_PARAMS.filter((param) => !probedParams.has(param));
  results.push(
    check(
      'g3-parameters-complete',
      missingParams.length === 0,
      missingParams.length === 0
        ? `all four Faz-1 parameters probed: ${[...probedParams].join(', ')}`
        : `not probed: ${missingParams.join(', ')}`,
    ),
  );

  // ── g4: every message is the product this leg was measured against ──────────
  const envelopeProblems: string[] = [];
  for (const message of artifact.messages) {
    if (message.dataRepresentationTemplate !== ECMWF_DATA_REPRESENTATION_TEMPLATE) {
      envelopeProblems.push(
        `${message.param}: packing template ${String(message.dataRepresentationTemplate)}, ` +
          `expected ${String(ECMWF_DATA_REPRESENTATION_TEMPLATE)}`,
      );
    }
    if (message.columns !== ECMWF_GRID_COLUMNS || message.rows !== ECMWF_GRID_ROWS) {
      envelopeProblems.push(
        `${message.param}: grid ${String(message.columns)} × ${String(message.rows)}`,
      );
    }
    if (
      message.firstLatitude !== ECMWF_GRID_FIRST_LATITUDE ||
      message.firstLongitude !== ECMWF_GRID_FIRST_LONGITUDE
    ) {
      envelopeProblems.push(
        `${message.param}: grid origin (${String(message.firstLatitude)}, ` +
          `${String(message.firstLongitude)}), expected (${String(ECMWF_GRID_FIRST_LATITUDE)}, ` +
          `${String(ECMWF_GRID_FIRST_LONGITUDE)}) — the longitude axis is the one that shifts ` +
          `values by 180° without failing anything`,
      );
    }
    if (message.scanningMode !== ECMWF_GRID_SCANNING_MODE) {
      envelopeProblems.push(`${message.param}: scanning mode ${String(message.scanningMode)}`);
    }
    if (message.numberOfDataPoints !== ECMWF_GRID_COLUMNS * ECMWF_GRID_ROWS) {
      envelopeProblems.push(`${message.param}: ${String(message.numberOfDataPoints)} data points`);
    }
  }
  results.push(
    check(
      'g4-message-envelopes',
      envelopeProblems.length === 0,
      envelopeProblems.length === 0
        ? `${String(artifact.messages.length)} message(s), all CCSDS on the expected 0.25° grid`
        : envelopeProblems.join('; '),
    ),
  );

  // ── g5: the bitmap was applied ──────────────────────────────────────────────
  const bitmapProblems: string[] = [];
  for (const message of artifact.messages) {
    if (message.finiteValues !== message.numberOfEncodedValues) {
      bitmapProblems.push(
        `${message.param}: decoded ${String(message.finiteValues)} finite values, section 5 ` +
          `declares ${String(message.numberOfEncodedValues)}`,
      );
    }
    if (message.bitmapPresent && message.numberOfEncodedValues >= message.numberOfDataPoints) {
      bitmapProblems.push(`${message.param}: a bitmap is present yet nothing is masked`);
    }
  }
  results.push(
    check(
      'g5-bitmap-applied',
      bitmapProblems.length === 0,
      bitmapProblems.length === 0
        ? artifact.messages
            .map(
              (message) =>
                `${message.param}: ${String(message.finiteValues)}/` +
                `${String(message.numberOfDataPoints)} cells carry a value`,
            )
            .join('; ')
        : bitmapProblems.join('; '),
    ),
  );

  // ── g6: the recorded derivation is what the code produces today ─────────────
  const derivationDrift: string[] = [];
  for (const point of artifact.points) {
    const u = point.values['10u'];
    const v = point.values['10v'];
    const speed = deriveWindSpeed(u, v);
    const direction = deriveWindDirection(u, v);
    if (!numbersMatch(speed, point.derived.windSpeed10m)) {
      derivationDrift.push(
        `${point.slugTr}: artifact records speed ${String(point.derived.windSpeed10m)}, ` +
          `re-derivation gives ${String(speed)}`,
      );
    }
    if (!numbersMatch(direction, point.derived.windDirection10m)) {
      derivationDrift.push(
        `${point.slugTr}: artifact records bearing ${String(point.derived.windDirection10m)}, ` +
          `re-derivation gives ${String(direction)} — the wind convention has moved`,
      );
    }
    if (direction !== null && (direction < 0 || direction >= 360)) {
      derivationDrift.push(`${point.slugTr}: bearing ${String(direction)} is outside [0, 360)`);
    }
  }
  results.push(
    check(
      'g6-wind-derivation-reproducible',
      derivationDrift.length === 0,
      derivationDrift.length === 0
        ? 'every recorded wind speed and bearing is what the current derivation produces'
        : derivationDrift.join('; '),
    ),
  );

  // ── g7: the observation matrix agrees with the values beside it ─────────────
  const observationDrift: string[] = [];
  for (const point of artifact.points) {
    for (const param of ECMWF_PARAMS) {
      const value = point.values[param];
      const expected = value === null ? 'missing' : 'value';
      if (point.observed[param] !== expected) {
        observationDrift.push(
          `${point.slugTr}/${param}: recorded "${point.observed[param]}" beside ` +
            `${String(value)}`,
        );
      }
    }
  }
  results.push(
    check(
      'g7-observation-matrix',
      observationDrift.length === 0,
      observationDrift.length === 0 ? countObservations(artifact) : observationDrift.join('; '),
    ),
  );

  // ── g8: every recorded request actually succeeded ───────────────────────────
  const badRequests = artifact.requests.filter(
    (request) => request.httpStatus !== 200 && request.httpStatus !== 206,
  );
  results.push(
    check(
      'g8-transport',
      badRequests.length === 0,
      badRequests.length === 0
        ? `${String(artifact.requests.length)} request(s), ` +
            `${String(artifact.totals.downloadedBytes)} B in ` +
            `${String(artifact.totals.downloadMs)} ms`
        : badRequests
            .map((request) => `${request.label}: HTTP ${String(request.httpStatus)}`)
            .join('; '),
    ),
  );

  return results;
}

/** Collected failures, formatted for a human. */
export function collectEcmwfProbeFailures(artifact: MarineEcmwfProbeArtifact): string[] {
  return evaluateEcmwfProbeAssertions(artifact)
    .filter((result) => !result.passed)
    .map((result) => `${result.id}: ${result.detail}`);
}

/**
 * The evidence gate: the recorded verdicts must be reproducible from the recorded evidence, and
 * all of them must pass.
 */
export function assertEcmwfProbeArtifactIsSound(artifact: MarineEcmwfProbeArtifact): void {
  if (artifact.points.length === 0) {
    throw new MarineImportError('the ECMWF probe artifact contains no points. Re-run the probe.');
  }

  const recomputed = evaluateEcmwfProbeAssertions(artifact);
  const recordedById = new Map(artifact.assertions.map((result) => [result.id, result]));
  const drifted: string[] = [];
  for (const result of recomputed) {
    const recorded = recordedById.get(result.id);
    if (recorded === undefined) {
      drifted.push(`${result.id}: absent from the recorded assertions`);
    } else if (recorded.passed !== result.passed) {
      drifted.push(
        `${result.id}: artifact says passed=${String(recorded.passed)}, re-derivation says ` +
          `${String(result.passed)}`,
      );
    }
  }
  if (drifted.length > 0) {
    throw new MarineImportError(
      `the ECMWF probe artifact's recorded verdicts do not match a re-derivation from its own ` +
        `evidence — it has been edited or partially regenerated:\n  ${drifted.join('\n  ')}`,
    );
  }

  const failures = recomputed.filter((result) => !result.passed);
  if (failures.length > 0) {
    throw new MarineImportError(
      `${String(failures.length)} ECMWF probe assertion(s) FAILED:\n  ` +
        failures.map((result) => `${result.id}: ${result.detail}`).join('\n  '),
    );
  }
}

function countObservations(artifact: MarineEcmwfProbeArtifact): string {
  const counts = ECMWF_PARAMS.map((param) => {
    const withValue = artifact.points.filter((point) => point.observed[param] === 'value').length;
    return `${param} ${String(withValue)}/${String(artifact.points.length)}`;
  });
  return `points carrying a value: ${counts.join(', ')}`;
}

/**
 * Compare two derived numbers, tolerating JSON's round trip.
 *
 * `JSON.stringify` of a double is exact in both directions, so this is equality in practice; the
 * epsilon exists so that a future artifact written with reduced precision fails the PRECISION
 * check somewhere visible rather than this one, which is about the convention.
 */
function numbersMatch(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 1e-9;
}
