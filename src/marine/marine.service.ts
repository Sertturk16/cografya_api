import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarinePointListItemDto } from './dto/marine-point-list-item.dto';
import { MarineLayerDto } from './dto/marine-layer.dto';
import { isCycleWithinMaxAge } from './ecmwf/ecmwf-cycle';
import { ECMWF_INGEST_STORE, type EcmwfIngestStorePort } from './ecmwf/ecmwf-ingest.store';
import { selectPublishableCycle, selectPublishedRun } from './ecmwf/ecmwf-series-compile';
import { ECMWF_RETAINED_CYCLES, ECMWF_UPDATE_FREQUENCY } from './ecmwf/ecmwf.constants';
import { MarinePoint } from './entities/marine-point.entity';
import { MARINE_LAYER_CATALOGUE } from './marine-layer-catalogue';
import { MARINE_UPSTREAM_CONFIG, type MarineUpstreamConfig } from './marine-upstream.config';
import { MarineSource } from './marine.types';

const logger = new Logger('MarinePoints');

/** The three per-provider catalogue fields M3b resolves for the ECMWF-primary layers. */
interface EcmwfCatalogueFields {
  readonly horizonEndUtc: string;
  readonly updateFrequency: string;
  readonly catalogueUpdatedAtUtc: string;
}

/**
 * Read-only marine service.
 *
 * M1: the reference-point read and the static layer catalogue. M3b: the two ECMWF-PRIMARY
 * layers (wind speed/direction) carry live catalogue fields resolved from the newest ingested
 * cycle — a Postgres read, never a provider call. The CMEMS-primary layers keep their nulls
 * until M4 resolves the CMEMS/STAC side; filling a CMEMS layer's catalogue line from its
 * FALLBACK provider would attribute one provider's horizon to another's product.
 */
@Injectable()
export class MarineService {
  constructor(
    @InjectRepository(MarinePoint)
    private readonly marinePointRepository: Repository<MarinePoint>,
    @Inject(ECMWF_INGEST_STORE)
    private readonly ecmwfStore: EcmwfIngestStorePort,
    @Inject(MARINE_UPSTREAM_CONFIG)
    private readonly config: MarineUpstreamConfig,
  ) {}

  /**
   * Every reference point, in hub display order.
   *
   * ## An EMPTY table is a 500, deliberately
   * `marine_points` is populated by `db:import:marine-points --phase=load` from a committed
   * artifact. Zero rows therefore means the import never ran — a broken deployment, not an
   * outage. Returning `200 []` would let a broken deploy publish an empty `/deniz` page and
   * let Google index it; the interceptor also skips `Cache-Control` on a 5xx, so the emptiness
   * cannot be cached either.
   *
   * This is the same reasoning as SPEC-ADDENDUM §7.9's status→HTTP table, which reserves the
   * "never 5xx" rule strictly for UPSTREAM failure — an application/deployment fault must stay
   * loud.
   */
  async findAllPoints(): Promise<MarinePointListItemDto[]> {
    const points = await this.marinePointRepository.find({
      order: { displayOrder: 'ASC' },
    });

    if (points.length === 0) {
      logger.error(
        'marine_points is EMPTY — the import never ran on this database. Run ' +
          '`pnpm db:import:marine-points --phase=load`. Refusing to serve an empty point list: ' +
          'a broken deploy must not publish (and get indexed as) an empty /deniz page.',
      );
      throw new InternalServerErrorException();
    }

    return points.map((point) => this.toListItem(point));
  }

  /**
   * The layer catalogue: the static half from the module constant, plus — for the layers whose
   * PRIMARY source is ECMWF — the catalogue fields of the newest ingested cycle.
   *
   * ## Cold behaviour (COLD-BEHAVIOR table, binding)
   * No ingested cycle, or a cycle over the 24 h age ceiling → the three fields stay `null`,
   * the response stays 200, and NO upstream call happens on any branch — this method reads
   * Postgres and a constant, nothing else. The nulls are the contract's own honest "provider
   * catalogue not resolved" state, unchanged in shape since M1.
   *
   * Returned as a copy so a caller cannot mutate the module-level constant — the array is
   * shared by every request for the process lifetime.
   */
  async findAllLayers(): Promise<MarineLayerDto[]> {
    const ecmwfFields = await this.resolveEcmwfCatalogueFields();

    return MARINE_LAYER_CATALOGUE.map((layer) => ({
      ...layer,
      colorStops: layer.colorStops.map((stop) => ({ ...stop })),
      ...(layer.primarySource === MarineSource.Ecmwf && ecmwfFields !== null ? ecmwfFields : {}),
    }));
  }

  /**
   * The publishable cycle's catalogue line, or `null` when there is none — never a guess.
   *
   * WHICH cycle and WHICH steps: the exact same two policies the series read path applies —
   * `selectPublishableCycle` (longest published run wins, newest breaks ties; review #76 CR-1)
   * over `selectPublishedRun` (the contiguous run nearest to now; review #76 CR-2). Deriving
   * both published `horizonEndUtc` fields from the same pure helpers is what keeps `/layers`
   * and `MarineSeriesDto` from ever disagreeing about where the horizon ends (review #76
   * SFH-4/CR-6).
   *
   * `catalogueUpdatedAtUtc` is the cycle's model-run time: ECMWF Open Data has no catalogue
   * document to date-stamp, and the model run IS the moment the provider last updated the
   * product these layers serve.
   */
  private async resolveEcmwfCatalogueFields(): Promise<EcmwfCatalogueFields | null> {
    const cycles = await this.ecmwfStore.recentCycles(ECMWF_RETAINED_CYCLES);
    const now = new Date();
    const usable = cycles.filter((cycle) =>
      // Same ceiling as the value read path (SPEC §9.4): a horizon advertised from a stale
      // cycle would promise data the series reader refuses to publish.
      isCycleWithinMaxAge(cycle.cycleUtc, now, this.config.ecmwf.cycleMaxAgeSeconds),
    );

    const winnerIndex = selectPublishableCycle(
      usable.map((cycle) => ({ cycleUtc: cycle.cycleUtc, steps: cycle.stepsDone })),
      now,
    );
    const cycle = winnerIndex === null ? undefined : usable[winnerIndex];
    if (cycle === undefined) return null;

    const run = selectPublishedRun(cycle.stepsDone, cycle.cycleUtc, now);
    const lastStep = cycle.stepsDone[run.endIndexExclusive - 1];
    if (lastStep === undefined) return null;

    return {
      horizonEndUtc: new Date(cycle.cycleUtc.getTime() + lastStep * 3_600_000).toISOString(),
      updateFrequency: ECMWF_UPDATE_FREQUENCY,
      catalogueUpdatedAtUtc: cycle.cycleUtc.toISOString(),
    };
  }

  private toListItem(point: MarinePoint): MarinePointListItemDto {
    return {
      slugTr: point.slugTr,
      slugEn: point.slugEn,
      nameTr: point.nameTr,
      nameEn: point.nameEn,
      coastLabelTr: point.coastLabelTr,
      coastLabelEn: point.coastLabelEn,
      plateCode: point.provincePlateCode,
      latitude: point.latitude,
      longitude: point.longitude,
      seaBasin: point.seaBasin,
      displayOrder: point.displayOrder,
    };
  }
}
