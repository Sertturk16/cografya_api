import { ApiProperty } from '@nestjs/swagger';
import { GeographicRegion } from '../../common/geographic-region.enum';
import { RegionComparisonItemDto } from './region-comparison-item.dto';
import { RegionFaqDto } from './region-faq.dto';
import { RegionProvinceItemDto } from './region-province-item.dto';

/**
 * Full 15-section detail payload for geographic region pages (/v2/turkiye/bolge/[slug]).
 */
export class RegionDetailDto {
  @ApiProperty({ example: 'marmara', description: 'URL identifier slug.' })
  slug!: string;

  @ApiProperty({ example: 'Marmara Bölgesi', description: 'Tam bölge adı.' })
  nameTr!: string;

  @ApiProperty({ example: 'Marmara', description: 'Kısa başlık adı.' })
  headingName!: string;

  @ApiProperty({ enum: GeographicRegion, description: 'Coğrafi bölge enum anahtarı.' })
  region!: GeographicRegion;

  @ApiProperty({
    example: 'Marmara Bölgesi: 11 İl, İklim ve Ekonomik Ağırlık',
    description: 'Bölüm 1 SEO başlığı.',
  })
  metaTitle!: string;

  @ApiProperty({
    example: "Marmara Bölgesi'nin 11 ilinde 26,7 milyon kişi yaşar...",
    description: 'Bölüm 1 meta açıklama.',
  })
  metaDescription!: string;

  @ApiProperty({ example: 'Marmara Bölgesi', description: 'H1 başlığı.' })
  h1!: string;

  @ApiProperty({
    example: 'Marmara Bölgesi, adını ortasındaki denizden alır...',
    description: 'Bölüm 2 H1 altı giriş paragrafı.',
  })
  introTr!: string;

  // Bölüm 3: Temel Bilgiler (Künye)
  @ApiProperty({ example: 11, description: 'Bölgedeki il sayısı.' })
  provinceCount!: number;

  @ApiProperty({ example: 158, description: 'Bölgedeki toplam ilçe sayısı.' })
  districtCount!: number;

  @ApiProperty({ example: 26711525, description: 'Bölgenin toplam nüfusu.' })
  population!: number;

  @ApiProperty({ example: 31.03, description: 'Türkiye nüfusu içindeki payı (%).' })
  populationSharePercent!: number;

  @ApiProperty({ example: 72666, description: 'Bölgenin toplam yüzölçümü (km²).' })
  areaKm2!: number;

  @ApiProperty({ example: 9.32, description: 'Türkiye yüzölçümü içindeki payı (%).' })
  areaSharePercent!: number;

  @ApiProperty({ example: 368, description: 'Aritmetik nüfus yoğunluğu (kişi/km²).' })
  populationDensity!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 43.0,
    description: 'Bölgenin yaklaşık GSYH payı (%).',
  })
  gdpShareApproxPercent!: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Uludağ',
    description: 'Bölgenin en yüksek noktasının adı.',
  })
  highestPointName!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 2543,
    description: 'Bölgenin en yüksek noktasının rakımı (metre).',
  })
  highestPointElevationM!: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Bursa',
    description: 'En yüksek noktanın bulunduğu il.',
  })
  highestPointProvince!: string | null;

  @ApiProperty({
    type: [String],
    example: ['Karadeniz', 'Marmara Denizi', 'Ege Denizi'],
    description: 'Kıyısı olan denizler.',
  })
  coastalSeas!: string[];

  @ApiProperty({
    type: [String],
    example: ['Ege', 'Karadeniz', 'İç Anadolu'],
    description: 'Komşu coğrafi bölgeler.',
  })
  neighborRegions!: string[];

  @ApiProperty({
    type: [String],
    example: ['Bulgaristan', 'Yunanistan'],
    description: 'Komşu ülkeler.',
  })
  neighborCountries!: string[];

  @ApiProperty({ example: 4, description: 'Bölgeye ait coğrafi bölüm sayısı.' })
  subregionCount!: number;

  @ApiProperty({
    type: [String],
    example: [
      'Yıldız Dağları Bölümü',
      'Ergene Bölümü',
      'Çatalca-Kocaeli Bölümü',
      'Güney Marmara Bölümü',
    ],
    description: '1941 Coğrafya Kongresi bölümleri listesi.',
  })
  subregions!: string[];

  @ApiProperty({
    type: [String],
    example: ['Şerh: TÜİK İBBS Düzey-1 sınıflandırması...'],
    description: 'Künye altındaki metodolojik şerhler ve dipnotlar.',
  })
  footnotes!: string[];

  // Bölümler 4-10: Nitel metinler
  @ApiProperty({ description: 'Bölüm 4: Konum ve Sınırlar gövde metni.' })
  locationAndBordersTr!: string;

  @ApiProperty({ description: 'Bölüm 5: Yeryüzü Şekilleri gövde metni.' })
  landformsTr!: string;

  @ApiProperty({ description: 'Bölüm 6: İklim ve Bitki Örtüsü gövde metni.' })
  climateAndVegetationTr!: string;

  @ApiProperty({ description: 'Bölüm 7: Hidrografya gövde metni.' })
  hydrographyTr!: string;

  @ApiProperty({ description: 'Bölüm 8: Nüfus ve Yerleşme gövde metni.' })
  settlementAndPopulationTr!: string;

  @ApiProperty({ description: 'Bölüm 9: Ekonomik Ağırlık gövde metni.' })
  economyTr!: string;

  @ApiProperty({ description: 'Bölüm 10: Coğrafi Bölümleri gövde metni.' })
  subregionsTr!: string;

  // Bölüm 11: İller tablosu
  @ApiProperty({
    type: [RegionProvinceItemDto],
    description: 'Bölüm 11: Bölgedeki illerin canlı veri tablosu.',
  })
  provinces!: RegionProvinceItemDto[];

  // Bölüm 12: Afet ve Deprem
  @ApiProperty({ description: 'Bölüm 12: Deprem ve Afet Riski gövde metni.' })
  disasterAndEarthquakeTr!: string;

  // Bölüm 13: Türkiye İçindeki Yeri
  @ApiProperty({ description: 'Bölüm 13: Karşılaştırma tanıtım metni.' })
  comparisonTr!: string;

  @ApiProperty({
    type: [RegionComparisonItemDto],
    description: 'Bölüm 13: 7 bölgenin karşılaştırma tablosu.',
  })
  comparisonTable!: RegionComparisonItemDto[];

  // Bölüm 14: Sık Sorulan Sorular
  @ApiProperty({
    type: [RegionFaqDto],
    description: 'Bölüm 14: SSS listesi (FAQPage JSON-LD taşıyıcısı).',
  })
  faqs!: RegionFaqDto[];

  // Bölüm 15: Kaynaklar
  @ApiProperty({ description: 'Bölüm 15: Kaynakça notu.' })
  sourcesNoteTr!: string;

  @ApiProperty({ example: '2026-09-04T12:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-09-04T12:00:00.000Z' })
  updatedAt!: string;
}
