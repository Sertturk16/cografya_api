import { decodeGribRangeCells } from './grib-decoder.adapter';
import type { GribDecodeJob, GribDecodeReply } from './grib-decode-protocol';

/**
 * The decode child's entry point — deliberately the THINNEST file in the ECMWF leg.
 *
 * Everything with logic in it (`decodeGribRangeCells` and the whole envelope/adapter chain
 * under it) is an ordinary in-process module with its own unit tests against the committed
 * GRIB fixture. This file only wires IPC around that call, because IPC wiring is the one part
 * CI cannot exercise: the unit and e2e suites run from TypeScript sources under ts-jest, where
 * a forked child cannot resolve the extensionless imports, so the REAL fork runs only from the
 * compiled `dist/` tree (production and the 48 h shadow run — surfaced in the PR body, not
 * hidden). Keeping this file logic-free keeps that untested surface as small as it can be.
 *
 * Contract with the parent (`isolated-grib-decoder.ts`):
 * - exactly one job per child; reply, then `process.exit(0)` on every EXPRESSIBLE path;
 * - a decoder panic is not expressible — the child dies with SIGABRT/exit 134 and the parent
 *   reads the exit status instead of a reply;
 * - the reply carries the decoder package version, read HERE, in the process that actually
 *   loaded the binary — the parent must not claim a version it did not run.
 */

/** The decoder package's own version — evidence for the cycle ledger. */
function decoderVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const packageJson = require('@mattnucc/gribberish/package.json') as { version?: unknown };
    return typeof packageJson.version === 'string' ? packageJson.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

function run(job: GribDecodeJob): GribDecodeReply {
  try {
    const fields = decodeGribRangeCells(
      job.bytes,
      job.members,
      {
        referenceTimeUtc: new Date(job.referenceTimeUtcMs),
        forecastHours: job.forecastHours,
      },
      job.indices,
    );
    return { kind: 'ok', fields, decoderVersion: decoderVersion() };
  } catch (error: unknown) {
    return {
      kind: 'error',
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

process.once('message', (job: GribDecodeJob) => {
  const reply = run(job);
  if (process.send === undefined) {
    // Forked children always have an IPC channel; running this file any other way is a bug.
    process.exit(2);
  }
  process.send(reply, (sendError: Error | null) => {
    process.exit(sendError === null ? 0 : 3);
  });
});
