import { type DataSource } from 'typeorm';
import { Province } from '../province/entities/province.entity';
import { EarthquakeEvent } from './entities/earthquake-event.entity';
import { EarthquakeIngestRun } from './entities/earthquake-ingest-run.entity';

/**
 * The earthquake READ path's Postgres port — deliberately SEPARATE from
 * `EarthquakeIngestStorePort` (the air-quality D-A2b-1 decision, same reasoning).
 *
 * *Steel-man for reusing the ingest port:* four methods on an existing interface is the smaller
 * diff, and both ports read the same two tables.
 * *Counter-argument:* that port also carries `upsertEvent`, `recordRun` and **`pruneRuns`, which
 * DELETEs**. Handing it to a class that sits on a public, unauthenticated request path grants that
 * class the authority to write and to delete; the failure mode of a wrong call there is silent and
 * destructive, and no test of the read path would ever exercise it.
 *
 * > **Winner: a separate port — Because** the read path's authority is to read. The cost is one
 * > interface and one token; the gain is a structural security boundary (`ENGINEERING.md` §3),
 * > which is the kind of boundary this repo pays for deliberately.
 *
 * Both ports exist so the reader can be unit-tested against a fake while THIS implementation is
 * exercised against a real Postgres in e2e — the repo's mocks-don't-prove-storage rule.
 */

/** The filter one list request resolves to, defaults already applied. */
export interface EarthquakeListFilter {
  readonly minMagnitude: number;
  readonly fromUtc: Date;
  readonly toUtc: Date;
  /** Plate code on the province path; `null` on the hub. */
  readonly plateCode: string | null;
  readonly page: number;
  readonly pageSize: number;
}

/** One page plus the count of everything the same filter matches. */
export interface EarthquakePage {
  readonly rows: EarthquakeEvent[];
  readonly total: number;
}

export interface EarthquakeReadStorePort {
  /** One page of servable events, newest first, with the total behind the same filter. */
  findPage(filter: EarthquakeListFilter): Promise<EarthquakePage>;
  /**
   * Finish time of the newest ingest tour that succeeded AND stored something, or null when there
   * has never been one.
   */
  newestSuccessfulRunFinishedAt(): Promise<Date | null>;
  /**
   * Whether the store holds ANY servable row — store-wide, never per province.
   *
   * Separate from {@link latestEventOccurredAt} on purpose: this one answers the freshness
   * derivation's "do we hold anything", and it must not narrow to the province being requested.
   */
  hasAnyServableRow(): Promise<boolean>;
  /**
   * Origin time of the newest servable event, scoped to the PATH's universe (all in-scope rows on
   * the hub, that province's in-scope rows on the province path) and NOT to the request's filter.
   */
  latestEventOccurredAt(plateCode: string | null): Promise<Date | null>;
  /** Whether any province carries this plate code — the single 404 decision on this leg. */
  provinceExists(plateCode: string): Promise<boolean>;
}

/** Injection token — consumers depend on the port, never on the class. */
export const EARTHQUAKE_READ_STORE = Symbol('EARTHQUAKE_READ_STORE');

/**
 * The Postgres implementation.
 *
 * ## `in_scope` is applied in EVERY query here, without exception
 * An out-of-scope row is stored (D-C keeps everything so "show all" finds real data) and is
 * servable on no public path. It must therefore be excluded from the page, from `total` and from
 * the newest-event probe alike — a `total` that counted rows the list cannot show would be a
 * pagination contract that never terminates.
 *
 * ## The ordering is part of the contract, not a default
 * `occurred_at_utc DESC, provider_event_id DESC`. The tie-break is what keeps offset pagination
 * from showing one row on two pages, and it matches `IDX_earthquake_events_scope_time` exactly.
 * The province path's index stops at the timestamp, so equal timestamps there cost a small sort
 * node — accepted rather than paid for with a migration this PR has no other reason to ship.
 *
 * ## No new index, and no Redis
 * The read path is Postgres-only by SPEC §7.4: the query set is indexed and the corpus is ~33 000
 * rows a year, so a second cache layer would buy invalidation complexity for free. Escalate to
 * Atlas if traffic ever argues otherwise (`ENGINEERING.md` §12).
 */
export class EarthquakeReadStore implements EarthquakeReadStorePort {
  constructor(private readonly dataSource: DataSource) {}

  async findPage(filter: EarthquakeListFilter): Promise<EarthquakePage> {
    const query = this.dataSource
      .getRepository(EarthquakeEvent)
      .createQueryBuilder('event')
      .where('event.inScope = true')
      .andWhere('event.magnitude >= :minMagnitude', { minMagnitude: filter.minMagnitude })
      // Both bounds inclusive, matching the window the ingest itself queries and the instants the
      // response echoes back.
      .andWhere('event.occurredAtUtc >= :fromUtc', { fromUtc: filter.fromUtc })
      .andWhere('event.occurredAtUtc <= :toUtc', { toUtc: filter.toUtc });

    if (filter.plateCode !== null) {
      query.andWhere('event.bindingPlateCode = :plateCode', { plateCode: filter.plateCode });
    }

    const [rows, total] = await query
      .orderBy('event.occurredAtUtc', 'DESC')
      .addOrderBy('event.providerEventId', 'DESC')
      .skip((filter.page - 1) * filter.pageSize)
      .take(filter.pageSize)
      .getManyAndCount();

    return { rows, total };
  }

  /**
   * ## `outcome = 'ok'` is NOT sufficient, and the ingest says so itself
   * `EarthquakeIngestTarget.diagnoseTour` records "the provider returned N rows and the parser
   * accepted none" as `outcome: 'ok'` WITH a non-null `error_reason` — the outcome word describes
   * the CALL, which really did succeed, while the reason records that nothing landed. Its docblock
   * names this consumer as the reason that state exists: the ledger is the freshness anchor, so the
   * two ways a tour can do all its work and store nothing must not both read as a clean success
   * (review #118 CODE118-I2/SFH118-I2).
   *
   * Reading the outcome alone put one of them back: a field renamed upstream would have every tour
   * reject all ~600 rows, refresh this anchor every 300 s, and let the hub keep publishing
   * `dataStatus: 'ok'` with a five-minute-old `dataUpdatedAtUtc` over a list frozen at the break —
   * with a CDN republishing that claim, and only a server-side log line to show for it
   * (review #121 SFH121-I1). `error_reason IS NULL` is the read-side discriminator; the ledger
   * carries no `unchanged_count`, so counts cannot substitute (a healthy reconcile tour legitimately
   * stores nothing new).
   *
   * **This predicate is paired with `EarthquakeIngestStore.pruneRuns`'s retention exemption and the
   * two must not drift.** That subquery exists solely to keep this row alive past its retention
   * window; if it protects a different row, retention deletes the anchor mid-incident and this
   * method starts answering `null` — see the invariant written at that call site.
   */
  async newestSuccessfulRunFinishedAt(): Promise<Date | null> {
    // Written as a query rather than `find({ order })` so the partial index
    // `IDX_earthquake_ingest_runs_ok_finished` is matched by its own predicate.
    const row = await this.dataSource
      .getRepository(EarthquakeIngestRun)
      .createQueryBuilder('run')
      .select('MAX(run.finishedAtUtc)', 'finishedAt')
      .where("run.outcome = 'ok'")
      .andWhere('run.errorReason IS NULL')
      .andWhere('run.finishedAtUtc IS NOT NULL')
      .getRawOne<{ finishedAt: Date | null }>();

    return row?.finishedAt ?? null;
  }

  async hasAnyServableRow(): Promise<boolean> {
    // `LIMIT 1` rather than a COUNT: the question is existence, and counting a growing archive to
    // answer it would get slower every year for no gain. Served by
    // `IDX_earthquake_events_scope_time`, whose LEADING column is `in_scope` — a plain three-column
    // index, not a partial one. (The partial index on this table is
    // `IDX_earthquake_events_plate_time`, which this query cannot use: it has no plate predicate.)
    const row = await this.dataSource
      .getRepository(EarthquakeEvent)
      .createQueryBuilder('event')
      .select('1', 'present')
      .where('event.inScope = true')
      .limit(1)
      .getRawOne<{ present: number }>();

    return row !== undefined;
  }

  async latestEventOccurredAt(plateCode: string | null): Promise<Date | null> {
    const query = this.dataSource
      .getRepository(EarthquakeEvent)
      .createQueryBuilder('event')
      .select('MAX(event.occurredAtUtc)', 'occurredAt')
      .where('event.inScope = true');

    if (plateCode !== null) {
      query.andWhere('event.bindingPlateCode = :plateCode', { plateCode });
    }

    const row = await query.getRawOne<{ occurredAt: Date | null }>();
    return row?.occurredAt ?? null;
  }

  async provinceExists(plateCode: string): Promise<boolean> {
    const count = await this.dataSource.getRepository(Province).count({ where: { plateCode } });
    return count > 0;
  }
}
