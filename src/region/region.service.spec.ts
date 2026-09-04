import { describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { GeographicRegion } from '../common/geographic-region.enum';
import { Province } from '../province/entities/province.entity';
import { Region } from './entities/region.entity';
import { RegionService } from './region.service';

function makeMockRegion(partial: Partial<Region> = {}): Region {
  const region = new Region();
  region.id = '11111111-1111-1111-1111-111111111111';
  region.region = GeographicRegion.Marmara;
  region.slug = 'marmara';
  region.nameTr = 'Marmara Bölgesi';
  region.headingName = 'Marmara';
  region.metaTitle = 'Marmara Bölgesi: 11 İl, İklim ve Ekonomik Ağırlık';
  region.metaDescription = 'Marmara Bölgesi açıklaması...';
  region.h1 = 'Marmara Bölgesi';
  region.introTr = 'Marmara Bölgesi giriş paragrafı...';
  region.highestPointName = 'Uludağ';
  region.highestPointElevationM = 2543;
  region.highestPointProvince = 'Bursa';
  region.coastalSeas = ['Marmara Denizi', 'Karadeniz', 'Ege Denizi'];
  region.neighborRegions = ['Ege', 'Karadeniz', 'İç Anadolu'];
  region.neighborCountries = ['Bulgaristan', 'Yunanistan'];
  region.subregions = ['Çatalca-Kocaeli', 'Ergene', 'Güney Marmara', 'Yıldız Dağları'];
  region.gdpShareApproxPercent = 43.0;
  region.locationAndBordersTr = 'Konum metni';
  region.landformsTr = 'Yeryüzü şekilleri metni';
  region.climateAndVegetationTr = 'İklim metni';
  region.hydrographyTr = 'Hidrografya metni';
  region.settlementAndPopulationTr = 'Nüfus metni';
  region.economyTr = 'Ekonomi metni';
  region.subregionsTr = 'Bölümler metni';
  region.disasterAndEarthquakeTr = 'Afet metni';
  region.comparisonTr = 'Karşılaştırma metni';
  region.faqs = [{ question: 'Kaç il var?', answer: '11 il var.' }];
  region.sourcesNoteTr = 'Kaynak metni';
  region.footnotes = ['Şerh: İBBS Düzey-1...'];
  region.createdAt = new Date('2026-09-04T12:00:00Z');
  region.updatedAt = new Date('2026-09-04T12:00:00Z');

  return Object.assign(region, partial);
}

function makeMockProvince(partial: Partial<Province> = {}): Province {
  const p = new Province();
  p.id = '22222222-2222-2222-2222-222222222222';
  p.plateCode = '34';
  p.nameTr = 'İstanbul';
  p.slugTr = 'istanbul';
  p.slugEn = 'istanbul';
  p.region = GeographicRegion.Marmara;
  p.population = 15000000;
  p.areaKm2 = 5000;
  p.districtCount = 39;
  p.climateClassTr = 'Marmara geçiş iklimi';
  p.climateKoppen = 'Csa';
  return Object.assign(p, partial);
}

describe('RegionService', () => {
  it('findAll returns regions with calculated totals from provinces', async () => {
    const regionMarmara = makeMockRegion({
      region: GeographicRegion.Marmara,
      slug: 'marmara',
      headingName: 'Marmara',
    });
    const regionEge = makeMockRegion({
      region: GeographicRegion.Ege,
      slug: 'ege',
      nameTr: 'Ege Bölgesi',
      headingName: 'Ege',
    });

    const provIstanbul = makeMockProvince({
      plateCode: '34',
      region: GeographicRegion.Marmara,
      population: 15000000,
      areaKm2: 5000,
      districtCount: 39,
    });
    const provIzmir = makeMockProvince({
      plateCode: '35',
      nameTr: 'İzmir',
      region: GeographicRegion.Ege,
      population: 4500000,
      areaKm2: 12000,
      districtCount: 30,
    });

    const mockRegionRepo = {
      find: jest.fn<() => Promise<Region[]>>().mockResolvedValue([regionMarmara, regionEge]),
      findOne: jest.fn(),
    } as unknown as Repository<Region>;

    const mockProvinceRepo = {
      find: jest.fn<() => Promise<Province[]>>().mockResolvedValue([provIstanbul, provIzmir]),
    } as unknown as Repository<Province>;

    const service = new RegionService(mockRegionRepo, mockProvinceRepo);
    const list = await service.findAll();

    expect(list).toHaveLength(2);
    expect(list[0]!.slug).toBe('marmara');
    expect(list[0]!.provinceCount).toBe(1);
    expect(list[0]!.population).toBe(15000000);
    expect(list[0]!.areaKm2).toBe(5000);
    expect(list[0]!.districtCount).toBe(39);
    expect(list[0]!.populationDensity).toBe(3000);

    expect(list[1]!.slug).toBe('ege');
    expect(list[1]!.provinceCount).toBe(1);
    expect(list[1]!.population).toBe(4500000);
    expect(list[1]!.districtCount).toBe(30);
  });

  it('findBySlug returns 15-section detail for valid slug', async () => {
    const regionMarmara = makeMockRegion();
    const provIstanbul = makeMockProvince({
      plateCode: '34',
      population: 15000000,
    });
    const provBursa = makeMockProvince({
      plateCode: '16',
      nameTr: 'Bursa',
      population: 3000000,
    });

    const mockRegionRepo = {
      find: jest.fn<() => Promise<Region[]>>().mockResolvedValue([regionMarmara]),
      findOne: jest.fn<() => Promise<Region | null>>().mockResolvedValue(regionMarmara),
    } as unknown as Repository<Region>;

    const mockProvinceRepo = {
      find: jest.fn<() => Promise<Province[]>>().mockResolvedValue([provIstanbul, provBursa]),
    } as unknown as Repository<Province>;

    const service = new RegionService(mockRegionRepo, mockProvinceRepo);
    const detail = await service.findBySlug('marmara');

    expect(detail.slug).toBe('marmara');
    expect(detail.h1).toBe('Marmara Bölgesi');
    expect(detail.provinceCount).toBe(2);
    expect(detail.population).toBe(18000000);
    expect(detail.provinces).toHaveLength(2);
    // Verified sorted by population descending: Istanbul (15M) then Bursa (3M)
    expect(detail.provinces[0]!.plateCode).toBe('34');
    expect(detail.provinces[1]!.plateCode).toBe('16');
    expect(detail.faqs).toHaveLength(1);
    expect(detail.subregions).toHaveLength(4);
  });

  it('findBySlug throws NotFoundException for unknown slug', async () => {
    const mockRegionRepo = {
      find: jest.fn<() => Promise<Region[]>>().mockResolvedValue([]),
      findOne: jest.fn<() => Promise<Region | null>>().mockResolvedValue(null),
    } as unknown as Repository<Region>;

    const mockProvinceRepo = {
      find: jest.fn<() => Promise<Province[]>>().mockResolvedValue([]),
    } as unknown as Repository<Province>;

    const service = new RegionService(mockRegionRepo, mockProvinceRepo);
    await expect(service.findBySlug('bilinmeyen-bolge')).rejects.toThrow(NotFoundException);
  });
});
