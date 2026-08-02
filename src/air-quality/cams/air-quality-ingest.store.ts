import type { DataSource, EntityManager } from 'typeorm';
import { AirQualityProvinceSeries } from '../entities/air-quality-province-series.entity';
import {
  AirQualityRun,
  type AdsJobRecord,
  type AirQualityErrorClass,
  type AirQualityRunState,
  type AirQualityStoredConcentrations,
  type AirQualityStoredSupport,
} from '../entities/air-quality-run.entity';

/**
 * The air-quality ingest's Postgres port — every read and write of the two A2a tables goes
 * through here, so the state machine can be unit-tested against a fake while THIS
 * implementation is exercised on a real Postgres in e2e (the repo's mocks-don't-prove-storage
 * rule).
 */

/** One province's contribution to one stored product. */
export interface RecordProvinceInput {
  readonly provinceId: string;
  readonly gridLatitude: number;
  readonly gridLongitude: number;
  readonly distanceKm: number;
  readonly concentrations: AirQualityStoredConcentrations;
  readonly support: AirQualityStoredSupport;
}

/** Everything one completed job writes, in ONE transaction. */
export interface RecordProductInput {
  readonly runUtc: Date;
  /** Which half of the row this write fills. */
  readonly kind: 'forecast' | 'analysis';
  /** Steps stored: `forecastHours` for the forecast job, `analysisHours` for the analysis. */
  readonly hours: number;
  readonly provinces: readonly RecordProvinceInput[];
  /** Run-level evidence, refreshed on every product write. */
  readonly bytesDownloaded: number;
  readonly fileFormat: string;
  readonly decoderVersion: string;
  readonly adsRequests: readonly AdsJobRecord[];
  readonly state: AirQualityRunState;
  readonly now: Date;
}

export interface CreateRunInput {
  readonly runUtc: Date;
  readonly datasetId: string;
  readonly forecastHours: number;
  readonly adsRequests: readonly AdsJobRecord[];
  readonly now: Date;
}

/** A run-level patch that touches no series rows (state transitions, job progress, errors). */
export interface UpdateRunInput {
  readonly runUtc: Date;
  readonly adsRequests: readonly AdsJobRecord[];
  readonly state: AirQualityRunState;
  readonly lastError?: string | null;
  readonly lastErrorClass?: AirQualityErrorClass | null;
  readonly bytesDownloaded?: number;
}

/** Injection token — consumers depend on the port, never on the class. */
export const AIR_QUALITY_INGEST_STORE = Symbol('AIR_QUALITY_INGEST_STORE');

export interface AirQualityIngestStorePort {
  /** The newest run row, whatever its state — the one the tour is responsible for. */
  newestRun(): Promise<AirQualityRun | null>;
  getRun(runUtc: Date): Promise<AirQualityRun | null>;
  createRun(input: CreateRunInput): Promise<void>;
  /** Run-level progress only. Never touches series rows. */
  updateRun(input: UpdateRunInput): Promise<void>;
  /** Persist one decoded product atomically: 81 series rows + the run ledger. */
  recordProduct(input: RecordProductInput): Promise<void>;
  /** The stored grid cells of a run, by province id — the analysis identity guard's input. */
  gridCellsFor(runUtc: Date): Promise<Map<string, { latitude: number; longitude: number }>>;
  /** Retention: keep the newest `keep` runs, cascade-delete the rest. */
  pruneRuns(keep: number): Promise<number>;
}

export class AirQualityIngestStore implements AirQualityIngestStorePort {
  constructor(private readonly dataSource: DataSource) {}

  async newestRun(): Promise<AirQualityRun | null> {
    const rows = await this.dataSource
      .getRepository(AirQualityRun)
      .find({ order: { runUtc: 'DESC' }, take: 1 });
    return rows[0] ?? null;
  }

  async getRun(runUtc: Date): Promise<AirQualityRun | null> {
    return await this.dataSource.getRepository(AirQualityRun).findOneBy({ runUtc });
  }

  async createRun(input: CreateRunInput): Promise<void> {
    await this.dataSource.getRepository(AirQualityRun).insert({
      runUtc: input.runUtc,
      state: 'pending',
      forecastHours: input.forecastHours,
      analysisHours: 0,
      adsRequests: [...input.adsRequests],
      datasetId: input.datasetId,
      lastError: null,
      lastErrorClass: null,
      bytesDownloaded: 0,
      fileFormat: null,
      decoderVersion: null,
      startedAt: input.now,
      completedAt: null,
    });
  }

  async updateRun(input: UpdateRunInput): Promise<void> {
    await this.dataSource.getRepository(AirQualityRun).update(
      { runUtc: input.runUtc },
      {
        adsRequests: [...input.adsRequests],
        state: input.state,
        // `undefined` means "leave it alone"; `null` means "clear it". Distinguished on
        // purpose: a routine job-state write must not erase the error that explains the run.
        ...(input.lastError === undefined ? {} : { lastError: input.lastError }),
        ...(input.lastErrorClass === undefined ? {} : { lastErrorClass: input.lastErrorClass }),
        ...(input.bytesDownloaded === undefined ? {} : { bytesDownloaded: input.bytesDownloaded }),
      },
    );
  }

  /**
   * One transaction per PRODUCT: either the ledger and all 81 province rows advance together,
   * or none do. A half-written product must be unrepresentable — the run state is what the read
   * path trusts to decide "servable", so a state that claims stored rows which are not there
   * would publish holes.
   *
   * The forecast write INSERTs the rows; the analysis write UPDATEs only its own two columns,
   * so a forecast series is never rewritten (no partial-overwrite window on a row that is
   * already being served).
   *
   * Cross-instance concurrency is already excluded by the warmup tour's Redis lock (this store
   * has one writer); the transaction is for atomicity against a crash, not for races.
   */
  async recordProduct(input: RecordProductInput): Promise<void> {
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const runRepository = manager.getRepository(AirQualityRun);
      const seriesRepository = manager.getRepository(AirQualityProvinceSeries);

      if (input.kind === 'forecast') {
        for (const province of input.provinces) {
          await seriesRepository.upsert(
            {
              runUtc: input.runUtc,
              provinceId: province.provinceId,
              gridLatitude: province.gridLatitude,
              gridLongitude: province.gridLongitude,
              distanceKm: province.distanceKm,
              concentrations: province.concentrations,
              support: province.support,
              analysisConcentrations: null,
              analysisSupport: null,
              ingestedAt: input.now,
            },
            ['runUtc', 'provinceId'],
          );
        }
      } else {
        for (const province of input.provinces) {
          await seriesRepository.update(
            { runUtc: input.runUtc, provinceId: province.provinceId },
            {
              analysisConcentrations: province.concentrations,
              analysisSupport: province.support,
              ingestedAt: input.now,
            },
          );
        }
      }

      await runRepository.update(
        { runUtc: input.runUtc },
        {
          state: input.state,
          adsRequests: [...input.adsRequests],
          bytesDownloaded: input.bytesDownloaded,
          fileFormat: input.fileFormat,
          decoderVersion: input.decoderVersion,
          // The forecast landing is what makes a run servable; the analysis is an upgrade and
          // must not move the timestamp that records when serving became possible.
          ...(input.kind === 'forecast'
            ? { completedAt: input.now }
            : { analysisHours: input.hours }),
          ...(input.kind === 'forecast' ? { forecastHours: input.hours } : {}),
        },
      );
    });
  }

  async gridCellsFor(runUtc: Date): Promise<Map<string, { latitude: number; longitude: number }>> {
    const rows = await this.dataSource
      .getRepository(AirQualityProvinceSeries)
      .find({ where: { runUtc } });
    return new Map(
      rows.map((row) => [
        row.provinceId,
        { latitude: row.gridLatitude, longitude: row.gridLongitude },
      ]),
    );
  }

  async pruneRuns(keep: number): Promise<number> {
    const repository = this.dataSource.getRepository(AirQualityRun);
    const keepRows = await repository.find({ order: { runUtc: 'DESC' }, take: keep });
    if (keepRows.length < keep) return 0;

    const oldest = keepRows[keepRows.length - 1];
    if (oldest === undefined) return 0;

    // FK CASCADE removes the 81 series rows with their run.
    const result = await repository
      .createQueryBuilder()
      .delete()
      .where('run_utc < :cutoff', { cutoff: oldest.runUtc })
      .execute();
    return result.affected ?? 0;
  }
}
