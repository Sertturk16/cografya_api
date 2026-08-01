import { describe, expect, it } from '@jest/globals';
import { EcmwfContractError } from '../ecmwf.errors';
import type { GribDecodeJob, GribDecodeReply } from './grib-decode-protocol';
import {
  classifyDecodeCrash,
  EcmwfDecodeCrashError,
  IsolatedGribDecoder,
  type DecodeChildHandle,
} from './isolated-grib-decoder';

/**
 * The host is tested against a FAKE child handle: what CI can prove is that every way a child
 * can end — reply, refusal, crash, silence — becomes exactly one settled promise of the right
 * type. The REAL fork (a compiled child under dist/) cannot run under ts-jest and is exercised
 * by the 48 h shadow run instead; that gap is stated in the decoder's docblock and the PR, not
 * hidden. The decode LOGIC inside the child is an ordinary module with its own fixture-based
 * tests (`grib-decoder.adapter.spec.ts`) — this file is only about process endings.
 */

const JOB: GribDecodeJob = {
  bytes: new Uint8Array([1, 2, 3]),
  members: [{ param: '10u', relativeOffset: 0, length: 3 }],
  referenceTimeUtcMs: Date.parse('2026-07-30T12:00:00.000Z'),
  forecastHours: 72,
  indices: [296_026],
};

const OK_REPLY: GribDecodeReply = {
  kind: 'ok',
  fields: [
    {
      param: '10u',
      cells: [-1.77],
      referenceTimeUtcMs: JOB.referenceTimeUtcMs,
      validTimeUtcMs: JOB.referenceTimeUtcMs + 72 * 3_600_000,
      dataRepresentationTemplate: 42,
    },
  ],
  decoderVersion: '1.6.0',
};

/** A scriptable child: the test decides what the child does after receiving the job. */
class FakeChild implements DecodeChildHandle {
  sentJobs: unknown[] = [];
  killedWith: NodeJS.Signals | undefined;
  private listeners = new Map<string, ((...args: never[]) => void)[]>();

  constructor(private readonly script: (child: FakeChild) => void) {}

  send(message: unknown, callback?: (error: Error | null) => void): boolean {
    this.sentJobs.push(message);
    callback?.(null);
    // The child "acts" on the next tick, after the host has registered its listeners.
    setImmediate(() => this.script(this));
    return true;
  }

  on(event: string, listener: (...args: never[]) => void): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  kill(signal?: NodeJS.Signals): boolean {
    this.killedWith = signal;
    // A killed child exits with the signal, like the real one.
    this.emit('exit', null, signal ?? 'SIGTERM');
    return true;
  }

  emit(event: 'message', message: unknown): void;
  emit(event: 'exit', code: number | null, signal: string | null): void;
  emit(event: 'error', error: Error): void;
  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      (listener as (...listenerArgs: unknown[]) => void)(...args);
    }
  }
}

function decoderWith(script: (child: FakeChild) => void, timeoutMs = 1_000): IsolatedGribDecoder {
  return new IsolatedGribDecoder({
    childModulePath: '/fake/grib-decode-child.js',
    timeoutMs,
    forkImpl: () => new FakeChild(script),
  });
}

describe('IsolatedGribDecoder', () => {
  it('resolves an ok reply with the fields and the CHILD-reported decoder version', async () => {
    const decoder = decoderWith((child) => {
      child.emit('message', OK_REPLY);
      child.emit('exit', 0, null);
    });

    const result = await decoder.decode(JOB);
    expect(result.fields).toEqual(OK_REPLY.kind === 'ok' ? OK_REPLY.fields : []);
    expect(result.decoderVersion).toBe('1.6.0');
  });

  it('re-raises a child contract refusal as EcmwfContractError — fail-closed crosses the IPC boundary', async () => {
    const decoder = decoderWith((child) => {
      child.emit('message', {
        kind: 'error',
        name: 'EcmwfContractError',
        message: '[ecmwf] refusing a GRIB message that is not the pinned product',
      } satisfies GribDecodeReply);
      child.emit('exit', 0, null);
    });

    await expect(decoder.decode(JOB)).rejects.toThrow(EcmwfContractError);
  });

  it('surfaces a non-contract child throw as a contract error that NAMES the original', async () => {
    const decoder = decoderWith((child) => {
      child.emit('message', {
        kind: 'error',
        name: 'RangeError',
        message: 'boom',
      } satisfies GribDecodeReply);
      child.emit('exit', 0, null);
    });

    await expect(decoder.decode(JOB)).rejects.toThrow(/RangeError.*boom/);
  });

  it('turns an exit WITHOUT a reply into EcmwfDecodeCrashError carrying the exit evidence — the contained panic (exit 134)', async () => {
    const decoder = decoderWith((child) => {
      child.emit('exit', 134, null);
    });

    const rejection = decoder.decode(JOB);
    await expect(rejection).rejects.toBeInstanceOf(EcmwfDecodeCrashError);
    await rejection.catch((error: unknown) => {
      const crash = error as EcmwfDecodeCrashError;
      expect(crash.exitCode).toBe(134);
      expect(crash.timedOut).toBe(false);
    });
  });

  it('SIGKILLs and rejects a child that never replies — a hung child holds 43 MB', async () => {
    const decoder = decoderWith(() => {
      // The child does nothing: no reply, no exit — until the host kills it.
    }, 50);

    const rejection = decoder.decode(JOB);
    await expect(rejection).rejects.toBeInstanceOf(EcmwfDecodeCrashError);
    await rejection.catch((error: unknown) => {
      expect((error as EcmwfDecodeCrashError).timedOut).toBe(true);
    });
  });

  it('rejects when the fork itself throws', async () => {
    const decoder = new IsolatedGribDecoder({
      childModulePath: '/fake/grib-decode-child.js',
      forkImpl: () => {
        throw new Error('EMFILE');
      },
    });

    await expect(decoder.decode(JOB)).rejects.toThrow(/could not fork/);
  });

  it('settles exactly once even when a reply and an exit race', async () => {
    const decoder = decoderWith((child) => {
      child.emit('message', OK_REPLY);
      child.emit('exit', 0, null);
      child.emit('exit', 134, null); // a second, contradictory ending must be ignored
    });

    const result = await decoder.decode(JOB);
    expect(result.decoderVersion).toBe('1.6.0');
  });

  it('hands the job to the child verbatim over the IPC seam', async () => {
    let seen: FakeChild | null = null;
    const decoder = new IsolatedGribDecoder({
      childModulePath: '/fake/grib-decode-child.js',
      forkImpl: () => {
        seen = new FakeChild((child) => {
          child.emit('message', OK_REPLY);
          child.emit('exit', 0, null);
        });
        return seen;
      },
    });

    await decoder.decode(JOB);
    expect(seen).not.toBeNull();
    expect((seen as unknown as FakeChild).sentJobs).toEqual([JOB]);
  });
});

describe('classifyDecodeCrash', () => {
  const crash = (
    exitCode: number | null,
    signal: string | null,
    timedOut = false,
  ): EcmwfDecodeCrashError => new EcmwfDecodeCrashError('x', exitCode, signal, timedOut);

  it('keeps the migration-evidence class strict: abort, fatal native signals, timeout, unknown exits', () => {
    expect(classifyDecodeCrash(crash(134, null))).toBe('panic'); // panic = abort
    expect(classifyDecodeCrash(crash(null, 'SIGABRT'))).toBe('panic');
    expect(classifyDecodeCrash(crash(null, 'SIGSEGV'))).toBe('panic');
    expect(classifyDecodeCrash(crash(null, null, true))).toBe('panic'); // hung child, SIGKILLed
    expect(classifyDecodeCrash(crash(1, null))).toBe('panic'); // unknown native death → evidence
  });

  it('separates OUR plumbing failures: protocol exits 0/2/3 and the fork/send/IPC-error paths', () => {
    expect(classifyDecodeCrash(crash(0, null))).toBe('ipc'); // healthy exit raced the reply
    expect(classifyDecodeCrash(crash(2, null))).toBe('ipc'); // no IPC channel
    expect(classifyDecodeCrash(crash(3, null))).toBe('ipc'); // reply send failed
    expect(classifyDecodeCrash(crash(null, null))).toBe('ipc'); // fork/send/IPC error, no child ending
  });

  it('separates external termination — a deploy must not read as a decoder panic', () => {
    expect(classifyDecodeCrash(crash(null, 'SIGTERM'))).toBe('interrupted');
    expect(classifyDecodeCrash(crash(null, 'SIGINT'))).toBe('interrupted');
  });
});
