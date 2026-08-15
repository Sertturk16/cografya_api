import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type ClosableDataSource, parsePhaseFlag, runCli, withDataSource } from './cli-support';

describe('runCli', () => {
  // `process.exitCode` is the REAL process's exit code, including Jest's. Saving and restoring it
  // around every case is what keeps a passing suite from exiting 1 because a test proved the
  // failure path works.
  let previousExitCode: typeof process.exitCode;
  let errors: unknown[][];

  beforeEach(() => {
    previousExitCode = process.exitCode;
    errors = [];
    jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.exitCode = previousExitCode;
  });

  it('leaves the exit code alone when the tool succeeds', async () => {
    process.exitCode = undefined;

    await runCli('db:seed:world', () => Promise.resolve());

    expect(process.exitCode).toBeUndefined();
    expect(errors).toHaveLength(0);
  });

  it('reports the failure under the tool label and sets exit code 1', async () => {
    const failure = new Error('DATABASE_URL must be set to run db:seed:world.');

    await runCli('db:seed:world', () => Promise.reject(failure));

    expect(process.exitCode).toBe(1);
    expect(errors).toEqual([['[db:seed:world] failed:', failure]]);
  });

  it('catches a SYNCHRONOUS throw too — an argument parser refuses before the first await', () => {
    // The reason the implementation awaits inside a `try` instead of chaining `.catch()`: a
    // parser that throws on argv never produces a promise for `.catch()` to attach to, and the
    // tool would crash with a stack trace instead of its own message.
    const refusal = new Error('Usage: pnpm db:import:marine-cmems --phase=probe (got "")');

    return expect(
      runCli('db:import:marine-cmems', () => {
        throw refusal;
      }),
    ).resolves.toBeUndefined();
  });

  it('never rejects, so a CLI can end on it without an unhandled rejection', async () => {
    await expect(runCli('x', () => Promise.reject(new Error('boom')))).resolves.toBeUndefined();
  });
});

describe('parsePhaseFlag', () => {
  const marinePoints = {
    accepted: ['probe', 'load'],
    usage: 'pnpm db:import:marine-points --phase=probe|load',
  } as const;

  it('accepts every phase the tool really has', () => {
    expect(parsePhaseFlag(['--phase=probe'], marinePoints)).toBe('probe');
    expect(parsePhaseFlag(['--phase=load'], marinePoints)).toBe('load');
  });

  it('finds the flag among other arguments', () => {
    expect(parsePhaseFlag(['--verbose', '--phase=load', '--raw-dir=/tmp'], marinePoints)).toBe(
      'load',
    );
  });

  it('REFUSES a missing phase rather than defaulting either way', () => {
    // Not a style preference: a default of the network phase puts a provider call in whatever
    // script forgets the argument, and any other default makes a typo silently skip the work.
    expect(() => parsePhaseFlag([], marinePoints)).toThrow(
      'Usage: pnpm db:import:marine-points --phase=probe|load (got "")',
    );
    expect(() => parsePhaseFlag(['--phase='], marinePoints)).toThrow('(got "")');
  });

  it('names the value it got, so a typo is visible in the refusal', () => {
    expect(() => parsePhaseFlag(['--phase=lod'], marinePoints)).toThrow('(got "lod")');
  });

  it('EXPLAINS a specifically refused value instead of printing usage at it', () => {
    // The two single-phase marine tools each answer "why not?", which a usage line cannot.
    const cmems = {
      accepted: ['probe'],
      usage: 'pnpm db:import:marine-cmems --phase=probe',
      rejected: {
        load: 'There is no load phase, and none is planned: M4 stores CMEMS values in Redis only.',
      },
    } as const;

    expect(() => parsePhaseFlag(['--phase=load'], cmems)).toThrow(
      'There is no load phase, and none is planned: M4 stores CMEMS values in Redis only.',
    );
    // An unrelated typo still gets the usage line.
    expect(() => parsePhaseFlag(['--phase=fetch'], cmems)).toThrow('Usage:');
  });

  it('does not mistake an inherited object property for a refusal message', () => {
    // `--phase=toString` reaches `Object.prototype.toString` through a plain record lookup; the
    // thrown Error's message would then be a stringified function.
    const withRejections = {
      accepted: ['probe'],
      usage: 'pnpm db:import:marine-cmems --phase=probe',
      rejected: { load: 'no load phase' },
    } as const;

    expect(() => parsePhaseFlag(['--phase=toString'], withRejections)).toThrow(
      'Usage: pnpm db:import:marine-cmems --phase=probe (got "toString")',
    );
  });
});

describe('withDataSource', () => {
  interface FakeSource extends ClosableDataSource {
    readonly calls: string[];
  }

  function fakeSource(overrides: { destroyFails?: boolean } = {}): FakeSource {
    const calls: string[] = [];
    return {
      calls,
      initialize: () => {
        calls.push('initialize');
        return Promise.resolve();
      },
      destroy: () => {
        calls.push('destroy');
        return overrides.destroyFails === true
          ? Promise.reject(new Error('connection already gone'))
          : Promise.resolve();
      },
    };
  }

  let errors: unknown[][];

  beforeEach(() => {
    errors = [];
    jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('initializes, runs the body, then destroys — in that order', async () => {
    const source = fakeSource();

    const result = await withDataSource('db:seed:geography', source, (handed) => {
      expect(handed).toBe(source);
      source.calls.push('body');
      return Promise.resolve({ inserted: 81 });
    });

    expect(result).toEqual({ inserted: 81 });
    expect(source.calls).toEqual(['initialize', 'body', 'destroy']);
    // The negative half. Without it, a helper that logged on EVERY teardown would pass this whole
    // file, since the two failure cases only assert `toHaveLength(1)`.
    expect(errors).toHaveLength(0);
  });

  it('waits for the body before destroying', async () => {
    // The reason the implementation writes `return await`: without the await, `finally` runs while
    // the body is still in flight and the connection is closed out from under it.
    const source = fakeSource();

    await withDataSource('db:seed:geography', source, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      source.calls.push('body-finished');
    });

    expect(source.calls).toEqual(['initialize', 'body-finished', 'destroy']);
  });

  it('destroys after a failing body and lets the ORIGINAL error propagate', async () => {
    const source = fakeSource();
    const seedFailure = new Error('province 34 violates a not-null constraint');

    await expect(
      withDataSource('db:seed:geography', source, () => Promise.reject(seedFailure)),
    ).rejects.toBe(seedFailure);

    expect(source.calls).toEqual(['initialize', 'destroy']);
  });

  it('never lets a teardown failure MASK the error that matters', async () => {
    // The whole reason for the nested try. A bare `finally` would replace the seed error with
    // "could not close the connection", and the operator would debug the wrong thing.
    const source = fakeSource({ destroyFails: true });
    const seedFailure = new Error('province 34 violates a not-null constraint');

    await expect(
      withDataSource('db:seed:geography', source, () => Promise.reject(seedFailure)),
    ).rejects.toBe(seedFailure);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.[0]).toBe('[db:seed:geography] failed to close the data source:');
  });

  it('reports a teardown-only failure but still returns the result', async () => {
    const source = fakeSource({ destroyFails: true });

    await expect(
      withDataSource('db:seed:geography', source, () => Promise.resolve('done')),
    ).resolves.toBe('done');

    expect(errors).toHaveLength(1);
  });

  it('does not swallow a failure to OPEN the connection, and does not try to close it', async () => {
    const failure = new Error('ECONNREFUSED');
    const source: ClosableDataSource = {
      initialize: () => Promise.reject(failure),
      destroy: () => Promise.reject(new Error('destroy must not be called')),
    };

    await expect(withDataSource('db:seed:world', source, () => Promise.resolve())).rejects.toBe(
      failure,
    );

    // The fake's `destroy` asserts an intent this case could not otherwise observe: its rejection
    // is exactly what the inner `catch` absorbs, so moving `initialize()` inside the `try` would
    // keep the line above green. The teardown log is the one thing that WOULD change — the sibling
    // case two above proves the spy fires when `destroy` rejects — so its absence is the real
    // assertion that `initialize` runs outside the `try`.
    expect(errors).toHaveLength(0);
  });
});
