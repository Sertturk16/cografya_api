/**
 * The one error type the CAMS decode path raises when the provider's bytes are not what we
 * contracted for — the `ecmwf.errors.ts` pattern, deliberately copied.
 *
 * Everything under `src/air-quality/cams/` is fail-closed: a ZIP with two entries, a NetCDF
 * magic we did not pin, a variable the mapping table expects but the file lacks, a unit string
 * one code point off, an axis that is not monotonic, a read-back that lands half a cell away —
 * none of them may be "handled" by a best guess, because every such guess produces a PLAUSIBLE
 * number instead of an absence (the exact silent-failure class this leg keeps designing
 * against: −999 as a concentration, the wrong cell for all 81 provinces, the wrong day's
 * file). They all raise this one class, so A2's ingest wrapper can map it to its
 * `schema_error` outcome without string-matching messages.
 *
 * It deliberately does NOT extend `UpstreamSchemaError`: that type belongs to `src/upstream`'s
 * outcome vocabulary and is thrown inside a `parse` callback, whereas these fire on bytes
 * already in hand, well after any HTTP call.
 */
export class CamsContractError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(`[cams] ${message}`, options);
    this.name = 'CamsContractError';
  }
}
