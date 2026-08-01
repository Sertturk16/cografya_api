import type { EcmwfRangeMember } from '../ecmwf-index';
import type { DecodedGribCells } from './grib-decoder.adapter';

/**
 * The IPC vocabulary between the ingest (parent) and the decode child process — plain
 * structured-clone-safe data, no `Date`, no class instances, no functions.
 *
 * ## Why a child process exists at all (board acceptance item A1 — BLOCKING)
 * The published `@mattnucc/gribberish` binary is built with `panic = abort`: a Rust panic inside
 * it raises SIGABRT and kills the WHOLE PROCESS (measured: exit 134, invisible to `try/catch`).
 * The envelope reader closes every malformation we know how to detect BEFORE the decoder runs,
 * but a CCSDS payload that is internally corrupt yet envelope-clean can still panic — and in
 * M3b the ingest lives inside the API server, where "a provider byte pattern can take the
 * server down" violates the fail-soft boundary outright (playbook §3.5).
 *
 * A **worker thread does NOT satisfy the requirement**: threads share the process, and
 * `abort()` terminates the process regardless of which thread called it — the server would die
 * exactly as before, with one more moving part. A separate OS process is the only mechanism
 * that actually contains SIGABRT, so the decode runs in a short-lived forked child: bytes in,
 * ~30 cells per field out, exit. A panic becomes a child exit code the parent logs LOUDLY and
 * treats as a failed step; the server never notices beyond the log line.
 *
 * The child is spawned per byte range rather than kept resident: an ingest tour decodes at most
 * ~36 ranges (~30 s of work), a fork costs ~50–80 ms, and a fresh child returns the measured
 * ~43 MB/message transient to the OS on exit — process lifetime IS the memory bound, with no
 * restart/health machinery to get wrong.
 */

/** One decode request: the downloaded range, what the `.index` promised it holds, and where. */
export interface GribDecodeJob {
  /** The raw HTTP 206 body. Transferred as a structured-clone Buffer, never re-encoded. */
  readonly bytes: Uint8Array;
  /** The range plan's member list, in file order. */
  readonly members: readonly EcmwfRangeMember[];
  /** The requested cycle (epoch ms) — GRIB section 1 must agree exactly. */
  readonly referenceTimeUtcMs: number;
  /** The requested forecast step, hours — section 4 must agree exactly. */
  readonly forecastHours: number;
  /** Flat grid indices to extract (the 30 reference points), in a fixed caller-known order. */
  readonly indices: readonly number[];
}

export type GribDecodeReply =
  | {
      readonly kind: 'ok';
      readonly fields: readonly DecodedGribCells[];
      /** The decoder package version that produced these numbers — cycle-ledger evidence. */
      readonly decoderVersion: string;
    }
  | {
      /**
       * A refusal the child could EXPRESS — an `EcmwfContractError` or any ordinary throw. A
       * panic never produces a reply at all; the parent sees only the exit code.
       */
      readonly kind: 'error';
      readonly name: string;
      readonly message: string;
    };
