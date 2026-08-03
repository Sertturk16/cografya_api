import { Logger } from '@nestjs/common';
import { AdvancedConsoleLogger } from 'typeorm';

/**
 * How much of the offending statement the slow-query line may carry.
 *
 * Enough to identify WHICH query is degrading (the table and the shape are in the first
 * clause), short enough that the log line can never become the incident. The remainder is
 * reported as a character count, so a reader can see that the statement was truncated rather
 * than wonder whether it really ended there.
 */
const SLOW_QUERY_STATEMENT_MAX_CHARS = 500;

/**
 * The DataSource logger, installed for exactly ONE reason: to take TypeORM's slow-query line
 * away from TypeORM (review #86 SFH-1/CR86-I2).
 *
 * ## Why an override is required, not merely nicer
 * Setting `maxQueryExecutionTime` activates a path that is otherwise dead, and TypeORM 1.0's
 * default handling of it cannot be configured away:
 *  - `AbstractLogger.isLogEnabledFor('query-slow')` returns `true` unconditionally, so
 *    `logging: false` / `logging: []` does NOT gate it — the only escape is a custom logger;
 *  - `AdvancedConsoleLogger.writeLog` emits it through `PlatformTools.logWarn`, i.e. raw
 *    `console.log` — outside Nest's logger, its levels, and any throttling we own;
 *  - `prepareLogMessages` defaults `appendParameterAsComment: true`, so the FULL bound
 *    parameter array is appended as `-- PARAMETERS: <JSON>`, and then `highlightSql` runs a
 *    synchronous regex pass over the whole resulting string.
 *
 * With our real emitters that is not theoretical: `AirQualityIngestStore.recordProduct` writes
 * all 81 provinces in ONE insert whose parameters are ~400 KB of jsonb. A tour that crosses the
 * threshold would dump all of it to stdout and burn the event loop highlighting it — every
 * tour, unsuppressable, exactly while the system is already degrading.
 *
 * ## What this class does instead
 * It overrides `logQuerySlow` with a signature that **does not even receive the parameters**,
 * which is the point: not logging the bound values is structural here, not a discipline someone
 * has to remember. It reports the duration and a truncated statement through Nest's `Logger`,
 * so the line lands in the same stream, with the same level and context handling, as every
 * other operational log this service writes.
 *
 * Everything else is deliberately unchanged: it extends `AdvancedConsoleLogger` and passes no
 * logger options, so every OTHER channel (query, query-error, schema, migration) keeps exactly
 * the behaviour this repo had before, which was silence.
 *
 * KVKK note (ENGINEERING §3.6): values live in bound parameters, and this line never carries
 * them. The truncated statement text is schema, not data. Any future personal-data table
 * inherits that property for free — provided its values keep travelling as parameters.
 */
export class SlowQueryLogger extends AdvancedConsoleLogger {
  private readonly logger = new Logger('SlowQuery');

  /**
   * Deliberately narrower than the base signature: TypeORM calls this with
   * `(time, query, parameters, queryRunner)`, and a method that declares fewer parameters is
   * still a valid override — so the bound values are unreachable from inside this method.
   */
  override logQuerySlow(time: number, query: string): void {
    this.logger.warn(`slow query (${time} ms): ${truncateStatement(query)}`);
  }
}

/** Bound the statement text, and say so when it was cut rather than letting it look complete. */
export function truncateStatement(query: string): string {
  const collapsed = query.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= SLOW_QUERY_STATEMENT_MAX_CHARS) return collapsed;
  const omitted = collapsed.length - SLOW_QUERY_STATEMENT_MAX_CHARS;
  return `${collapsed.slice(0, SLOW_QUERY_STATEMENT_MAX_CHARS)}… (+${omitted} chars)`;
}
