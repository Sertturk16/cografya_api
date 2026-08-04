import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { SlowQueryLogger, truncateStatement } from './slow-query.logger';

/**
 * The slow-query path used to be dead code in this repo; `maxQueryExecutionTime` woke it up, and
 * review #86 (SFH-1/CR86-I2) showed what TypeORM's default handling would then emit — the full
 * bound-parameter array, through raw `console.log`, ungated. `SlowQueryLogger` exists to prevent
 * that, so its behaviour is pinned here rather than asserted in a docblock.
 *
 * These are STRUCTURAL assertions (CONVENTIONS §2): what the line may contain and what it may
 * never contain, not any particular query text.
 */
describe('SlowQueryLogger', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function captureWarn(): jest.SpiedFunction<Logger['warn']> {
    return jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  }

  it('reports the duration and the statement through the Nest logger', () => {
    const warn = captureWarn();

    new SlowQueryLogger().logQuerySlow(2_500, 'SELECT * FROM province WHERE plate_code = $1');

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain('2500');
    expect(line).toContain('FROM province');
  });

  it('cannot emit the bound parameters, because it never receives them', () => {
    const warn = captureWarn();
    const logger: unknown = new SlowQueryLogger();
    // Called the way TypeORM calls it — four arguments, parameters included. The override
    // declares only two, so the secret payload has nowhere to go. This asserts the property
    // structurally instead of trusting that nobody re-adds a parameter to the signature.
    (logger as { logQuerySlow: (...args: unknown[]) => void }).logQuerySlow(
      2_500,
      'INSERT INTO air_quality_province_series VALUES ($1)',
      [{ pm25: 'a-very-secret-payload' }],
      undefined,
    );

    // The subject must EXIST before it can be judged (review #86, confirm-leg MINOR 3). Without
    // these two lines the negatives below are vacuous: an override that emitted nothing at all
    // would leave `calls[0]?.[0]` undefined, `String(...)` would yield "undefined", and both
    // `not.toContain` assertions would pass while proving nothing. That is the worst possible
    // failure for a leak test — it stays green exactly when the logger has stopped working.
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain('INSERT INTO air_quality_province_series');

    expect(line).not.toContain('a-very-secret-payload');
    expect(line).not.toContain('PARAMETERS');
  });

  it('bounds the statement text and says how much it dropped', () => {
    const long = `SELECT ${'x'.repeat(5_000)} FROM province`;

    const truncated = truncateStatement(long);

    expect(truncated.length).toBeLessThan(long.length);
    // The reader must be able to tell a cut statement from a complete one.
    expect(truncated).toMatch(/… \(\+\d+ chars\)$/);
  });

  it('leaves a short statement intact, whitespace collapsed', () => {
    expect(truncateStatement('SELECT   1\n  FROM   province')).toBe('SELECT 1 FROM province');
  });
});
