import type { DataSourceOptions } from 'typeorm';
import { AirQualityProvinceSeries } from '../air-quality/entities/air-quality-province-series.entity';
import { AirQualityRun } from '../air-quality/entities/air-quality-run.entity';
import { AuthRateLimit } from '../auth/entities/auth-rate-limit.entity';
import { EmailVerificationCode } from '../auth/entities/email-verification-code.entity';
import { PasswordResetToken } from '../auth/entities/password-reset-token.entity';
import { Session } from '../auth/entities/session.entity';
import { User } from '../auth/entities/user.entity';
import { BookVideoQuestion } from '../book/entities/book-video-question.entity';
import { BookVideo } from '../book/entities/book-video.entity';
import { Book } from '../book/entities/book.entity';
import { YoutubeVideoSnapshot } from '../book/entities/youtube-video-snapshot.entity';
import { Country } from '../country/entities/country.entity';
import { EarthquakeEvent } from '../earthquake/entities/earthquake-event.entity';
import { EarthquakeIngestRun } from '../earthquake/entities/earthquake-ingest-run.entity';
import { MarineEcmwfCycle } from '../marine/entities/marine-ecmwf-cycle.entity';
import { MarineEcmwfPointSeries } from '../marine/entities/marine-ecmwf-point-series.entity';
import { MarinePoint } from '../marine/entities/marine-point.entity';
import { Province } from '../province/entities/province.entity';
import { District } from '../reference/entities/district.entity';
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
import { AddContinentAntarctica1785945600000 } from './migrations/1785945600000-AddContinentAntarctica';
import { AddCountryEntityType1785949200000 } from './migrations/1785949200000-AddCountryEntityType';
import { AddCountryDetailSections1785952800000 } from './migrations/1785952800000-AddCountryDetailSections';
import { AddProvinceClimateCurriculum1785974400000 } from './migrations/1785974400000-AddProvinceClimateCurriculum';
import { AddCountryPopulationSourceName1786060800000 } from './migrations/1786060800000-AddCountryPopulationSourceName';
import { InitEarthquakeEvents1786492800000 } from './migrations/1786492800000-InitEarthquakeEvents';
import { InitEarthquakeIngestRuns1786496400000 } from './migrations/1786496400000-InitEarthquakeIngestRuns';
import { InitBookCatalogue1786752000000 } from './migrations/1786752000000-InitBookCatalogue';
import { InitYoutubeVideoSnapshots1786755600000 } from './migrations/1786755600000-InitYoutubeVideoSnapshots';
import { AddProvincePm25Annual1787149250651 } from './migrations/1787149250651-AddProvincePm25Annual';
import { InitDistricts1787302800000 } from './migrations/1787302800000-InitDistricts';
import { InitUsers1787562000000 } from './migrations/1787562000000-InitUsers';
import { InitAuthSessions1787565600000 } from './migrations/1787565600000-InitAuthSessions';
import { SlowQueryLogger } from './slow-query.logger';

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
 * EVERY other consumer of this builder: production `pnpm migration:run`, the offline load CLIs
 * (`db:import:era5`, `db:seed:*`, the marine-points CLI) and every e2e's
 * migration run. A ceiling equal to the documented READ budget would kill a healthy but slow
 * WRITE and cost a whole ingest cycle. So the promise here is exactly *"no query hangs
 * forever"* — it is NOT *"every query finishes in 5 s"*.
 *
 * The consequence for those hand-run consumers is deliberate and LOUD, not silent: a data
 * migration whose single statement needs more than this is cancelled with `57014` inside its
 * transaction, so the migration fails and exits non-zero rather than half-applying. A future
 * migration or load phase that genuinely needs longer must be split into smaller statements —
 * that is a budget to design against, not a number to raise on reflex (review #86 SFH-2).
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

/**
 * `pg-pool`'s connection timeout — and it governs TWO different waits, which is easy to miss
 * and is stated here because this PR's own rule is that a comment may not deliver less than the
 * code (review #86 CR86-I1, verified in `pg-pool@3.14.0`):
 *
 *  1. **Connecting a NEW client** — a dead or unreachable DB host fails here instead of hanging
 *     on the OS TCP timeout (`Pool.newClient` destroys the socket after this window).
 *  2. **CHECKING OUT an existing pooled client** — when all `DATABASE_POOL_SIZE` connections are
 *     busy, `Pool.connect` arms a reject timer on the waiter. Before this setting existed the
 *     waiter queued FOREVER, so this is a real behaviour change: a request that cannot get a
 *     connection in this window now fails with pg-pool's own plain
 *     `Error('timeout exceeded when trying to connect')` — **no SQLSTATE, no `driverError`**,
 *     so nothing in our error handling recognises it specifically and it surfaces as a generic
 *     500 on a public read route.
 *
 * Failing fast is the right trade for a public read path — an unbounded checkout queue converts
 * one slow query into an indefinitely growing pile of hung requests, which is the same disease
 * `statement_timeout` treats one level down. But it is a CHANGE, so it is declared here and
 * proved in `test/data-source-timeouts.e2e-spec.ts` rather than discovered in production.
 */
const DATABASE_CONNECTION_TIMEOUT_MS = 10_000;

/**
 * Pool size, written down rather than inherited.
 *
 * It equals `pg-pool`'s current default (`max: 10`), so this line changes no behaviour today —
 * it exists because the checkout ceiling above is only readable next to it: N concurrent
 * statements can be in flight, and the (N+1)-th request waits at most
 * `DATABASE_CONNECTION_TIMEOUT_MS` before it is rejected. A number that arithmetic depends on
 * should not be an invisible library default (review #86 CR86-I1).
 */
const DATABASE_POOL_SIZE = 10;

/**
 * TypeORM's slow-query threshold — a LOG ONLY, it does NOT cancel the query.
 *
 * The option is widely mistaken for a timeout; it is not. TypeORM measures the execution time
 * and, when it exceeds this value, calls `logger.logQuerySlow` — nothing else happens to the
 * query. Three details, all read off TypeORM 1.0's source rather than assumed, and the third is
 * the one an earlier revision of this comment omitted (review #86 SFH-1/CR86-I2 — the omission
 * was the same defect class this file was written to end):
 *  - the line IS emitted even though this DataSource enables no query logging, because
 *    `AbstractLogger.isLogEnabledFor('query-slow')` returns `true` unconditionally. `logging:
 *    false` and `logging: []` do not gate it; only a custom logger does;
 *  - it only fires for a query that eventually SUCCEEDS past the threshold. A query the server
 *    cancels at `DATABASE_STATEMENT_TIMEOUT_MS` rejects instead, and is reported as a query
 *    error, not as a slow query;
 *  - **TypeORM's DEFAULT emitter would append the full bound parameter set** (`-- PARAMETERS:
 *    <JSON>`, `prepareLogMessages` defaults `appendParameterAsComment: true`), highlight the
 *    whole resulting string with a synchronous regex pass, and write it via raw `console.log`
 *    outside Nest's logger. Against `recordProduct`'s single 81-province insert that is ~400 KB
 *    per slow tour, unsuppressable — so this DataSource installs `SlowQueryLogger`, which
 *    reports duration + a truncated statement and structurally cannot reach the parameters.
 *
 * The threshold sits far BELOW the cancellation ceiling on purpose: it is the early warning
 * that lets us see a degrading query long before the ceiling ever has to fire.
 */
const DATABASE_SLOW_QUERY_LOG_MS = 2_000;

/**
 * Test-only override of the pool's ceilings.
 *
 * Its ONLY consumer is `test/data-source-timeouts.e2e-spec.ts`, which needs ceilings small
 * enough to prove — in seconds, against a real Postgres — that the cancellation and the
 * checkout rejection actually happen rather than merely being configured. Recorded as the price
 * of that proof, not as an abstraction (api rider plan §9-S3, Atlas-accepted): nothing in
 * production passes it.
 *
 * NAMED for what it holds, after review #86's confirm leg caught the previous name
 * (`DataSourceTimeoutOverrides`) claiming a category narrower than its contents: `poolSize` is a
 * pool SIZE, not a timeout, and it was added by that same PR. A type whose name excludes one of
 * its own fields is exactly the class of undeclared-second-effect defect this suite exists to
 * catch — so the name gives ground rather than the field.
 *
 * Each field replaces exactly one constant, and `statementTimeoutMs` also moves the DERIVED
 * `query_timeout` with it, since the client belt is defined relative to the server deadline —
 * so the override cannot accidentally invert the two (review #86 CR86-M4; an earlier wording
 * here claimed it moved "only the statement deadline", which was one word too strong).
 * `DATABASE_SLOW_QUERY_LOG_MS` is deliberately NOT overridable: the proofs are about
 * cancellation and checkout, and `SlowQueryLogger` is unit-tested directly.
 */
export interface DataSourceOverrides {
  readonly statementTimeoutMs: number;
  readonly connectionTimeoutMs?: number;
  readonly poolSize?: number;
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
 * The `extra` block is handed verbatim to the `pg` pool by TypeORM's postgres driver, merged
 * LAST over the driver's own connection options. Two of those keys have a TypeORM spelling as
 * well (`connectTimeoutMS` → `connectionTimeoutMillis`, `poolSize` → `max`); we set the pg names
 * in `extra` so all four pool numbers read as one block instead of being split across two option
 * namespaces, and because `extra` merging last means these are the values that survive either
 * way. Nothing sets the TypeORM spellings today — the note is here so the next person who reaches
 * for them knows they would be shadowed.
 */
export function buildDataSourceOptions(
  url: string,
  overrides?: DataSourceOverrides,
): DataSourceOptions {
  const statementTimeoutMs = overrides?.statementTimeoutMs ?? DATABASE_STATEMENT_TIMEOUT_MS;
  const connectionTimeoutMs = overrides?.connectionTimeoutMs ?? DATABASE_CONNECTION_TIMEOUT_MS;
  const poolSize = overrides?.poolSize ?? DATABASE_POOL_SIZE;
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
      EarthquakeEvent,
      EarthquakeIngestRun,
      Book,
      BookVideo,
      BookVideoQuestion,
      YoutubeVideoSnapshot,
      District,
      User,
      Session,
      EmailVerificationCode,
      PasswordResetToken,
      AuthRateLimit,
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
      AddContinentAntarctica1785945600000,
      AddCountryEntityType1785949200000,
      AddCountryDetailSections1785952800000,
      AddProvinceClimateCurriculum1785974400000,
      AddCountryPopulationSourceName1786060800000,
      InitEarthquakeEvents1786492800000,
      InitEarthquakeIngestRuns1786496400000,
      InitBookCatalogue1786752000000,
      InitYoutubeVideoSnapshots1786755600000,
      AddProvincePm25Annual1787149250651,
      InitDistricts1787302800000,
      InitUsers1787562000000,
      InitAuthSessions1787565600000,
    ],
    extra: {
      statement_timeout: statementTimeoutMs,
      query_timeout: statementTimeoutMs + DATABASE_QUERY_TIMEOUT_MARGIN_MS,
      connectionTimeoutMillis: connectionTimeoutMs,
      max: poolSize,
    },
    maxQueryExecutionTime: DATABASE_SLOW_QUERY_LOG_MS,
    // Not cosmetic: without it TypeORM's default logger emits the slow-query line with the full
    // bound-parameter set, via raw console. See `SlowQueryLogger`.
    logger: new SlowQueryLogger(),
    synchronize: false,
    migrationsRun: false,
  };
}
