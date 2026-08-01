import { MarineStatus } from '../marine.types';
import { EcmwfContractError } from './ecmwf.errors';

/**
 * Null classification: telling "this model does not carry this field HERE" apart from "it does,
 * but not at this step".
 *
 * ## Why the distinction is not cosmetic
 * `not_supported` is a permanent product truth — the cell is land as far as the wave model is
 * concerned, and it will be land next cycle too. `no_data` is a gap. They must not render alike
 * (`MarineStatus`'s own docblock), and in M3b they will not cost the same either: a
 * `not_supported` field is a field the read path stops trying to fill.
 *
 * ## Why the verdict is recomputed from EVERY cycle rather than read from the probe artifact
 * The support matrix is not stable enough to freeze. The F2 spike measured a cell where `swh`,
 * `mwp` and `mwd` were all real numbers and `pp1d` alone was NaN — one parameter masked inside a
 * cell three others treat as water. That is the class, and its membership can change when the
 * model's mask changes. The committed probe artifact is EVIDENCE of one cycle; the runtime
 * classifies from the cycle in front of it.
 *
 * As measured on 2026-07-30 12z, all four Faz-1 parameters are real at all 30 reference points —
 * the `not_supported` surface is currently EMPTY. The classification stays anyway: an empty
 * surface today is not a guarantee, and the cheapest moment to get this right is before there is
 * anything to migrate.
 *
 * ## What this module will never do
 * No nearest-wet-cell search, no interpolation, no neighbour fill, no carrying the previous
 * step forward. A gap is published as a gap. Every one of those "repairs" replaces a visible
 * absence with an invisible fabrication, which is the one outcome the owner rule forbids
 * outright.
 */

/** What a cycle's evidence says about one (point, field) pair. */
export type EcmwfFieldSupport = 'ok' | 'not_supported';

/** The verdict, plus the counts it was derived from so an artifact can show its working. */
export interface EcmwfFieldClassification {
  readonly support: EcmwfFieldSupport;
  /** Steps examined. */
  readonly sampleCount: number;
  /** Steps carrying a real number. */
  readonly presentCount: number;
  /** Steps carrying nothing. */
  readonly missingCount: number;
  /**
   * Some — but not all — steps are missing.
   *
   * Not a third support value: the field IS carried here, so `support` stays `ok` and the
   * individual gaps are published as `null` at their own steps. Surfaced separately because it
   * is the F2 anomaly's signature and worth seeing in an artifact.
   */
  readonly partial: boolean;
}

/**
 * Classify one field's samples across a cycle's steps.
 *
 * `NaN` and `null` both count as missing: the decoder reports masked cells as `NaN` (that is how
 * a GRIB bitmap arrives), while anything that has already been through our own normalisation
 * carries `null`. Treating one of the two as a value would publish a `NaN` as a number.
 */
export function classifyFieldSeries(samples: readonly (number | null)[]): EcmwfFieldClassification {
  if (samples.length === 0) {
    // Refused rather than defaulted. With no steps there is no evidence, and BOTH defaults lie:
    // `not_supported` claims a permanent product truth we never observed, `ok` claims coverage
    // we never saw. An empty series means the ingest produced nothing, which is its own problem.
    throw new EcmwfContractError(
      'cannot classify a field from zero samples — an empty series is missing evidence, not ' +
        'evidence of absence.',
    );
  }

  let presentCount = 0;
  for (const sample of samples) {
    if (sample !== null && Number.isFinite(sample)) presentCount += 1;
  }

  const missingCount = samples.length - presentCount;

  return {
    support: presentCount === 0 ? 'not_supported' : 'ok',
    sampleCount: samples.length,
    presentCount,
    missingCount,
    partial: presentCount > 0 && missingCount > 0,
  };
}

/**
 * The published status of ONE sample, given its field's cycle-level verdict.
 *
 * The order matters: `not_supported` wins over `no_data`, because "the model does not carry this
 * here" is the more specific and more permanent statement, and a reader who sees `no_data` on a
 * land cell will keep waiting for a value that is never coming.
 */
export function statusForSample(
  classification: EcmwfFieldClassification,
  sample: number | null,
): MarineStatus {
  if (classification.support === 'not_supported') return MarineStatus.NotSupported;
  if (sample === null || !Number.isFinite(sample)) return MarineStatus.NoData;
  return MarineStatus.Ok;
}

/**
 * Normalise one decoded sample for storage/publication: `NaN` becomes `null`, everything finite
 * is passed through UNCHANGED.
 *
 * No rounding, no unit conversion, no clamping. What we store is what the provider produced —
 * derivations (speed, direction) happen at read time from the raw components, so a bug in a
 * derivation never contaminates the record.
 */
export function normaliseSample(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value;
}
