import { fork, type ForkOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EcmwfContractError } from '../ecmwf.errors';
import type { DecodedGribCells } from './grib-decoder.adapter';
import type { GribDecodeJob, GribDecodeReply } from './grib-decode-protocol';

/**
 * Ceiling on one child decode, wall-clock. Measured decode time is ~54 ms per message and a
 * range holds at most two, so 30 s is two orders of magnitude of headroom — anything that slow
 * is a hung child, and a hung child holding 43 MB must die, not wait.
 */
const DECODE_TIMEOUT_MS = 30_000;

/** Grace between receiving the reply and force-killing a child that did not exit by itself. */
const EXIT_GRACE_MS = 5_000;

/**
 * The child died (or was killed) without producing a reply — the failure class the isolation
 * exists to contain, most importantly the decoder's `panic = abort` (SIGABRT, exit 134).
 *
 * Its own type rather than `EcmwfContractError` because the two demand different reactions: a
 * contract refusal is the provider's bytes being wrong (fail-closed, quiet-ish, re-tried next
 * cycle), while a crash is the DECODER failing on bytes that passed every envelope check —
 * evidence for the DEC 2026-07-31d "migrate to ecCodes" trigger, and it must be visible as
 * itself in the logs.
 */
export class EcmwfDecodeCrashError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly signal: string | null,
    readonly timedOut: boolean,
  ) {
    super(`[ecmwf] ${message}`);
    this.name = 'EcmwfDecodeCrashError';
  }
}

/** What a successful isolated decode hands back to the ingest. */
export interface IsolatedDecodeResult {
  readonly fields: readonly DecodedGribCells[];
  /** Reported by the child that actually loaded the binary — cycle-ledger evidence. */
  readonly decoderVersion: string;
}

/** The slice of `ChildProcess` the host touches — the seam a unit test fakes. */
export interface DecodeChildHandle {
  send(message: unknown, callback?: (error: Error | null) => void): boolean;
  on(event: 'message', listener: (message: unknown) => void): this;
  on(event: 'exit', listener: (code: number | null, signal: string | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  kill(signal?: NodeJS.Signals): boolean;
}

export type DecodeForkImpl = (modulePath: string, options: ForkOptions) => DecodeChildHandle;

export interface IsolatedGribDecoderOptions {
  /** Overridden in tests. Defaults to the compiled sibling `grib-decode-child.js`. */
  childModulePath?: string;
  timeoutMs?: number;
  /** Injected in tests; defaults to `node:child_process.fork`. */
  forkImpl?: DecodeForkImpl;
}

/**
 * Parent-side host of the decode child (see `grib-decode-protocol.ts` for WHY a child process —
 * board acceptance item A1, and why a worker thread cannot satisfy it).
 *
 * One child per byte range, one job per child. The host's whole job is to turn every possible
 * child ending into exactly one settled promise:
 *
 * | ending                             | surfaced as                                   |
 * |------------------------------------|-----------------------------------------------|
 * | reply `ok`                         | resolve with the fields                       |
 * | reply `error` (contract refusal)   | reject `EcmwfContractError` (fail-closed)     |
 * | reply `error` (other throw)        | reject `EcmwfContractError`, cause named      |
 * | exit before any reply (the panic)  | reject `EcmwfDecodeCrashError` — LOUD         |
 * | no reply within the timeout        | SIGKILL, reject `EcmwfDecodeCrashError`       |
 * | fork/IPC failure                   | reject `EcmwfDecodeCrashError`                |
 *
 * ## The child path is checked lazily, on purpose
 * The compiled child exists only under `dist/`. The test suites run from TypeScript sources
 * (ts-jest), where the sibling is a `.ts` file no plain `node` fork can load — so a boot-time
 * check would fail exactly in the environments that never decode. Production's first real
 * decode hits the check immediately and fails with a message that names the deployment
 * problem. (The real fork is exercised by the 48 h shadow run, not CI — stated in the PR.)
 */
export class IsolatedGribDecoder {
  private readonly childModulePath: string;
  private readonly timeoutMs: number;
  private readonly forkImpl: DecodeForkImpl;
  private readonly usingRealFork: boolean;

  constructor(options: IsolatedGribDecoderOptions = {}) {
    this.childModulePath = options.childModulePath ?? join(__dirname, 'grib-decode-child.js');
    this.timeoutMs = options.timeoutMs ?? DECODE_TIMEOUT_MS;
    this.usingRealFork = options.forkImpl === undefined;
    this.forkImpl =
      options.forkImpl ??
      ((modulePath, forkOptions): DecodeChildHandle => fork(modulePath, forkOptions));
  }

  async decode(job: GribDecodeJob): Promise<IsolatedDecodeResult> {
    if (this.usingRealFork && !existsSync(this.childModulePath)) {
      throw new EcmwfContractError(
        `the decode child entry is missing at ${this.childModulePath}. The ingest must run from ` +
          `the compiled dist/ tree (pnpm build); a source-tree run cannot fork the child.`,
      );
    }

    return await new Promise<IsolatedDecodeResult>((resolve, reject) => {
      let child: DecodeChildHandle;
      try {
        child = this.forkImpl(this.childModulePath, {
          // 'advanced' = structured clone over IPC: the GRIB bytes cross as binary, not JSON.
          serialization: 'advanced',
          // The child inherits nothing it does not need; stdio stays piped to ours for stderr
          // visibility if the binary prints its dying words.
          stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
        });
      } catch (error: unknown) {
        reject(
          new EcmwfDecodeCrashError(
            `could not fork the decode child: ${error instanceof Error ? error.message : 'unknown'}`,
            null,
            null,
            false,
          ),
        );
        return;
      }

      let settled = false;
      let timedOut = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        // SIGKILL, not SIGTERM: a child stuck inside native code does not run signal handlers.
        child.kill('SIGKILL');
      }, this.timeoutMs);
      timeout.unref();

      const settle = (action: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        action();
      };

      child.on('message', (message: unknown) => {
        const reply = message as GribDecodeReply;
        settle(() => {
          // The child exits by itself right after replying; the grace kill only exists so a
          // child stuck between `send` and `exit` cannot linger holding 43 MB.
          const graceKill = setTimeout(() => child.kill('SIGKILL'), EXIT_GRACE_MS);
          graceKill.unref();

          if (reply.kind === 'ok') {
            resolve({ fields: reply.fields, decoderVersion: reply.decoderVersion });
            return;
          }
          // Every expressible child failure is fail-closed contract vocabulary up here. The
          // original error name is preserved in the message so a non-contract throw (a bug in
          // the adapter itself) still reads as what it was.
          reject(
            new EcmwfContractError(
              reply.name === 'EcmwfContractError'
                ? reply.message.replace(/^\[ecmwf\] /, '')
                : `decode child failed (${reply.name}): ${reply.message}`,
            ),
          );
        });
      });

      child.on('exit', (code, signal) => {
        settle(() => {
          reject(
            new EcmwfDecodeCrashError(
              timedOut
                ? `decode child produced no reply within ${String(this.timeoutMs)} ms and was killed`
                : `decode child died without a reply (exit ${String(code)}, signal ` +
                    `${String(signal)}) — the panic class the process isolation exists to contain`,
              code,
              signal,
              timedOut,
            ),
          );
        });
      });

      child.on('error', (error) => {
        settle(() => {
          child.kill('SIGKILL');
          reject(
            new EcmwfDecodeCrashError(
              `decode child IPC error: ${error.message}`,
              null,
              null,
              false,
            ),
          );
        });
      });

      child.send(job, (sendError: Error | null) => {
        if (sendError !== null) {
          settle(() => {
            child.kill('SIGKILL');
            reject(
              new EcmwfDecodeCrashError(
                `could not send the job: ${sendError.message}`,
                null,
                null,
                false,
              ),
            );
          });
        }
      });
    });
  }
}
