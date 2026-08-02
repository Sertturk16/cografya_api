import { In, type DataSource } from 'typeorm';
import { AirQualityProvinceSeries } from './entities/air-quality-province-series.entity';
import { AirQualityRun, type AirQualityRunState } from './entities/air-quality-run.entity';

/**
 * The air-quality READ path's Postgres port — deliberately SEPARATE from
 * `AirQualityIngestStorePort` (A2b decision D-A2b-1).
 *
 * *Steel-man for reusing the ingest port:* adding two methods to it is the smaller diff, and both
 * ports read the same two tables.
 * *Counter-argument:* that port also carries `recordProduct`, `updateRun` and `pruneRuns`. Handing
 * it to a class that sits on a PUBLIC request path grants that class the ability to write and to
 * DELETE runs; the failure mode of a wrong call there is silent and destructive, and no test of
 * the read path would ever exercise it.
 *
 * > **Winner: a separate port — Because** the read path's authority is to read. The cost is one
 * > interface and one token; the gain is a structural security boundary (ENGINEERING §3), which
 * > is the kind of boundary this repo pays for on purpose.
 *
 * Both ports exist so the reader can be unit-tested against a fake while THIS implementation is
 * exercised against a real Postgres in e2e — the repo's mocks-don't-prove-storage rule.
 */

/**
 * The run states that may be SERVED (the entity's own vocabulary,
 * `air-quality-run.entity.ts` `AirQualityRunState`):
 *
 * - `serviceable` — the forecast landed, the analysis has not (yet). Publishes, `analysisEndUtc`
 *   null.
 * - `complete` — both products landed. The full promise.
 * - `degraded` — the forecast landed, the analysis failed terminally. Publishes, loudly, without
 *   its past half.
 *
 * `pending` (no rows written yet) and `abandoned` (the FORECAST failed terminally) are NEVER
 * served — an abandoned run's rows are either absent or superseded, and publishing them would
 * republish a run the ingest already disowned.
 */
export const SERVICEABLE_RUN_STATES: readonly AirQualityRunState[] = [
  'serviceable',
  'complete',
  'degraded',
];

/** One stored province series row, joined with the plate code it is published under. */
export interface AirQualityRunSeriesRow {
  readonly plateCode: string;
  readonly gridLatitude: number;
  readonly gridLongitude: number;
  readonly distanceKm: number;
  readonly concentrations: AirQualityProvinceSeries['concentrations'];
  readonly support: AirQualityProvinceSeries['support'];
  readonly analysisConcentrations: AirQualityProvinceSeries['analysisConcentrations'];
  readonly analysisSupport: AirQualityProvinceSeries['analysisSupport'];
  readonly ingestedAt: Date;
}

/** Injection token — consumers depend on the port, never on the class. */
export const AIR_QUALITY_READ_STORE = Symbol('AIR_QUALITY_READ_STORE');

/** The joined plate code, or `''` when the relation did not hydrate — see the call site. */
function plateCodeOf(entity: AirQualityProvinceSeries): string {
  const widened: { province?: { plateCode?: unknown } | null } = entity;
  const plateCode = widened.province?.plateCode;
  return typeof plateCode === 'string' ? plateCode : '';
}

export interface AirQualityReadStorePort {
  /** The newest run in a servable state, or `null` when none exists (the cold path). */
  newestServiceableRun(): Promise<AirQualityRun | null>;
  /** Every province series row of that run, joined to its plate code. */
  seriesForRun(runUtc: Date): Promise<AirQualityRunSeriesRow[]>;
}

/**
 * The Postgres implementation.
 *
 * ## Always the NEWEST servable run (A2b plan §4.2)
 * *Steel-man for preferring a `complete` older run:* yesterday's run kept the "last 24 hours"
 * promise, today's `serviceable` run has not yet.
 * *Counter-argument:* yesterday's run publishes "now" from a forecast made 24 hours ago.
 * > **Winner: the newest run — Because** freshness IS accuracy here, while the 24-hour promise is
 * > a presentation promise that shrinks honestly to `analysisEndUtc: null`. The window is about
 * > one hour a day.
 *
 * Marine's multi-candidate `selectPublishableCycle` race is deliberately NOT copied: there, several
 * cycles of one point compete with partial horizons. Here a run is written with all 81 rows in one
 * transaction — it either exists whole or does not exist — so a race would be machinery invented
 * for an ambiguity that cannot occur (YAGNI).
 *
 * No index is added: retention keeps at most 3 runs × 81 rows, so both queries are trivially served
 * by the primary keys.
 */
export class AirQualityReadStore implements AirQualityReadStorePort {
  constructor(private readonly dataSource: DataSource) {}

  async newestServiceableRun(): Promise<AirQualityRun | null> {
    const rows = await this.dataSource.getRepository(AirQualityRun).find({
      where: { state: In([...SERVICEABLE_RUN_STATES]) },
      order: { runUtc: 'DESC' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  async seriesForRun(runUtc: Date): Promise<AirQualityRunSeriesRow[]> {
    // ONE join rather than a second query per province, and a PROJECTED one: the plate code is the
    // only identity column this path needs from `provinces`. Slug, name and coordinates are
    // resolved separately per request (so a seed correction can never live on inside a cached
    // payload), and pulling the whole province row here would drag the fat `climate_normals` jsonb
    // across the wire 81 times to read 81 short strings.
    const rows = await this.dataSource
      .getRepository(AirQualityProvinceSeries)
      .createQueryBuilder('series')
      .innerJoin('series.province', 'province')
      // The primary key rides along so TypeORM can hydrate the relation object at all.
      .addSelect(['province.id', 'province.plateCode'])
      .where('series.runUtc = :runUtc', { runUtc })
      .orderBy('province.plateCode', 'ASC')
      .getMany();

    return rows.map((entity) => ({
      // Read through a WIDENED view: the entity type says `province` is always hydrated, but this
      // row came out of a query builder, and a projection that failed to map the relation would
      // otherwise throw on a public request path. An empty plate code is instead refused by the
      // compile's shape guard, which skips the row LOUDLY (`ingest.corrupt_row_skipped`) — the
      // failure stays visible rather than turning into an all-unavailable hub nobody counted.
      plateCode: plateCodeOf(entity),
      gridLatitude: entity.gridLatitude,
      gridLongitude: entity.gridLongitude,
      distanceKm: entity.distanceKm,
      concentrations: entity.concentrations,
      support: entity.support,
      analysisConcentrations: entity.analysisConcentrations,
      analysisSupport: entity.analysisSupport,
      ingestedAt: entity.ingestedAt,
    }));
  }
}
