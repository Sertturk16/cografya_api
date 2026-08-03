import { describe, expect, it } from '@jest/globals';
import {
  buildDataSourceOptions,
  DATABASE_STATEMENT_TIMEOUT_MS,
  type DataSourceTimeoutOverrides,
} from './data-source-options';
import { SlowQueryLogger } from './slow-query.logger';

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
  readonly max: number;
}

const POOL_EXTRA_KEYS = [
  'statement_timeout',
  'query_timeout',
  'connectionTimeoutMillis',
  'max',
] as const;

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
  for (const key of POOL_EXTRA_KEYS) {
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
    // Written down rather than inherited: the checkout ceiling's arithmetic depends on it
    // (review #86 CR86-I1).
    expect(extra.max).toBeGreaterThan(0);
  });

  it('installs the slow-query logger instead of the TypeORM default emitter', () => {
    const options: unknown = buildDataSourceOptions(TEST_URL);
    const logger: unknown = (options as { logger?: unknown }).logger;

    // Not a style preference: TypeORM's default would append the full bound parameter set to
    // the slow-query line, through raw console, ungated by `logging` (review #86 SFH-1).
    expect(logger).toBeInstanceOf(SlowQueryLogger);
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

  it('lets a test override lower the statement deadline, carrying the belt with it', () => {
    const overridden = poolExtra({ statementTimeoutMs: 1_000 });

    expect(overridden.statement_timeout).toBe(1_000);
    expect(overridden.statement_timeout).toBeLessThan(DATABASE_STATEMENT_TIMEOUT_MS);
    // The belt is DERIVED, so it moves with the deadline and keeps trailing it — that is what
    // makes an overridden run still prove a SERVER-side cancel (review #86 CR86-M4).
    expect(overridden.query_timeout).toBeGreaterThan(overridden.statement_timeout);
    expect(overridden.query_timeout).toBeLessThan(poolExtra().query_timeout);
    // Untouched fields keep their production values.
    expect(overridden.connectionTimeoutMillis).toBe(poolExtra().connectionTimeoutMillis);
    expect(overridden.max).toBe(poolExtra().max);
  });

  it('lets a test override the checkout ceiling and the pool size independently', () => {
    const overridden = poolExtra({
      statementTimeoutMs: 5_000,
      connectionTimeoutMs: 500,
      poolSize: 1,
    });

    expect(overridden.connectionTimeoutMillis).toBe(500);
    expect(overridden.max).toBe(1);
    // Overriding the pool knobs must not disturb the deadline pair.
    expect(overridden.query_timeout).toBeGreaterThan(overridden.statement_timeout);
  });
});
