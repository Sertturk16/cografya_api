import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarinePointListItemDto } from './dto/marine-point-list-item.dto';
import { MarineLayerDto } from './dto/marine-layer.dto';
import { MarinePoint } from './entities/marine-point.entity';
import { MARINE_LAYER_CATALOGUE } from './marine-layer-catalogue';

const logger = new Logger('MarinePoints');

/**
 * Read-only marine service for M1.
 *
 * Makes NO provider call — by design, not by omission. The provider legs land in M2–M4; until
 * then these two endpoints are a Postgres read and a constant, which is what lets the web repo
 * start against a real contract with zero upstream risk.
 */
@Injectable()
export class MarineService {
  constructor(
    @InjectRepository(MarinePoint)
    private readonly marinePointRepository: Repository<MarinePoint>,
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
   * The layer catalogue. A constant in M1; three provider-catalogue fields stay null until M3
   * resolves them (see `marine-layer-catalogue.ts`).
   *
   * Returned as a copy so a caller cannot mutate the module-level constant — the array is
   * shared by every request for the process lifetime.
   */
  findAllLayers(): MarineLayerDto[] {
    return MARINE_LAYER_CATALOGUE.map((layer) => ({
      ...layer,
      colorStops: layer.colorStops.map((stop) => ({ ...stop })),
    }));
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
