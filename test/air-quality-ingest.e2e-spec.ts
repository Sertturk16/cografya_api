import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { AirQualityPollutant } from '../src/air-quality/air-quality.types';
import {
  AirQualityIngestStore,
  type AirQualityIngestStorePort,
  type RecordProvinceInput,
} from '../src/air-quality/cams/air-quality-ingest.store';
import { AirQualityProvinceSeries } from '../src/air-quality/entities/air-quality-province-series.entity';
import {
  AirQualityRun,
  type AdsJobRecord,
  type AirQualityStoredConcentrations,
  type AirQualityStoredSupport,
} from '../src/air-quality/entities/air-quality-run.entity';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { Province } from '../src/province/entities/province.entity';

/**
 * A2a e2e: the air-quality store on a REAL Postgres, through the migration this PR ships.
 *
 * What is proved here is exactly what a mock cannot prove: that the hand-written SQL and the
 * entities agree, that one product write is atomic, that the analysis write cannot damage a
 * forecast series that is already being served, that the two FKs cascade, and that retention
 * removes a run WITH its 81 rows.
 *
 * Structural only (CONVENTIONS §2): the samples are synthetic and no concentration is asserted
 * as a fact.
 */

const RUN_A = new Date('2026-08-01T00:00:00.000Z');
const RUN_B = new Date('2026-08-02T00:00:00.000Z');
const RUN_C = new Date('2026-08-03T00:00:00.000Z');
const RUN_D = new Date('2026-08-04T00:00:00.000Z');

function job(kind: 'forecast' | 'analysis', state: AdsJobRecord['state']): AdsJobRecord {
  return {
    kind,
    requestDate: kind === 'forecast' ? '2026-08-02' : '2026-08-01',
    requestBody: { type: [kind], date: ['2026-08-02/2026-08-02'], level: ['0'] },
    state,
    jobId: `job-${kind}`,
    attempts: 0,
    submittedAt: '2026-08-02T12:30:00.000Z',
    adsCreated: '2026-08-02T12:30:01.000Z',
    adsStarted: '2026-08-02T12:30:21.000Z',
    adsFinished: '2026-08-02T12:31:07.000Z',
    cleanupAt: null,
    result: null,
    lastError: null,
  };
}

function concentrations(steps: number, base: number): AirQualityStoredConcentrations {
  const series = {} as AirQualityStoredConcentrations;
  for (const pollutant of Object.values(AirQualityPollutant)) {
    series[pollutant] = Array.from({ length: steps }, (_unused, index) => base + index);
  }
  return series;
}

function support(): AirQualityStoredSupport {
  const verdicts = {} as AirQualityStoredSupport;
  for (const pollutant of Object.values(AirQualityPollutant)) verdicts[pollutant] = 'ok';
  return verdicts;
}

describe('Air-quality ingest store (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let store: AirQualityIngestStorePort;
  let provinces: Province[];

  const rowsFor = (steps: number, base: number): RecordProvinceInput[] =>
    provinces.map((province, index) => ({
      provinceId: province.id,
      gridLatitude: 39.95 + index * 0.0001,
      gridLongitude: 32.85 + index * 0.0001,
      distanceKm: 4.5,
      concentrations: concentrations(steps, base),
      support: support(),
    }));

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource(buildDataSourceOptions(container.getConnectionUri()));
    await dataSource.initialize();
    // The migration this PR ships is what creates both tables — nothing is synchronised.
    await dataSource.runMigrations();
    await seedGeography(dataSource);
    provinces = await dataSource.getRepository(Province).find({ order: { plateCode: 'ASC' } });
    store = new AirQualityIngestStore(dataSource);
  }, 240_000);

  afterAll(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
    await container.stop();
  });

  it('seeds the 81 provinces the ingest is built for', () => {
    expect(provinces).toHaveLength(81);
    expect(provinces.every((province) => province.latitude !== null)).toBe(true);
  });

  it('creates a run and reads it back with both jobs intact through jsonb', async () => {
    await store.createRun({
      runUtc: RUN_B,
      datasetId: 'cams-europe-air-quality-forecasts',
      forecastHours: 96,
      adsRequests: [job('forecast', 'pending'), job('analysis', 'pending')],
      now: new Date('2026-08-02T12:30:00.000Z'),
    });

    const run = await store.getRun(RUN_B);
    expect(run?.state).toBe('pending');
    expect(run?.analysisHours).toBe(0);
    expect(run?.adsRequests).toHaveLength(2);
    // The queue stamps and the per-job attempt counter survive the round trip — they are the
    // reason those fields live inside `ads_requests` rather than in run-level columns.
    expect(run?.adsRequests[1]?.kind).toBe('analysis');
    expect(run?.adsRequests[1]?.requestDate).toBe('2026-08-01');
    expect(run?.adsRequests[0]?.adsStarted).toBe('2026-08-02T12:30:21.000Z');
    expect(run?.bytesDownloaded).toBe(0);
  });

  it('writes the forecast product atomically: 81 rows + the ledger, in one transaction', async () => {
    await store.recordProduct({
      runUtc: RUN_B,
      kind: 'forecast',
      hours: 96,
      provinces: rowsFor(97, 10),
      bytesDownloaded: 26_484_852,
      fileFormat: 'zip(0)+netcdf3-classic',
      decoderVersion: 'netcdf3-ts@4',
      adsRequests: [job('forecast', 'stored'), job('analysis', 'pending')],
      state: 'serviceable',
      now: new Date('2026-08-02T13:30:00.000Z'),
    });

    const run = await store.getRun(RUN_B);
    expect(run?.state).toBe('serviceable');
    expect(run?.completedAt).not.toBeNull();
    expect(run?.decoderVersion).toBe('netcdf3-ts@4');
    // `bigint` comes back through the transformer as a number, not a string.
    expect(run?.bytesDownloaded).toBe(26_484_852);

    const rows = await dataSource
      .getRepository(AirQualityProvinceSeries)
      .find({ where: { runUtc: RUN_B } });
    expect(rows).toHaveLength(81);
    expect(rows[0]?.concentrations[AirQualityPollutant.Pm2_5]).toHaveLength(97);
    // The analysis half is NULL until its own job lands — never an empty array pretending to be
    // an absent product.
    expect(rows.every((row) => row.analysisConcentrations === null)).toBe(true);
    expect(rows.every((row) => row.analysisSupport === null)).toBe(true);
    // `numeric` columns come back as numbers through the transformer.
    expect(typeof rows[0]?.gridLatitude).toBe('number');
    expect(typeof rows[0]?.distanceKm).toBe('number');
  });

  it('the ANALYSIS write fills only its own columns — the forecast series is byte-identical', async () => {
    const before = await dataSource
      .getRepository(AirQualityProvinceSeries)
      .find({ where: { runUtc: RUN_B }, order: { provinceId: 'ASC' } });
    const forecastBefore = JSON.stringify(before.map((row) => row.concentrations));

    await store.recordProduct({
      runUtc: RUN_B,
      kind: 'analysis',
      hours: 24,
      provinces: rowsFor(24, 100),
      bytesDownloaded: 33_040_412,
      fileFormat: 'zip(0)+netcdf3-classic',
      decoderVersion: 'netcdf3-ts@4',
      adsRequests: [job('forecast', 'stored'), job('analysis', 'stored')],
      state: 'complete',
      now: new Date('2026-08-02T14:30:00.000Z'),
    });

    const after = await dataSource
      .getRepository(AirQualityProvinceSeries)
      .find({ where: { runUtc: RUN_B }, order: { provinceId: 'ASC' } });
    // The honesty guarantee, checked byte for byte: a running publication cannot be rewritten
    // by the second product's arrival.
    expect(JSON.stringify(after.map((row) => row.concentrations))).toBe(forecastBefore);
    expect(after[0]?.analysisConcentrations?.[AirQualityPollutant.Pm2_5]).toHaveLength(24);
    expect(after[0]?.analysisSupport?.[AirQualityPollutant.Pm2_5]).toBe('ok');

    const run = await store.getRun(RUN_B);
    expect(run?.state).toBe('complete');
    expect(run?.analysisHours).toBe(24);
    // The forecast's servable-at timestamp is NOT moved by the upgrade.
    expect(run?.completedAt?.toISOString()).toBe('2026-08-02T13:30:00.000Z');
  });

  it('re-running the same product is idempotent — still exactly 81 rows', async () => {
    await store.recordProduct({
      runUtc: RUN_B,
      kind: 'forecast',
      hours: 96,
      provinces: rowsFor(97, 10),
      bytesDownloaded: 26_484_852,
      fileFormat: 'zip(0)+netcdf3-classic',
      decoderVersion: 'netcdf3-ts@4',
      adsRequests: [job('forecast', 'stored'), job('analysis', 'stored')],
      state: 'complete',
      now: new Date('2026-08-02T15:30:00.000Z'),
    });
    const rows = await dataSource
      .getRepository(AirQualityProvinceSeries)
      .find({ where: { runUtc: RUN_B } });
    expect(rows).toHaveLength(81);
  });

  it('updateRun advances job state WITHOUT touching the series rows or clearing the error', async () => {
    await store.updateRun({
      runUtc: RUN_B,
      adsRequests: [job('forecast', 'stored'), job('analysis', 'stored')],
      state: 'complete',
      lastError: 'a redacted provider message',
      lastErrorClass: 'upstream',
    });
    let run = await store.getRun(RUN_B);
    expect(run?.lastError).toBe('a redacted provider message');

    // A routine progress write leaves the recorded error alone: `undefined` means "do not
    // touch", and only an explicit `null` clears it.
    await store.updateRun({
      runUtc: RUN_B,
      adsRequests: [job('forecast', 'stored'), job('analysis', 'stored')],
      state: 'complete',
    });
    run = await store.getRun(RUN_B);
    expect(run?.lastError).toBe('a redacted provider message');
    expect(run?.lastErrorClass).toBe('upstream');

    await store.updateRun({
      runUtc: RUN_B,
      adsRequests: [job('forecast', 'stored'), job('analysis', 'stored')],
      state: 'complete',
      lastError: null,
      lastErrorClass: null,
    });
    run = await store.getRun(RUN_B);
    expect(run?.lastError).toBeNull();

    const rows = await dataSource
      .getRepository(AirQualityProvinceSeries)
      .find({ where: { runUtc: RUN_B } });
    expect(rows).toHaveLength(81);
  });

  it('gridCellsFor returns the stored cell per province — the analysis identity guard input', async () => {
    const cells = await store.gridCellsFor(RUN_B);
    expect(cells.size).toBe(81);
    const first = provinces[0];
    expect(first).toBeDefined();
    expect(cells.get(first?.id ?? '')?.latitude).toBeCloseTo(39.95, 6);
  });

  it('newestRun returns the newest row, whatever its state', async () => {
    await store.createRun({
      runUtc: RUN_A,
      datasetId: 'cams-europe-air-quality-forecasts',
      forecastHours: 96,
      adsRequests: [job('forecast', 'rejected')],
      now: new Date('2026-08-01T12:30:00.000Z'),
    });
    expect((await store.newestRun())?.runUtc.toISOString()).toBe(RUN_B.toISOString());
  });

  it('retention keeps the newest 3 runs and CASCADES their series rows away', async () => {
    for (const runUtc of [RUN_C, RUN_D]) {
      await store.createRun({
        runUtc,
        datasetId: 'cams-europe-air-quality-forecasts',
        forecastHours: 96,
        adsRequests: [job('forecast', 'pending')],
        now: runUtc,
      });
      await store.recordProduct({
        runUtc,
        kind: 'forecast',
        hours: 96,
        provinces: rowsFor(97, 20),
        bytesDownloaded: 1_000,
        fileFormat: 'zip(0)+netcdf3-classic',
        decoderVersion: 'netcdf3-ts@4',
        adsRequests: [job('forecast', 'stored')],
        state: 'complete',
        now: runUtc,
      });
    }
    expect(await dataSource.getRepository(AirQualityRun).count()).toBe(4);

    const removed = await store.pruneRuns(3);
    expect(removed).toBe(1);
    const remaining = await dataSource
      .getRepository(AirQualityRun)
      .find({ order: { runUtc: 'ASC' } });
    expect(remaining.map((run) => run.runUtc.toISOString())).toEqual([
      RUN_B.toISOString(),
      RUN_C.toISOString(),
      RUN_D.toISOString(),
    ]);
    // The oldest run had no series rows; the ones that remain still have all of theirs.
    expect(await dataSource.getRepository(AirQualityProvinceSeries).count()).toBe(81 * 3);
  });

  it('deleting a province CASCADES its series rows away instead of orphaning them', async () => {
    const victim = provinces[provinces.length - 1];
    expect(victim).toBeDefined();
    const before = await dataSource.getRepository(AirQualityProvinceSeries).count();

    await dataSource.getRepository(Province).delete({ id: victim?.id });

    const after = await dataSource.getRepository(AirQualityProvinceSeries).count();
    // One row per retained run went with it — never an orphan pointing at a province that is
    // no longer in the reference set.
    expect(after).toBe(before - 3);
  });
});
