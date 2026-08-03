import { describe, expect, it } from '@jest/globals';
import {
  buildDataSourceOptions,
  DATABASE_STATEMENT_TIMEOUT_MS,
  type DataSourceTimeoutOverrides,
} from './data-source-options';

/**
 * Structural pins for the pool-wide timeouts (api rider plan §1.6). No database is needed here:
 * this suite asserts the SHAPE handed to the `pg` pool. The proof that the ceiling actually
 * cancels a running query lives in `test/data-source-timeouts.e2e-spec.ts`, against a real
 * Postgres — the two are deliberately different questions.
 *
 * Per CONVENTIONS §2 the assertions pin RELATIONS, not values: retuning a timeout is an
 * operational decision, but a retune that inverts `query_timeout` and `statement_timeout`, or
 * that pushes the slow-query log above the cancellation ceiling, is a defect in every possible
 * tuning. Copying the literal milliseconds in here would only pin that someone typed the same
 * number twice.
 */

const TEST_URL = 'postgresql://user:pass@localhost:5432/db';

interface PoolExtra {
  readonly statement_timeout: number;
  readonly query_timeout: number;
  readonly connectionTimeoutMillis: number;
}

/**
 * TypeORM types `extra` as `any`, so it is narrowed here through explicit runtime checks
 * rather than an assertion: a key that stops being emitted must fail this suite loudly instead
 * of surfacing later as `undefined` inside the pool, which is precisely the silent-hole class
 * this whole change exists to close.
 */
function poolExtra(overrides?: DataSourceTimeoutOverrides): PoolExtra {
  const options: unknown = buildDataSourceOptions(TEST_URL, overrides);
  const extra: unknown = (options as { extra?: unknown }).extra;
  if (typeof extra !== 'object' || extra === null) {
    throw new Error('buildDataSourceOptions did not emit a pool `extra` block');
  }
  const record = extra as Record<string, unknown>;
  for (const key of ['statement_timeout', 'query_timeout', 'connectionTimeoutMillis']) {
    if (typeof record[key] !== 'number') {
      throw new Error(`pool \`extra.${key}\` is not a number`);
    }
  }
  return extra as PoolExtra;
}

function maxQueryExecutionTime(): number {
  const options: unknown = buildDataSourceOptions(TEST_URL);
  const value: unknown = (options as { maxQueryExecutionTime?: unknown }).maxQueryExecutionTime;
  if (typeof value !== 'number') throw new Error('`maxQueryExecutionTime` is not a number');
  return value;
}

describe('buildDataSourceOptions — pool timeouts', () => {
  it('hands every timeout key to the pg pool', () => {
    const extra = poolExtra();

    // `poolExtra` already refuses a missing/non-numeric key; these assert they are usable
    // values rather than the `0`/`false` that `pg` reads as "no timeout at all".
    expect(extra.statement_timeout).toBeGreaterThan(0);
    expect(extra.query_timeout).toBeGreaterThan(0);
    expect(extra.connectionTimeoutMillis).toBeGreaterThan(0);
  });

  it('publishes the documented constant as the server-side ceiling', () => {
    // Not a literal: it pins that the CONSTANT the docblock describes is the value that
    // actually reaches the pool, so retuning the constant retunes the pool.
    expect(poolExtra().statement_timeout).toBe(DATABASE_STATEMENT_TIMEOUT_MS);
  });

  it('keeps the client-side belt strictly above the server-side deadline', () => {
    const extra = poolExtra();

    // If the client belt fired first, every ordinary slow query would be pre-empted in-process
    // and we would lose the server's `57014` and the connection with it.
    expect(extra.query_timeout).toBeGreaterThan(extra.statement_timeout);
  });

  it('keeps the slow-query LOG threshold below the cancellation ceiling', () => {
    // `maxQueryExecutionTime` only logs — it never cancels. Below the ceiling it is an early
    // warning; above it, it could never fire at all, because a cancelled query rejects.
    expect(maxQueryExecutionTime()).toBeLessThan(poolExtra().statement_timeout);
  });

  it('lets a test override lower ONLY the statement deadline, margin intact', () => {
    const overridden = poolExtra({ statementTimeoutMs: 1_000 });

    expect(overridden.statement_timeout).toBe(1_000);
    expect(overridden.statement_timeout).toBeLessThan(DATABASE_STATEMENT_TIMEOUT_MS);
    // The belt still trails the deadline, so the override still proves a SERVER-side cancel.
    expect(overridden.query_timeout).toBeGreaterThan(overridden.statement_timeout);
    expect(overridden.connectionTimeoutMillis).toBe(poolExtra().connectionTimeoutMillis);
  });
});
