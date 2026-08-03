import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/data-source-options';

/**
 * EXECUTION proof for the pool-wide statement timeout (api rider plan §1.6).
 *
 * `src/database/data-source-options.spec.ts` already pins that the numbers are emitted and that
 * they relate correctly. That is not the same claim as *"the number actually cuts a running
 * query"* — the gap between "configured" and "enforced" is exactly where a comment starts saying
 * more than the code delivers, which is the defect class this change exists to end. So this
 * suite runs a genuinely over-running statement against a real Postgres and demands the server's
 * own cancellation code back.
 *
 * It uses the TEST-ONLY override (1 s) rather than the production ceiling, so the proof costs
 * ~2 s instead of ~30 s. The mechanism under test is identical: the same `extra` block, the same
 * `pg` startup parameter, the same server-side cancellation — only the value differs.
 *
 * No migrations, no seeds, no Nest app: this is a driver/pool-level fact.
 */

/** Postgres SQLSTATE for a statement the server cancelled (`query_canceled`). */
const QUERY_CANCELED = '57014';

/** The override used throughout: low enough to keep the suite fast, high enough not to be flaky. */
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

describe('DataSource pool timeouts (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource(
      buildDataSourceOptions(container.getConnectionUri(), {
        statementTimeoutMs: OVERRIDE_STATEMENT_TIMEOUT_MS,
      }),
    );
    await dataSource.initialize();
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (container) await container.stop();
  });

  it('carries the statement timeout onto the SERVER session, not just into our config object', async () => {
    const rows: unknown = await dataSource.query('SHOW statement_timeout');
    const shown: unknown = Array.isArray(rows)
      ? (rows[0] as { statement_timeout?: unknown } | undefined)?.statement_timeout
      : undefined;

    expect(typeof shown).toBe('string');
    // Postgres renders the setting in its own units ('1s', '1000ms'), so the assertion is the
    // one that matters and cannot drift with the rendering: it is NOT disabled.
    expect(shown).not.toBe('0');
  });

  it('lets the server cancel a statement that outruns the ceiling', async () => {
    const started = Date.now();
    const error = await rejectionOf(dataSource.query('SELECT pg_sleep(2)'));
    const elapsedMs = Date.now() - started;

    expect(error).not.toBeNull();
    // The heart of the proof: `57014` can ONLY come from the server cancelling the statement.
    // A client-side `query_timeout` firing first would surface a different, driver-authored
    // error — which is why the client belt is configured strictly above the server deadline.
    expect(postgresErrorCode(error)).toBe(QUERY_CANCELED);
    // It was cut mid-flight rather than allowed to run its full 2 s.
    expect(elapsedMs).toBeLessThan(2_000);
  });

  it('returns the cancelled connection to the pool, still usable', async () => {
    // The reason the timeout exists at all: an unbounded query used to hold its pool connection
    // forever, and a drained pool hangs every public route. A cancel that poisoned the
    // connection would trade one stall for another, so this is asserted, not assumed.
    await rejectionOf(dataSource.query('SELECT pg_sleep(2)'));

    const rows: unknown = await dataSource.query('SELECT 1 AS ok');
    expect(Array.isArray(rows)).toBe(true);
  });

  it('leaves a query that finishes inside the ceiling untouched', async () => {
    // The ceiling must not be a blunt instrument: normal work still completes.
    await expect(dataSource.query('SELECT pg_sleep(0.1)')).resolves.toBeDefined();
  });
});
