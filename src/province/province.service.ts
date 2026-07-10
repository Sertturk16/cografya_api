import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Province } from './entities/province.entity';
import { ProvinceDetailDto } from './dto/province-detail.dto';
import { ProvinceListItemDto } from './dto/province-list-item.dto';
import { ProvinceMapSummaryDto } from './dto/province-map-summary.dto';

/**
 * Nüfus yoğunluğu (kişi/km²) from two verified values. A single source of truth
 * for the rounding + null rule so no two consumers (hover vs detail, TR vs EN)
 * compute it differently. Null when either input is null, or if the area is 0
 * (guards against a divide-by-zero producing Infinity — no real province has a
 * zero area, but the mapper never emits a non-finite number).
 *
 * The null/zero branch is the NORMAL state of every not-yet-seeded province (50
 * of 81), so it is unit-tested directly (province.e2e-spec) — exported for that.
 */
export function computePopulationDensity(
  population: number | null,
  areaKm2: number | null,
): number | null {
  if (population === null || areaKm2 === null || areaKm2 === 0) {
    return null;
  }
  return Math.round(population / areaKm2);
}

@Injectable()
export class ProvinceService {
  constructor(
    @InjectRepository(Province)
    private readonly provinces: Repository<Province>,
  ) {}

  /**
   * All provinces, ordered by plaka kodu.
   *
   * Returned as a plain array (no pagination envelope): the province set is a
   * bounded reference collection (exactly 81) that the il-hub + SVG map need in
   * full, so paginating it would only hurt the SEO hub. The pagination envelope
   * + helper is deferred to the first genuinely unbounded/growing list (the
   * blog/konu-anlatımı engine, Faz-1 item 2) and will be codified in the PR-3
   * playbook.
   */
  async findAll(): Promise<ProvinceListItemDto[]> {
    const rows = await this.provinces.find({ order: { plateCode: 'ASC' } });
    return rows.map((row) => this.toListItem(row));
  }

  /**
   * Purpose-sized bulk payload for the homepage SVG map hover-card: all provinces
   * with the identity fields + the 4 hover-card summary numbers, plate-ordered.
   * A bounded set (81) the map pre-embeds at build/ISR time — returned as a plain
   * array (no envelope), same rationale as `findAll`.
   *
   * The RESPONSE is lean, not the query: `toMapSummary` narrows each row to the
   * hover-card fields, while the query fetches full rows — mirroring `findAll` on
   * a bounded, cached 81-row read (a column projection would only diverge from
   * `findAll` for no measurable gain).
   */
  async findMapSummary(): Promise<ProvinceMapSummaryDto[]> {
    const rows = await this.provinces.find({ order: { plateCode: 'ASC' } });
    return rows.map((row) => this.toMapSummary(row));
  }

  /**
   * One province by either its TR or EN slug (the web repo routes both locales).
   * Unknown slug → 404 with a stable key; the web renders its own localized
   * `notFound()` page from that status.
   */
  async findBySlug(slug: string): Promise<ProvinceDetailDto> {
    const row = await this.provinces.findOne({
      where: [{ slugTr: slug }, { slugEn: slug }],
    });

    if (!row) {
      // Stable message key (not a localized literal). Full i18n wiring lands
      // when the first end-user-facing API messages appear (auth/panels, Faz 3).
      throw new NotFoundException('errors.province.notFound');
    }

    return this.toDetail(row);
  }

  private toListItem(row: Province): ProvinceListItemDto {
    return {
      plateCode: row.plateCode,
      nameTr: row.nameTr,
      region: row.region,
      slugTr: row.slugTr,
      slugEn: row.slugEn,
    };
  }

  private toMapSummary(row: Province): ProvinceMapSummaryDto {
    return {
      plateCode: row.plateCode,
      nameTr: row.nameTr,
      region: row.region,
      slugTr: row.slugTr,
      slugEn: row.slugEn,
      population: row.population,
      populationYear: row.populationYear,
      areaKm2: row.areaKm2,
      districtCount: row.districtCount,
    };
  }

  private toDetail(row: Province): ProvinceDetailDto {
    return {
      plateCode: row.plateCode,
      nameTr: row.nameTr,
      slugTr: row.slugTr,
      slugEn: row.slugEn,
      region: row.region,
      introTr: row.introTr,
      population: row.population,
      populationYear: row.populationYear,
      areaKm2: row.areaKm2,
      districtCount: row.districtCount,
      populationDensity: computePopulationDensity(row.population, row.areaKm2),
      elevationM: row.elevationM,
      latitude: row.latitude,
      longitude: row.longitude,
      neighborPlateCodes: row.neighborPlateCodes,
      climateKoppen: row.climateKoppen,
      climateClassTr: row.climateClassTr,
      climateNoteTr: row.climateNoteTr,
      landformNoteTr: row.landformNoteTr,
      hydrographyNoteTr: row.hydrographyNoteTr,
      hydrographyFeatures: row.hydrographyFeatures,
      urbanizationRate: row.urbanizationRate,
      netMigrationRate: row.netMigrationRate,
      settlementNoteTr: row.settlementNoteTr,
      economyIndicator: row.economyIndicator,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
