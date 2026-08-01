import type { DataSource, EntityManager } from 'typeorm';
import { MarineEcmwfCycle } from '../entities/marine-ecmwf-cycle.entity';
import { MarineEcmwfPointSeries } from '../entities/marine-ecmwf-point-series.entity';
import { cycleSteps } from './ecmwf-cycle';
import {
  addStepDone,
  classifyStoredSeries,
  isCycleComplete,
  mergeStepIntoSeries,
  type EcmwfStepSample,
} from './ecmwf-series-merge';

/**
 * The ECMWF ingest's Postgres port — every read and write of the two M3b tables goes through
 * here, so the ingest target and the read path can be unit-tested against
 * {@link EcmwfIngestStorePort} fakes while THIS implementation is exercised on a real Postgres
 * in e2e (the repo's mocks-don't-prove-storage rule).
 */

/** One point's contribution to one ingested step. */
export interface RecordStepPoint {
  readonly marinePointId: string;
  readonly gridLatitude: number;
  readonly gridLongitude: number;
  readonly distanceKm: number;
  readonly sample: EcmwfStepSample;
}

export interface RecordStepInput {
  readonly cycleUtc: Date;
  readonly stepHour: number;
  readonly stepHours: number;
  readonly forecastHours: number;
  /** Bytes downloaded FOR THIS STEP (indexes + ranges) — accumulated onto the cycle ledger. */
  readonly bytesDownloaded: number;
  readonly packingType: string;
  readonly decoderVersion: string;
  readonly points: readonly RecordStepPoint[];
  readonly now: Date;
}

/** The newest stored evidence for one point. */
export interface NewestPointSeries {
  readonly cycle: MarineEcmwfCycle;
  readonly series: MarineEcmwfPointSeries;
}

/** Injection token for {@link EcmwfIngestStorePort} — consumers depend on the port, not the class. */
export const ECMWF_INGEST_STORE = Symbol('ECMWF_INGEST_STORE');

export interface EcmwfIngestStorePort {
  getCycle(cycleUtc: Date): Promise<MarineEcmwfCycle | null>;
  /** Newest cycle row regardless of completeness — the layers fill and the ingest resume read. */
  newestCycle(): Promise<MarineEcmwfCycle | null>;
  /** Newest cycle that holds a series row for THIS point. */
  newestSeriesForPoint(marinePointId: string): Promise<NewestPointSeries | null>;
  /** Persist one fully-decoded step, atomically: ~30 series merges + the cycle ledger. */
  recordStep(input: RecordStepInput): Promise<void>;
  /** Retention (SPEC §9.1): keep the newest `keep` cycles, cascade-delete the rest. */
  pruneCycles(keep: number): Promise<number>;
}

export class EcmwfIngestStore implements EcmwfIngestStorePort {
  constructor(private readonly dataSource: DataSource) {}

  async getCycle(cycleUtc: Date): Promise<MarineEcmwfCycle | null> {
    return await this.dataSource.getRepository(MarineEcmwfCycle).findOneBy({ cycleUtc });
  }

  async newestCycle(): Promise<MarineEcmwfCycle | null> {
    const rows = await this.dataSource.getRepository(MarineEcmwfCycle).find({
      order: { cycleUtc: 'DESC' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  async newestSeriesForPoint(marinePointId: string): Promise<NewestPointSeries | null> {
    const rows = await this.dataSource.getRepository(MarineEcmwfPointSeries).find({
      where: { marinePointId },
      order: { cycleUtc: 'DESC' },
      take: 1,
      relations: { cycle: true },
    });
    const series = rows[0];
    if (series === undefined) return null;
    return { cycle: series.cycle, series };
  }

  /**
   * One transaction per step: either the ledger AND all ~30 point rows advance together, or
   * none do. A half-written step must be unrepresentable — `steps_done` is what the next tour
   * trusts to skip work, so listing a step whose rows are missing would freeze a hole into
   * every future compile.
   *
   * Cross-instance concurrency is already excluded by the warmup tour's Redis lock (the store's
   * single writer); the transaction is for atomicity against a crash, not for races.
   */
  async recordStep(input: RecordStepInput): Promise<void> {
    await this.dataSource.transaction(async (manager: EntityManager) => {
      const cycleRepository = manager.getRepository(MarineEcmwfCycle);
      const seriesRepository = manager.getRepository(MarineEcmwfPointSeries);

      const existingCycle = await cycleRepository.findOneBy({ cycleUtc: input.cycleUtc });
      const stepsDone = addStepDone(existingCycle?.stepsDone ?? [], input.stepHour);
      const complete = isCycleComplete(stepsDone, cycleSteps(input.forecastHours));

      await cycleRepository.save({
        cycleUtc: input.cycleUtc,
        stepsDone,
        stepHours: input.stepHours,
        forecastHours: input.forecastHours,
        bytesDownloaded: (existingCycle?.bytesDownloaded ?? 0) + input.bytesDownloaded,
        startedAt: existingCycle?.startedAt ?? input.now,
        completedAt: complete ? (existingCycle?.completedAt ?? input.now) : null,
        // Latest observation wins: a packing or decoder change MID-CYCLE is visible as the
        // ledger value disagreeing with the earlier tours' logs — evidence, not history.
        packingType: input.packingType,
        decoderVersion: input.decoderVersion,
      });

      for (const point of input.points) {
        const existingSeries = await seriesRepository.findOneBy({
          cycleUtc: input.cycleUtc,
          marinePointId: point.marinePointId,
        });
        const values = mergeStepIntoSeries(
          existingSeries?.values ?? null,
          input.stepHour,
          point.sample,
        );
        await seriesRepository.save({
          cycleUtc: input.cycleUtc,
          marinePointId: point.marinePointId,
          gridLatitude: point.gridLatitude,
          gridLongitude: point.gridLongitude,
          distanceKm: point.distanceKm,
          values,
          support: classifyStoredSeries(values),
          ingestedAt: input.now,
        });
      }
    });
  }

  async pruneCycles(keep: number): Promise<number> {
    const repository = this.dataSource.getRepository(MarineEcmwfCycle);
    const keepRows = await repository.find({ order: { cycleUtc: 'DESC' }, take: keep });
    if (keepRows.length < keep) return 0;

    const oldest = keepRows[keepRows.length - 1];
    if (oldest === undefined) return 0;

    // FK CASCADE removes the series rows with their cycle.
    const result = await repository
      .createQueryBuilder()
      .delete()
      .where('cycle_utc < :cutoff', { cutoff: oldest.cycleUtc })
      .execute();
    return result.affected ?? 0;
  }
}
