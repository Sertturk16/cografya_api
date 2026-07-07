import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Province } from './entities/province.entity';
import { ProvinceDetailDto } from './dto/province-detail.dto';
import { ProvinceListItemDto } from './dto/province-list-item.dto';

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

  private toDetail(row: Province): ProvinceDetailDto {
    return {
      plateCode: row.plateCode,
      nameTr: row.nameTr,
      slugTr: row.slugTr,
      slugEn: row.slugEn,
      region: row.region,
      population: row.population,
      populationYear: row.populationYear,
      areaKm2: row.areaKm2,
      districtCount: row.districtCount,
      elevationM: row.elevationM,
      latitude: row.latitude,
      longitude: row.longitude,
      neighborPlateCodes: row.neighborPlateCodes,
      climateKoppen: row.climateKoppen,
      climateClassTr: row.climateClassTr,
      landformNoteTr: row.landformNoteTr,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
