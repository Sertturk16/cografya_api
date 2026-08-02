import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CMEMS_LAYER_PRODUCTS,
  resolveCmemsCatalogueFields,
  type CmemsCatalogueFields,
} from './cmems/cmems-catalogue';
import { CmemsStacResolutionCache } from './cmems/cmems-stac.cache';
import { MarinePointListItemDto } from './dto/marine-point-list-item.dto';
import { MarineLayerDto } from './dto/marine-layer.dto';
import { isCycleWithinMaxAge } from './ecmwf/ecmwf-cycle';
import { ECMWF_INGEST_STORE, type EcmwfIngestStorePort } from './ecmwf/ecmwf-ingest.store';
import { selectPublishableCycle, selectPublishedRun } from './ecmwf/ecmwf-series-compile';
import { ECMWF_RETAINED_CYCLES, ECMWF_UPDATE_FREQUENCY } from './ecmwf/ecmwf.constants';
import { MarinePoint } from './entities/marine-point.entity';
import { MARINE_LAYER_CATALOGUE } from './marine-layer-catalogue';
import { toMarinePointListItem } from './marine-point.mapper';
import { MARINE_UPSTREAM_CONFIG, type MarineUpstreamConfig } from './marine-upstream.config';
import { MarineSource, type MarineLayerId } from './marine.types';

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
    private readonly stacCache: CmemsStacResolutionCache,
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
   * The layer catalogue: the static half from the module constant, plus — per layer — the
   * catalogue fields of that layer's PRIMARY provider: the newest ingested cycle for the two
   * ECMWF layers (M3b), the stored STAC resolutions for the three CMEMS layers (M4b, deltas
   * d1–d3).
   *
   * ## Cold behaviour (COLD-BEHAVIOR table, binding)
   * No ingested cycle / no stored resolution → the three fields stay `null`, the response
   * stays 200, and NO upstream call happens on any branch — this method reads Postgres, the
   * resolution cache and a constant, nothing else (the resolutions are written ONLY by the
   * warmup tour). The nulls are the contract's own honest "provider catalogue not resolved"
   * state, unchanged in shape since M1.
   *
   * Returned as a copy so a caller cannot mutate the module-level constant — the array is
   * shared by every request for the process lifetime.
   */
  async findAllLayers(): Promise<MarineLayerDto[]> {
    const [ecmwfFields, cmemsFieldsByLayer] = await Promise.all([
      this.resolveEcmwfCatalogueFields(),
      this.resolveCmemsCatalogueFieldsByLayer(),
    ]);

    return MARINE_LAYER_CATALOGUE.map((layer) => ({
      ...layer,
      colorStops: layer.colorStops.map((stop) => ({ ...stop })),
      ...(layer.primarySource === MarineSource.Ecmwf && ecmwfFields !== null ? ecmwfFields : {}),
      ...(layer.primarySource === MarineSource.Cmems ? (cmemsFieldsByLayer[layer.id] ?? {}) : {}),
    }));
  }

  /**
   * The CMEMS half of the catalogue fill: one resolution-cache read per distinct product
   * (≤4 keys), aggregated per layer by the pure d1–d3 rules in `cmems-catalogue.ts`. A layer
   * whose serving products are not all resolved keeps its honest nulls.
   */
  private async resolveCmemsCatalogueFieldsByLayer(): Promise<
    Partial<Record<MarineLayerId, CmemsCatalogueFields>>
  > {
    const productIds = new Set<string>();
    for (const products of Object.values(CMEMS_LAYER_PRODUCTS)) {
      for (const productId of products) productIds.add(productId);
    }

    const resolutions = new Map<string, Awaited<ReturnType<CmemsStacResolutionCache['get']>>>();
    await Promise.all(
      [...productIds].map(async (productId) => {
        resolutions.set(productId, await this.stacCache.get(productId));
      }),
    );

    const byLayer: Partial<Record<MarineLayerId, CmemsCatalogueFields>> = {};
    for (const [layerId, products] of Object.entries(CMEMS_LAYER_PRODUCTS) as [
      MarineLayerId,
      readonly string[],
    ][]) {
      byLayer[layerId] = resolveCmemsCatalogueFields(
        products.map((productId) => resolutions.get(productId)?.resolution ?? null),
      );
    }
    return byLayer;
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
    // Shared with the value endpoints (M4b) so the embedded identity block cannot diverge.
    return toMarinePointListItem(point);
  }
}
