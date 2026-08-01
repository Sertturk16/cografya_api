/**
 * The one error type every ERA5-Land contract violation raises — the `CamsContractError` /
 * `EcmwfContractError` pattern, deliberately copied.
 *
 * Everything under `src/database/era5/` is FAIL-CLOSED. A variable the file does not carry, a
 * dimension order that is not `(valid_time, latitude, longitude)`, a `scale_factor` appearing
 * where the measured product had none, an `expver` that is not `"0001"`, a land-cell fallback
 * farther than 25 km, a fallback SET that is not the expected five provinces — none of these
 * may be "handled" by a best guess, because every such guess publishes a PLAUSIBLE number from
 * the wrong place instead of stopping the migration (SPEC §5.2, §4.1).
 *
 * There is no soft class on this line. Unlike the CAMS request path, this is a one-off MIGRATION:
 * a missing value is not degraded to `null` and shipped, it stops the run and comes back to
 * Atlas (SPEC §5.3 — completeness is absolute).
 *
 * It deliberately does NOT extend `UpstreamSchemaError`: that type belongs to `src/upstream`'s
 * runtime outcome vocabulary, and this file is reached only from a hand-run CLI.
 */
export class Era5ContractError extends Error {
  /**
   * `true` only when raised by a catch-all wrapper — i.e. the failure matched no pinned guard,
   * so it is either a bug of OURS or a byte pattern nobody anticipated. Recorded rather than
   * flattened: a wrapper-origin error means "fix the decoder", not "the provider drifted".
   */
  readonly unexpected: boolean;

  constructor(message: string, options?: { cause?: unknown; unexpected?: boolean }) {
    super(`[era5] ${message}`, { cause: options?.cause });
    this.name = 'Era5ContractError';
    this.unexpected = options?.unexpected ?? false;
  }
}
