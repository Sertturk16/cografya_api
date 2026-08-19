/**
 * The two NAMED error types the ACAG line raises, kept separate for the same reason the ERA5
 * line keeps its pair separate: they answer different questions and route an operator
 * differently.
 *
 * - {@link AcagContractError} — *"the file is not the document it claims to be"*: a missing
 *   variable, an axis that is not monotonic, a cell that reads back from the wrong place, a
 *   payload that is not HDF5 at all. The answer is to re-download or to stop trusting the
 *   provider's file, never to patch around it.
 * - {@link AcagLoadError} — *"the artifact is well-formed but disagrees with the manifest,
 *   the database, or itself"*. That is a data/ordering problem, not a corrupt file.
 *
 * Neither is thrown for a database fault: a TypeORM `QueryFailedError` propagates unwrapped,
 * because re-labelling it would hide the SQLSTATE an operator actually needs.
 */

/** The file (or our reading of it) violates the provider contract. */
export class AcagContractError extends Error {
  constructor(message: string, options?: { cause?: unknown; unexpected?: boolean }) {
    super(`[acag] ${message}`, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AcagContractError';
  }
}

/** The committed artifact disagrees with the manifest, the closed expectations, or the database. */
export class AcagLoadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(`[acag] ${message}`, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AcagLoadError';
  }
}
