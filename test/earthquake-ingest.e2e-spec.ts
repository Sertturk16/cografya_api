import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { EarthquakeEvent } from '../src/earthquake/entities/earthquake-event.entity';
import { EarthquakeIngestRun } from '../src/earthquake/entities/earthquake-ingest-run.entity';
import {
  EarthquakeBindingKind,
  EarthquakeIngestJobKind,
  MagnitudeType,
} from '../src/earthquake/earthquake.types';
import {
  EarthquakeIngestStore,
  type EarthquakeEventUpsert,
} from '../src/earthquake/earthquake-ingest.store';

/**
 * E2 e2e: the earthquake ingest store against a REAL Postgres, through E1's migrations.
 *
 * What only this can prove:
 *  - the hand-written DDL and the entity metadata agree (`FU-EQ-ENTITY-DDL`, the residual risk E1
 *    accepted and E2 undertook to close — a mismatch shows up here as an insert error);
 *  - the upsert really does write NOTHING when nothing changed, so `updated_at` stays honest;
 *  - `revision_count` moves for a revision and stands still for a re-ingest;
 *  - the foreign key to `provinces` holds, and a row-level violation is a ROW's problem;
 *  - retention prunes without ever removing the freshness anchor (`FU-EQ-RUNS-PRUNE`).
 *
 * Structural only (`CONVENTIONS.md` §2): every value below is synthetic and nothing asserts that
 * any earthquake ever had any property.
 */

const OCCURRED = new Date('2026-08-11T11:03:34.000Z');

function upsertRow(overrides: Partial<EarthquakeEventUpsert> = {}): EarthquakeEventUpsert {
  return {
    providerEventId: '900001',
    occurredAtUtc: OCCURRED,
    latitude: 38.05222,
    longitude: 36.63111,
    depthKm: 6.95,
    magnitude: 1.8,
    magnitudeType: MagnitudeType.Ml,
    magnitudeTypeRaw: 'ML',
    providerCountry: 'Türkiye',
    providerProvince: 'Kahramanmaraş',
    providerDistrict: 'Göksun',
    providerLocationRaw: 'Göksun (Kahramanmaraş)',
    placeNameTr: 'Göksun (Kahramanmaraş)',
    bindingKind: EarthquakeBindingKind.Inside,
    bindingPlateCode: '46',
    bindingDistanceKm: null,
    inScope: true,
    isRevised: false,
    providerUpdatedAtUtc: null,
    ...overrides,
  };
}

describe('Earthquake ingest store (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let store: EarthquakeIngestStore;

  const eventsRepository = () => dataSource.getRepository(EarthquakeEvent);
  const runsRepository = () => dataSource.getRepository(EarthquakeIngestRun);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource(buildDataSourceOptions(container.getConnectionUri()));
    await dataSource.initialize();
    // E1's migrations create both tables; E2 adds none. Nothing is synchronised.
    await dataSource.runMigrations();
    await seedGeography(dataSource);
    store = new EarthquakeIngestStore(dataSource);
  }, 240_000);

  afterAll(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
    await container.stop();
  });

  beforeEach(async () => {
    await eventsRepository().createQueryBuilder().delete().execute();
    await runsRepository().createQueryBuilder().delete().execute();
  });

  it('resolves the province join the ingest binds events with', async () => {
    const plateCodes = await store.loadProvincePlateCodes();
    expect(plateCodes.size).toBe(81);
    // Turkish-locale folding is the point of the key: an ASCII fold puts `Iğdır` somewhere the
    // provider's spelling never lands.
    expect(plateCodes.get('ığdır')).toBe('76');
    expect(plateCodes.get('kahramanmaraş')).toBe('46');
  });

  it('inserts a row that the entity can read back — the DDL and the entity agree', async () => {
    const result = await store.upsertEvent(upsertRow(), new Date());
    expect(result.kind).toBe('inserted');

    const stored = await eventsRepository().findOneByOrFail({ providerEventId: '900001' });
    expect(stored.provider).toBe('afad');
    // `numeric` comes back from the driver as a string; the entity's transformer is what stops a
    // `number`-typed contract field from silently publishing one.
    expect(stored.latitude).toBeCloseTo(38.05222, 6);
    expect(stored.magnitude).toBeCloseTo(1.8, 2);
    expect(stored.depthKm).toBeCloseTo(6.95, 3);
    expect(stored.occurredAtUtc.toISOString()).toBe(OCCURRED.toISOString());
    expect(stored.bindingKind).toBe(EarthquakeBindingKind.Inside);
    expect(stored.bindingPlateCode).toBe('46');
    expect(stored.revisionCount).toBe(0);
    expect(stored.firstSeenAtUtc).toBeInstanceOf(Date);
  });

  it('writes NOTHING when the same payload arrives again', async () => {
    await store.upsertEvent(upsertRow(), new Date('2026-08-11T12:00:00.000Z'));
    const first = await eventsRepository().findOneByOrFail({ providerEventId: '900001' });

    const again = await store.upsertEvent(upsertRow(), new Date('2026-08-11T13:00:00.000Z'));
    expect(again.kind).toBe('unchanged');

    const second = await eventsRepository().findOneByOrFail({ providerEventId: '900001' });
    // `updated_at` standing still is the whole point: it will feed `dateModified` and sitemap
    // `lastmod`, and re-announcing thousands of unchanged events every five minutes is a lie.
    expect(second.updatedAt.getTime()).toBe(first.updatedAt.getTime());
    expect(second.revisionCount).toBe(0);
  });

  it('counts a revision exactly once when the provider changes a solution', async () => {
    await store.upsertEvent(upsertRow(), new Date('2026-08-11T12:00:00.000Z'));
    const revised = await store.upsertEvent(
      upsertRow({ magnitude: 2.1, isRevised: true, providerUpdatedAtUtc: new Date() }),
      new Date('2026-08-11T13:00:00.000Z'),
    );

    expect(revised.kind).toBe('updated');
    if (revised.kind === 'unchanged') throw new Error('the revision was not written');
    expect(revised.revisionCount).toBe(1);

    const stored = await eventsRepository().findOneByOrFail({ providerEventId: '900001' });
    expect(stored.magnitude).toBeCloseTo(2.1, 2);
    expect(stored.isRevised).toBe(true);
    expect(stored.updatedAt.getTime()).toBeGreaterThan(
      new Date('2026-08-11T12:00:00.000Z').getTime(),
    );
  });

  it('updates a non-solution field without calling it a revision', async () => {
    await store.upsertEvent(upsertRow(), new Date('2026-08-11T12:00:00.000Z'));
    const relabelled = await store.upsertEvent(
      upsertRow({
        providerLocationRaw: 'Göksun (Kahramanmaraş) düzeltme',
        placeNameTr: 'Göksun (Kahramanmaraş) düzeltme',
      }),
      new Date('2026-08-11T13:00:00.000Z'),
    );

    // Written — our copy stays faithful — but `revision_count` does not move: a corrected label is
    // not a revision of the earthquake, and the reader is shown that number.
    expect(relabelled.kind).toBe('updated');
    if (relabelled.kind === 'unchanged') throw new Error('the relabelling was not written');
    expect(relabelled.revisionCount).toBe(0);
  });

  it('stores an out-of-scope row rather than dropping it', async () => {
    await store.upsertEvent(
      upsertRow({
        providerEventId: '900002',
        inScope: false,
        providerCountry: 'Portekiz',
        bindingKind: EarthquakeBindingKind.AcrossBorder,
        bindingPlateCode: null,
      }),
      new Date(),
    );

    const stored = await eventsRepository().findOneByOrFail({ providerEventId: '900002' });
    expect(stored.inScope).toBe(false);
    expect(stored.bindingPlateCode).toBeNull();
  });

  it('refuses a plate code no province carries — one row, not the tour', async () => {
    await expect(
      store.upsertEvent(
        upsertRow({ providerEventId: '900003', bindingPlateCode: 'ZZ' }),
        new Date(),
      ),
    ).rejects.toThrow();

    // The tour's other rows are unaffected: each upsert is its own statement precisely so a
    // rejected row cannot take a batch down with it.
    const survivor = await store.upsertEvent(upsertRow({ providerEventId: '900004' }), new Date());
    expect(survivor.kind).toBe('inserted');
  });

  it('accepts the ranges the provider really produces, including a negative depth', async () => {
    const result = await store.upsertEvent(
      upsertRow({ providerEventId: '900005', depthKm: -0.014, magnitude: 0.6 }),
      new Date(),
    );
    expect(result.kind).toBe('inserted');
  });

  it('records a run and finds the events of a window', async () => {
    await store.upsertEvent(upsertRow(), new Date());
    await store.recordRun({
      jobKind: EarthquakeIngestJobKind.Recent,
      startedAtUtc: new Date('2026-08-11T12:00:00.000Z'),
      finishedAtUtc: new Date('2026-08-11T12:00:02.000Z'),
      outcome: 'ok',
      windowStartUtc: new Date('2026-08-11T06:00:00.000Z'),
      windowEndUtc: new Date('2026-08-11T12:05:00.000Z'),
      fetchedCount: 1,
      insertedCount: 1,
      updatedCount: 0,
      skippedOutOfScopeCount: 0,
      errorReason: null,
    });

    const runs = await runsRepository().find();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.outcome).toBe('ok');
    expect(runs[0]?.jobKind).toBe(EarthquakeIngestJobKind.Recent);

    const ids = await store.providerEventIdsInWindow(
      new Date('2026-08-11T06:00:00.000Z'),
      new Date('2026-08-11T12:05:00.000Z'),
    );
    expect([...ids]).toEqual(['900001']);

    const otherWindow = await store.providerEventIdsInWindow(
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-02T00:00:00.000Z'),
    );
    expect(otherWindow.size).toBe(0);
  });

  it('truncates an over-long error reason instead of failing the insert that records it', async () => {
    await store.recordRun({
      jobKind: EarthquakeIngestJobKind.Reconcile,
      startedAtUtc: new Date(),
      finishedAtUtc: new Date(),
      outcome: 'transient',
      windowStartUtc: new Date('2026-08-04T00:00:00.000Z'),
      windowEndUtc: new Date('2026-08-11T00:00:00.000Z'),
      fetchedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      skippedOutOfScopeCount: 0,
      errorReason: 'x'.repeat(5_000),
    });

    const runs = await runsRepository().find();
    expect(runs[0]?.errorReason?.length).toBe(500);
  });

  describe('retention', () => {
    const day = (offsetDays: number): Date =>
      new Date(Date.UTC(2026, 7, 11) - offsetDays * 86_400_000);

    async function seedRun(
      offsetDays: number,
      outcome: 'ok' | 'transient',
      errorReason: string | null = null,
    ): Promise<void> {
      await store.recordRun({
        jobKind: EarthquakeIngestJobKind.Recent,
        startedAtUtc: day(offsetDays),
        finishedAtUtc: day(offsetDays),
        outcome,
        windowStartUtc: day(offsetDays),
        windowEndUtc: day(offsetDays),
        fetchedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        skippedOutOfScopeCount: 0,
        errorReason,
      });
    }

    it('drops runs past the retention window and keeps the recent ones', async () => {
      await seedRun(1, 'ok');
      await seedRun(20, 'transient');
      await seedRun(40, 'transient');

      const removed = await store.pruneRuns(14, new Date(Date.UTC(2026, 7, 11)));
      expect(removed).toBe(2);
      expect(await runsRepository().count()).toBe(1);
    });

    it('NEVER deletes the newest successful run, however old it is', async () => {
      // The failure this prevents is a lie, not a data loss: with the freshness anchor gone, a
      // long outage would make the API say "there is no data" where the truth is "the data is
      // stale". So an ancient `ok` run survives its own retention window.
      await seedRun(90, 'ok');
      await seedRun(80, 'transient');

      const removed = await store.pruneRuns(14, new Date(Date.UTC(2026, 7, 11)));
      expect(removed).toBe(1);

      const survivors = await runsRepository().find();
      expect(survivors).toHaveLength(1);
      expect(survivors[0]?.outcome).toBe('ok');
    });

    /**
     * The exemption protects the row the READ PATH anchors on — which is the newest `ok` run
     * **with no `error_reason`**, not merely the newest `ok` run.
     *
     * The two definitions agree in a healthy store and diverge in exactly the incident they exist
     * for: through a parser break every tour lands `ok` WITH a reason, so the newest `ok` row is a
     * recent degraded run that retention would never reach anyway, while the last CLEAN run — the
     * one the API publishes as `dataUpdatedAtUtc` — crosses the cutoff. Before this fix it was
     * deleted on day 14 and the endpoints began publishing "we have never contacted the provider"
     * while tours ran every 300 s (review #121 R2, SFH121R2-I1).
     */
    it('exempts the newest CLEAN ok run, not a newer degraded one', async () => {
      await seedRun(90, 'ok');
      await seedRun(20, 'ok', 'the provider returned 612 row(s) and the parser accepted none');
      await seedRun(19, 'ok', 'the provider returned 610 row(s) and the parser accepted none');

      const removed = await store.pruneRuns(14, new Date(Date.UTC(2026, 7, 11)));

      // The two degraded runs are past the cutoff and unprotected; the ancient clean one survives.
      expect(removed).toBe(2);
      const survivors = await runsRepository().find();
      expect(survivors).toHaveLength(1);
      expect(survivors[0]?.errorReason).toBeNull();
      expect(survivors[0]?.startedAtUtc.toISOString()).toBe(day(90).toISOString());
    });

    it('still prunes when no successful run exists at all', async () => {
      // `IS DISTINCT FROM`, not `<>`: with a NULL subquery a plain `<>` deletes nothing forever,
      // on exactly the deployment whose ledger is filling with failures.
      await seedRun(60, 'transient');
      await seedRun(50, 'transient');

      const removed = await store.pruneRuns(14, new Date(Date.UTC(2026, 7, 11)));
      expect(removed).toBe(2);
      expect(await runsRepository().count()).toBe(0);
    });

    it('returns 0 when nothing is old enough to delete', async () => {
      // The direction a constant cannot fake, and the remaining edge of the `6e93c26` defect class
      // (review #118 TA118-M6): the pre-fix code read a DELETE's result as `.length` of
      // `[rows, rowCount]`, i.e. 2 unconditionally, so only a case expecting something OTHER than 2
      // could see it — and 0 is the one no row-count bug can produce by accident.
      await seedRun(1, 'ok');
      await seedRun(2, 'transient');

      const removed = await store.pruneRuns(14, new Date(Date.UTC(2026, 7, 11)));
      expect(removed).toBe(0);
      expect(await runsRepository().count()).toBe(2);
    });
  });

  describe('the reconcile window is inclusive at BOTH ends', () => {
    // `providerEventIdsInWindow` compares `>= $2 AND <= $3`, and the only case exercising it used
    // an event strictly inside. The bound decides whether an event sitting exactly on the boundary
    // is reported as "vanished upstream" — flipping `<=` to `<` would raise a spurious
    // `eq.rows_absent_upstream` warning on every tour, with no test signal (review #118 TA118-M6).
    const windowStart = new Date('2026-08-11T06:00:00.000Z');
    const windowEnd = new Date('2026-08-11T12:05:00.000Z');

    it('returns events sitting exactly on the start and on the end', async () => {
      const now = new Date();
      await store.upsertEvent(
        upsertRow({ providerEventId: 'start', occurredAtUtc: windowStart }),
        now,
      );
      await store.upsertEvent(upsertRow({ providerEventId: 'end', occurredAtUtc: windowEnd }), now);
      await store.upsertEvent(
        upsertRow({
          providerEventId: 'after',
          occurredAtUtc: new Date(windowEnd.getTime() + 1_000),
        }),
        now,
      );

      const ids = await store.providerEventIdsInWindow(windowStart, windowEnd);

      expect([...ids].sort()).toEqual(['end', 'start']);
      // The control: the query really does exclude something, so the two hits above are the bounds
      // answering rather than the filter being absent.
      expect(ids.has('after')).toBe(false);
    });
  });
});
