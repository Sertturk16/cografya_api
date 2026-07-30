/**
 * The one error type the ECMWF leg raises when the provider's bytes are not what we contracted
 * for.
 *
 * ## Why a single named class rather than plain `Error`s
 * Everything in this folder is fail-closed by design (DEC 2026-07-31d condition 3): an index line
 * we cannot read, a GRIB message whose packing we did not pin, a decoded field whose length
 * disagrees with its own header — none of them may be "handled" by falling back to a best guess,
 * because every one of those guesses produces a plausible number rather than an absence. So they
 * all raise the same thing, and the callers above (the probe tool today, M3b's ingest next) can
 * tell "the provider changed under us" from a transport blip without string-matching a message.
 *
 * It deliberately does NOT extend `UpstreamSchemaError`: that type belongs to
 * `src/upstream/`'s outcome vocabulary and is thrown from inside a `parse` callback, whereas most
 * of these fire well after the HTTP call, on bytes already in hand.
 */
export class EcmwfContractError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(`[ecmwf] ${message}`, options);
    this.name = 'EcmwfContractError';
  }
}
