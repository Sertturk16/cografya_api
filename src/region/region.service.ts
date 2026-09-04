import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GeographicRegion } from '../common/geographic-region.enum';
import {
  GEOGRAPHIC_REGIONS_ORDERED,
  geographicRegionSlug,
} from '../common/geographic-region-slug.constant';
import { Province } from '../province/entities/province.entity';
import { computePopulationDensity } from '../province/province.service';
import { RegionComparisonItemDto } from './dto/region-comparison-item.dto';
import { RegionDetailDto } from './dto/region-detail.dto';
import { RegionListItemDto } from './dto/region-list-item.dto';
import { RegionProvinceItemDto } from './dto/region-province-item.dto';
import { Region } from './entities/region.entity';

@Injectable()
export class RegionService {
  constructor(
    @InjectRepository(Region)
    private readonly regions: Repository<Region>,
    @InjectRepository(Province)
    private readonly provinces: Repository<Province>,
  ) {}

  /**
   * List all seven geographic regions with live aggregated numbers from the provinces table.
   * Eliminates numerical drift between province database records and region summaries.
   */
  async findAll(): Promise<RegionListItemDto[]> {
    const [regionRows, provinceRows] = await Promise.all([
      this.regions.find(),
      this.provinces.find(),
    ]);

    const { totalTurkeyPopulation, totalTurkeyArea } = this.calculateTurkeyTotals(provinceRows);

    // Build region map for fast lookup
    const regionMap = new Map<GeographicRegion, Region>();
    for (const r of regionRows) {
      regionMap.set(r.region, r);
    }

    const items: RegionListItemDto[] = [];
    for (const regionEnum of GEOGRAPHIC_REGIONS_ORDERED) {
      const regionEntity = regionMap.get(regionEnum);
      if (!regionEntity) {
        continue;
      }

      const matchingProvinces = provinceRows.filter((p) => p.region === regionEnum);
      const { population, areaKm2, districtCount } = this.aggregateProvinces(matchingProvinces);

      const popDensity = computePopulationDensity(population, areaKm2) ?? 0;
      const popShare =
        totalTurkeyPopulation > 0
          ? Math.round((population / totalTurkeyPopulation) * 10000) / 100
          : 0;
      const areaShare =
        totalTurkeyArea > 0 ? Math.round((areaKm2 / totalTurkeyArea) * 10000) / 100 : 0;

      items.push({
        slug: regionEntity.slug,
        nameTr: regionEntity.nameTr,
        headingName: regionEntity.headingName,
        region: regionEntity.region,
        provinceCount: matchingProvinces.length,
        districtCount,
        population,
        populationSharePercent: popShare,
        areaKm2,
        areaSharePercent: areaShare,
        populationDensity: popDensity,
        gdpShareApproxPercent: regionEntity.gdpShareApproxPercent,
      });
    }

    return items;
  }

  /**
   * Get full 15-section detail for a region by its canonical URL slug.
   * Aggregates province list and 7-region comparative table dynamically.
   */
  async findBySlug(slug: string): Promise<RegionDetailDto> {
    const [region, allProvinces, allRegions] = await Promise.all([
      this.regions.findOne({ where: { slug } }),
      this.provinces.find(),
      this.regions.find(),
    ]);

    if (!region) {
      throw new NotFoundException('errors.region.notFound');
    }

    const { totalTurkeyPopulation, totalTurkeyArea } = this.calculateTurkeyTotals(allProvinces);
    const matchingProvinces = allProvinces.filter((p) => p.region === region.region);
    const { population, areaKm2, districtCount } = this.aggregateProvinces(matchingProvinces);

    const popDensity = computePopulationDensity(population, areaKm2) ?? 0;
    const popShare =
      totalTurkeyPopulation > 0
        ? Math.round((population / totalTurkeyPopulation) * 10000) / 100
        : 0;
    const areaShare =
      totalTurkeyArea > 0 ? Math.round((areaKm2 / totalTurkeyArea) * 10000) / 100 : 0;

    // Section 11: Provinces sorted by population descending
    const sortedProvinces = [...matchingProvinces].sort(
      (a, b) => (b.population ?? 0) - (a.population ?? 0),
    );
    const provinceDtos: RegionProvinceItemDto[] = sortedProvinces.map((p) => ({
      plateCode: p.plateCode,
      nameTr: p.nameTr,
      slugTr: p.slugTr,
      population: p.population,
      areaKm2: p.areaKm2,
      climateNameTr: p.climateClassTr,
      climateKoppen: p.climateKoppen,
    }));

    // Section 13: 7-region comparison table sorted by population descending
    const regionEntityMap = new Map<GeographicRegion, Region>();
    for (const r of allRegions) {
      regionEntityMap.set(r.region, r);
    }

    const comparisonTable: RegionComparisonItemDto[] = [];
    for (const rEnum of GEOGRAPHIC_REGIONS_ORDERED) {
      const rEntity = regionEntityMap.get(rEnum);
      const rProvinces = allProvinces.filter((p) => p.region === rEnum);
      const rAgg = this.aggregateProvinces(rProvinces);
      const rDensity = computePopulationDensity(rAgg.population, rAgg.areaKm2) ?? 0;
      const rPopShare =
        totalTurkeyPopulation > 0
          ? Math.round((rAgg.population / totalTurkeyPopulation) * 10000) / 100
          : 0;

      comparisonTable.push({
        nameTr: rEntity ? rEntity.headingName : rEnum,
        slug: geographicRegionSlug(rEnum),
        provinceCount: rProvinces.length,
        population: rAgg.population,
        populationSharePercent: rPopShare,
        areaKm2: rAgg.areaKm2,
        populationDensity: rDensity,
      });
    }
    comparisonTable.sort((a, b) => b.population - a.population);

    return {
      slug: region.slug,
      nameTr: region.nameTr,
      headingName: region.headingName,
      region: region.region,
      metaTitle: region.metaTitle,
      metaDescription: region.metaDescription,
      h1: region.h1,
      introTr: region.introTr,
      provinceCount: matchingProvinces.length,
      districtCount,
      population,
      populationSharePercent: popShare,
      areaKm2,
      areaSharePercent: areaShare,
      populationDensity: popDensity,
      gdpShareApproxPercent: region.gdpShareApproxPercent,
      highestPointName: region.highestPointName,
      highestPointElevationM: region.highestPointElevationM,
      highestPointProvince: region.highestPointProvince,
      coastalSeas: region.coastalSeas,
      neighborRegions: region.neighborRegions,
      neighborCountries: region.neighborCountries,
      subregionCount: region.subregions.length,
      subregions: region.subregions,
      footnotes: region.footnotes,
      locationAndBordersTr: region.locationAndBordersTr,
      landformsTr: region.landformsTr,
      climateAndVegetationTr: region.climateAndVegetationTr,
      hydrographyTr: region.hydrographyTr,
      settlementAndPopulationTr: region.settlementAndPopulationTr,
      economyTr: region.economyTr,
      subregionsTr: region.subregionsTr,
      provinces: provinceDtos,
      disasterAndEarthquakeTr: region.disasterAndEarthquakeTr,
      comparisonTr: region.comparisonTr,
      comparisonTable,
      faqs: region.faqs,
      sourcesNoteTr: region.sourcesNoteTr,
      createdAt: region.createdAt.toISOString(),
      updatedAt: region.updatedAt.toISOString(),
    };
  }

  private calculateTurkeyTotals(provinces: Province[]): {
    totalTurkeyPopulation: number;
    totalTurkeyArea: number;
  } {
    let totalTurkeyPopulation = 0;
    let totalTurkeyArea = 0;
    for (const p of provinces) {
      if (p.population) totalTurkeyPopulation += p.population;
      if (p.areaKm2) totalTurkeyArea += p.areaKm2;
    }
    return { totalTurkeyPopulation, totalTurkeyArea };
  }

  private aggregateProvinces(provinces: Province[]): {
    population: number;
    areaKm2: number;
    districtCount: number;
  } {
    let population = 0;
    let areaKm2 = 0;
    let districtCount = 0;
    for (const p of provinces) {
      if (p.population) population += p.population;
      if (p.areaKm2) areaKm2 += p.areaKm2;
      if (p.districtCount) districtCount += p.districtCount;
    }
    return { population, areaKm2, districtCount };
  }
}
