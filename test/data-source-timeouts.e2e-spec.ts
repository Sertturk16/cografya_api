import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/data-source-options';

/**
 * EXECUTION proof for the pool timeouts (api rider plan §1.6, extended after review #86).
 *
 * `src/database/data-source-options.spec.ts` already pins that the numbers are emitted and that
 * they relate correctly. That is not the same claim as *"the number actually cuts a running
 * query"* — the gap between "configured" and "enforced" is exactly where a comment starts saying
 * more than the code delivers, which is the defect class this change exists to end. So this file
 * runs the real mechanisms against a real Postgres and demands the observable evidence back:
 *
 *  - the server-side `statement_timeout` cancels an over-running statement (`57014`) and leaves
 *    the very same backend connection reusable;
 *  - `connectionTimeoutMillis` also rejects a POOL-CHECKOUT waiter — the second, previously
 *    undeclared effect review #86 (CR86-I1) surfaced.
 *
 * Both use the TEST-ONLY overrides rather than the production values, so the proofs cost
 * seconds instead of tens of seconds. The mechanisms under test are identical: the same `extra`
 * block, the same `pg` startup parameter, the same `pg-pool` timers — only the values differ.
 *
 * One container, two DataSources: the two suites need incompatible pool shapes, not different
 * databases. No migrations, no seeds, no Nest app — these are driver/pool-level facts.
 */

/** Postgres SQLSTATE for a statement the server cancelled (`query_canceled`). */
const QUERY_CANCELED = '57014';

/** Low enough to keep the suite fast, high enough not to be flaky. */
const OVERRIDE_STATEMENT_TIMEOUT_MS = 1_000;

/** Await a promise and hand back whatever it rejected with, without letting jest's matchers hide the driver error. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (caught: unknown) => caught,
  );
}

/** Read a driver error's SQLSTATE without an `any` escaping into the assertions. */
function postgresErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const direct: unknown = (error as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  // TypeORM copies the driver error's own properties onto `QueryFailedError`, but read the
  // nested original too rather than depending on that copy staying in place.
  const driverError: unknown = (error as { driverError?: unknown }).driverError;
  if (typeof driverError !== 'object' || driverError === null) return null;
  const nested: unknown = (driverError as { code?: unknown }).code;
  return typeof nested === 'string' ? nested : null;
}

/** Which physical backend served this query — the pool's connection identity, observable. */
async function backendPid(dataSource: DataSource): Promise<number> {
  const rows: unknown = await dataSource.query('SELECT pg_backend_pid() AS pid');
  const pid: unknown = Array.isArray(rows)
    ? (rows[0] as { pid?: unknown } | undefined)?.pid
    : undefined;
  if (typeof pid !== 'number') throw new Error('pg_backend_pid() did not return a number');
  return pid;
}

let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
}, 180_000);

afterAll(async () => {
  if (container) await container.stop();
});

describe('DataSource statement timeout (e2e)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource(
      buildDataSourceOptions(container.getConnectionUri(), {
        statementTimeoutMs: OVERRIDE_STATEMENT_TIMEOUT_MS,
        // Exactly one connection, so "the connection came back" is a claim about a specific
        // backend rather than about whichever client the pool happened to hand out next.
        poolSize: 1,
      }),
    );
    await dataSource.initialize();
  }, 60_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('carries the statement timeout onto the SERVER session, not just into our config object', async () => {
    // `pg_settings.setting` is plain milliseconds, unlike `SHOW`, which renders in whatever unit
    // it likes ('1s', '1000ms'). That lets this assert the exact configured magnitude instead of
    // merely "not disabled", which would pass for a wrong value too (review #86 CR86-M1).
    const rows: unknown = await dataSource.query(
      "SELECT setting FROM pg_settings WHERE name = 'statement_timeout'",
    );
    const setting: unknown = Array.isArray(rows)
      ? (rows[0] as { setting?: unknown } | undefined)?.setting
      : undefined;

    expect(setting).toBe(String(OVERRIDE_STATEMENT_TIMEOUT_MS));
  });

  it('lets the server cancel a statement that outruns the ceiling', async () => {
    const started = Date.now();
    // Sleeps FAR past the ceiling on purpose: the cancel lands at ~1 s either way, so the
    // elapsed assertion below keeps seconds of headroom on a cold runner (review #86 CR86-M3).
    const error = await rejectionOf(dataSource.query('SELECT pg_sleep(30)'));
    const elapsedMs = Date.now() - started;

    expect(error).not.toBeNull();
    // The heart of the proof: `57014` can ONLY come from the server cancelling the statement.
    // A client-side `query_timeout` firing first would surface a different, driver-authored
    // error — which is why the client belt is configured strictly above the server deadline.
    expect(postgresErrorCode(error)).toBe(QUERY_CANCELED);
    // Cut mid-flight, nowhere near the 30 s the statement asked for.
    expect(elapsedMs).toBeLessThan(10_000);
  });

  it('returns the cancelled connection itself to the pool, still usable', async () => {
    // The reason the timeout exists at all: an unbounded query used to hold its pool connection
    // forever, and a drained pool hangs every public route. A cancel that poisoned the
    // connection would trade one stall for another, so this is asserted, not assumed.
    //
    // `pg_backend_pid()` makes it the STRONG claim (review #86 CR86-M2 / pr-test-analyzer): a
    // bare `SELECT 1` would also pass if pg had silently discarded the client and dialled a
    // fresh one, which is recovery of the pool, not of the connection.
    const before = await backendPid(dataSource);

    await rejectionOf(dataSource.query('SELECT pg_sleep(30)'));

    expect(await backendPid(dataSource)).toBe(before);
  });

  it('leaves a query that finishes inside the ceiling untouched', async () => {
    // The ceiling must not be a blunt instrument: normal work still completes.
    await expect(dataSource.query('SELECT pg_sleep(0.1)')).resolves.toBeDefined();
  });
});

/**
 * The SECOND effect of `connectionTimeoutMillis`, which the first revision of this PR set
 * without declaring: it is also `pg-pool`'s CHECKOUT ceiling (review #86 CR86-I1).
 *
 * Its own DataSource, because proving it requires a SATURATED pool — `poolSize: 1` plus a short
 * checkout window makes that deterministic and sub-second, where the production numbers (10
 * connections, 10 s) could only be reached by brute force.
 *
 * ONE COST OF THAT CHOICE, stated because this suite's whole subject is undeclared second effects
 * (review #86, confirm-leg MINOR 1): the same 500 ms also bounds the FIRST connection, the one
 * `initialize()` opens below. On a container whose handshake is slower than that — a cold or
 * heavily loaded runner — `beforeAll` fails rather than the test. That is the acceptable
 * direction: it fails LOUDLY and names the setup, where a longer window would blur the very
 * ceiling this block exists to measure. If it ever proves flaky, raise this constant; do not
 * reach for the assertions.
 */
describe('DataSource pool checkout ceiling (e2e)', () => {
  const CHECKOUT_TIMEOUT_MS = 500;
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource(
      buildDataSourceOptions(container.getConnectionUri(), {
        // Well above the sleep below: the subject here is the WAITER's fate, so the occupying
        // statement itself must not be the thing that gets cancelled.
        statementTimeoutMs: 30_000,
        connectionTimeoutMs: CHECKOUT_TIMEOUT_MS,
        poolSize: 1,
      }),
    );
    await dataSource.initialize();
  }, 60_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('rejects a waiter that cannot get a pooled connection, with a driver-generic error', async () => {
    // Occupy the only connection, then ask for a second one.
    const occupied = dataSource.query('SELECT pg_sleep(3)');
    const started = Date.now();
    const error = await rejectionOf(dataSource.query('SELECT 1'));
    const elapsedMs = Date.now() - started;

    expect(error).not.toBeNull();
    // Before this setting existed the waiter queued FOREVER; now it fails fast. The SHAPE is
    // the part worth pinning: pg-pool raises a plain `Error` with no SQLSTATE, so error
    // handling keyed on Postgres codes will never recognise it — a public route sees a generic
    // 500. That is the declared trade, and this is where it stops being prose.
    expect(postgresErrorCode(error)).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('timeout exceeded');
    expect(elapsedMs).toBeLessThan(3_000);

    await occupied;
  });
});
