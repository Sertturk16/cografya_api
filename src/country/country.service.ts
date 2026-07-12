import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from './entities/country.entity';
import { CountryDetailDto } from './dto/country-detail.dto';
import { CountryListItemDto } from './dto/country-list-item.dto';
import { CountryMapSummaryDto } from './dto/country-map-summary.dto';

/**
 * Komşu ülke sayısı — the count of neighbouring countries, DERIVED from the stored
 * neighbour ISO-code array (the owner-ruled "ilçe sayısı" replacement, → DEC
 * 2026-07-13). A single source of truth for the rule so no two consumers (hover vs
 * detail, TR vs EN) compute it differently — the exact pattern as the province
 * `computePopulationDensity`. Always a real number: an island nation's empty array
 * yields 0 (a correct fact, "no land neighbour"), never null.
 *
 * The array is NOT NULL at the DB level (`'{}'` default), so this cannot receive null;
 * exported for direct unit testing all the same.
 */
export function computeNeighborCount(neighborIsoCodes: readonly string[]): number {
  return neighborIsoCodes.length;
}

@Injectable()
export class CountryService {
  constructor(
    @InjectRepository(Country)
    private readonly countries: Repository<Country>,
  ) {}

  /**
   * All countries, ordered by ISO alpha-2 code.
   *
   * Returned as a plain array (no pagination envelope): the country set is a bounded
   * reference collection (~195) that the /dunya hub + SVG map need in full, so
   * paginating it would only hurt the SEO hub — the same rationale as the province
   * `findAll`. (The pagination envelope is still deferred to the first genuinely
   * unbounded/growing list, per CLAUDE §2.)
   */
  async findAll(): Promise<CountryListItemDto[]> {
    const rows = await this.countries.find({ order: { isoCode: 'ASC' } });
    return rows.map((row) => this.toListItem(row));
  }

  /**
   * Purpose-sized bulk payload for the world-map hover-card: every country with the
   * identity fields + the three hover-card stats (population, area, derived neighbour
   * count), ISO-ordered. A bounded set the map pre-embeds at build/ISR time — returned
   * as a plain array (no envelope), same rationale as `findAll`.
   */
  async findMapSummary(): Promise<CountryMapSummaryDto[]> {
    const rows = await this.countries.find({ order: { isoCode: 'ASC' } });
    return rows.map((row) => this.toMapSummary(row));
  }

  /**
   * One country by either its TR or EN slug (the web repo routes both locales).
   * Unknown slug → 404 with a stable key; the web renders its own localized
   * `notFound()` page from that status.
   */
  async findBySlug(slug: string): Promise<CountryDetailDto> {
    const row = await this.countries.findOne({
      where: [{ slugTr: slug }, { slugEn: slug }],
    });

    if (!row) {
      // Stable message key (not a localized literal), same posture as ProvinceService.
      throw new NotFoundException('errors.country.notFound');
    }

    return this.toDetail(row);
  }

  private toListItem(row: Country): CountryListItemDto {
    return {
      isoCode: row.isoCode,
      nameTr: row.nameTr,
      nameEn: row.nameEn,
      continent: row.continent,
      slugTr: row.slugTr,
      slugEn: row.slugEn,
    };
  }

  private toMapSummary(row: Country): CountryMapSummaryDto {
    return {
      isoCode: row.isoCode,
      nameTr: row.nameTr,
      nameEn: row.nameEn,
      continent: row.continent,
      slugTr: row.slugTr,
      slugEn: row.slugEn,
      population: row.population,
      populationYear: row.populationYear,
      areaKm2: row.areaKm2,
      neighborCount: computeNeighborCount(row.neighborIsoCodes),
    };
  }

  private toDetail(row: Country): CountryDetailDto {
    return {
      isoCode: row.isoCode,
      isoCodeAlpha3: row.isoCodeAlpha3,
      nameTr: row.nameTr,
      nameEn: row.nameEn,
      slugTr: row.slugTr,
      slugEn: row.slugEn,
      continent: row.continent,
      unSubregionTr: row.unSubregionTr,
      introTr: row.introTr,
      population: row.population,
      populationYear: row.populationYear,
      areaKm2: row.areaKm2,
      neighborCount: computeNeighborCount(row.neighborIsoCodes),
      neighborIsoCodes: row.neighborIsoCodes,
      capitalNameTr: row.capitalNameTr,
      capitalNameEn: row.capitalNameEn,
      capitalLatitude: row.capitalLatitude,
      capitalLongitude: row.capitalLongitude,
      officialLanguagesTr: row.officialLanguagesTr,
      currencyNameTr: row.currencyNameTr,
      currencyCode: row.currencyCode,
      governmentFormTr: row.governmentFormTr,
      independenceNoteTr: row.independenceNoteTr,
      landformNoteTr: row.landformNoteTr,
      climateNoteTr: row.climateNoteTr,
      hydrographyNoteTr: row.hydrographyNoteTr,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
