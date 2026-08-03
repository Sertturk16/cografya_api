import type { DataSourceOptions } from 'typeorm';
import { AirQualityProvinceSeries } from '../air-quality/entities/air-quality-province-series.entity';
import { AirQualityRun } from '../air-quality/entities/air-quality-run.entity';
import { Country } from '../country/entities/country.entity';
import { MarineEcmwfCycle } from '../marine/entities/marine-ecmwf-cycle.entity';
import { MarineEcmwfPointSeries } from '../marine/entities/marine-ecmwf-point-series.entity';
import { MarinePoint } from '../marine/entities/marine-point.entity';
import { Province } from '../province/entities/province.entity';
import { InitProvince1783382400000 } from './migrations/1783382400000-InitProvince';
import { AddProvinceClimateNote1783513986800 } from './migrations/1783513986800-AddProvinceClimateNote';
import { AddProvinceDetailSections1783701664849 } from './migrations/1783701664849-AddProvinceDetailSections';
import { InitCountry1784001600000 } from './migrations/1784001600000-InitCountry';
import { AddCountryHydrographyNote1784102400000 } from './migrations/1784102400000-AddCountryHydrographyNote';
import { AddCountrySovereigntyNote1784188800000 } from './migrations/1784188800000-AddCountrySovereigntyNote';
import { AddProvinceClimateNormals1784620800000 } from './migrations/1784620800000-AddProvinceClimateNormals';
import { InitMarinePoints1785369600000 } from './migrations/1785369600000-InitMarinePoints';
import { InitMarineEcmwfStore1785686400000 } from './migrations/1785686400000-InitMarineEcmwfStore';
import { InitAirQualityStore1785859200000 } from './migrations/1785859200000-InitAirQualityStore';

/**
 * Pool-wide server-side query deadline, in milliseconds.
 *
 * A documented CODE CONSTANT, not an env variable (Atlas ruling → api rider plan §9-S2, the
 * same class as A2b plan Q1): an operator turning this dial would be choosing between "a local
 * query that hangs for 30 s" and "a local query that hangs for 20 s", which is not a real
 * operational choice, and the repo's rule is to not build knobs for scenarios nobody expects.
 *
 * ## What it actually does
 * `pg` sends `statement_timeout` as a startup parameter on every pooled connection, so POSTGRES
 * cancels an over-running statement (SQLSTATE `57014`, `query_canceled`) and hands the
 * connection straight back to the pool. That is the whole point: before this, a stalled query
 * held a pool connection FOREVER, and once the pool drained every public route hung with it.
 *
 * ## Why 30 s and not the 5 s read budget
 * This one pool also carries the ingest writes (`AirQualityIngestStore.recordProduct` writes 81
 * provinces of jsonb per tour, `EcmwfIngestStore` writes step by step, `pruneRuns` deletes) and
 * every e2e's migration run. A ceiling equal to the documented READ budget would kill a healthy
 * but slow WRITE and cost a whole ingest cycle. So the promise here is exactly *"no query hangs
 * forever"* — it is NOT *"every query finishes in 5 s"*.
 */
export const DATABASE_STATEMENT_TIMEOUT_MS = 30_000;

/**
 * How far the CLIENT-side belt sits above the server-side deadline.
 *
 * `query_timeout` is enforced by `pg` in this process; `statement_timeout` is enforced by the
 * server. The client belt exists for the case the server can never answer at all (a network
 * black hole: the cancel notice would never arrive either), so it must fire strictly LATER —
 * otherwise it would pre-empt the server on every ordinary slow query and we would lose the
 * clean `57014` signal, plus the connection would be destroyed rather than reused.
 */
const DATABASE_QUERY_TIMEOUT_MARGIN_MS = 5_000;

/** Bounds `pg`'s connect step, so a dead/unreachable DB host fails fast instead of waiting on the OS TCP timeout. */
const DATABASE_CONNECTION_TIMEOUT_MS = 10_000;

/**
 * TypeORM's slow-query threshold — a LOG ONLY, it does NOT cancel the query.
 *
 * The option is widely mistaken for a timeout; it is not. TypeORM measures the execution time
 * and, when it exceeds this value, calls `logger.logQuerySlow` — nothing else happens to the
 * query. Two honest details, both read off TypeORM 1.0's source rather than assumed:
 *  - the line IS emitted even though this DataSource enables no query logging, because
 *    `AbstractLogger.isLogEnabledFor('query-slow')` returns `true` unconditionally;
 *  - it only fires for a query that eventually SUCCEEDS past the threshold. A query the server
 *    cancels at `DATABASE_STATEMENT_TIMEOUT_MS` rejects instead, and is reported as a query
 *    error, not as a slow query.
 *
 * It sits far BELOW the cancellation ceiling on purpose: it is the early warning that lets us
 * see a degrading query long before the ceiling ever has to fire.
 */
const DATABASE_SLOW_QUERY_LOG_MS = 2_000;

/**
 * Test-only override of the pool timeouts.
 *
 * Its ONLY consumer is `test/data-source-timeouts.e2e-spec.ts`, which needs a ceiling small
 * enough to prove — in ~2 s, against a real Postgres — that the cancellation actually happens
 * rather than merely being configured. Recorded as the price of that proof, not as an
 * abstraction (api rider plan §9-S3, Atlas-accepted): nothing in production passes it, and it
 * deliberately moves ONLY the statement deadline — `DATABASE_SLOW_QUERY_LOG_MS` keeps its
 * production value, since the proof is about cancellation, not about the slow-query log.
 */
export interface DataSourceTimeoutOverrides {
  readonly statementTimeoutMs: number;
}

/**
 * Single source of truth for the TypeORM connection shape. Consumed by:
 *  - the Nest app (`TypeOrmModule.forRootAsync`),
 *  - the e2e tests (a standalone `DataSource` pointed at a Testcontainers PG),
 *  - the migration CLI (`src/database/data-source.ts` → compiled `dist/…`).
 *
 * Entities and migrations are listed EXPLICITLY (no globs): explicit imports
 * resolve identically whether the code runs from TS (ts-jest) or compiled JS
 * (`node dist/…`), avoiding the classic `.ts`/`.js` glob-path drift. It also
 * matches the hand-review discipline — every new migration is added here on
 * purpose, never auto-discovered.
 *
 * `synchronize` is always false: schema changes ship as reviewed migrations.
 *
 * The `extra` block is handed verbatim to the `pg` pool by TypeORM's postgres driver (it is
 * merged LAST over the driver's own connection options, so `connectionTimeoutMillis` set here
 * is the one that wins over TypeORM's `connectTimeoutMS` spelling — we keep all three timeouts
 * in one block rather than splitting them across two option namespaces).
 */
export function buildDataSourceOptions(
  url: string,
  timeouts?: DataSourceTimeoutOverrides,
): DataSourceOptions {
  const statementTimeoutMs = timeouts?.statementTimeoutMs ?? DATABASE_STATEMENT_TIMEOUT_MS;
  return {
    type: 'postgres',
    url,
    entities: [
      Province,
      Country,
      MarinePoint,
      MarineEcmwfCycle,
      MarineEcmwfPointSeries,
      AirQualityRun,
      AirQualityProvinceSeries,
    ],
    migrations: [
      InitProvince1783382400000,
      AddProvinceClimateNote1783513986800,
      AddProvinceDetailSections1783701664849,
      InitCountry1784001600000,
      AddCountryHydrographyNote1784102400000,
      AddCountrySovereigntyNote1784188800000,
      AddProvinceClimateNormals1784620800000,
      InitMarinePoints1785369600000,
      InitMarineEcmwfStore1785686400000,
      InitAirQualityStore1785859200000,
    ],
    extra: {
      statement_timeout: statementTimeoutMs,
      query_timeout: statementTimeoutMs + DATABASE_QUERY_TIMEOUT_MARGIN_MS,
      connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
    },
    maxQueryExecutionTime: DATABASE_SLOW_QUERY_LOG_MS,
    synchronize: false,
    migrationsRun: false,
  };
}
