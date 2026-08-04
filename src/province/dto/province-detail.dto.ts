import { ApiProperty } from '@nestjs/swagger';
import { GeographicRegion } from '../../common/geographic-region.enum';
import { ClimateDto } from './climate.dto';
import { EconomyIndicatorDto } from './economy-indicator.dto';
import { HydrographyFeatureDto } from './hydrography-feature.dto';

/**
 * Full detail payload for an il detay sayfası (SSG source).
 *
 * Research-derived fields are `nullable` because the content pipeline fills them
 * progressively after fact-check; the web side must handle absent data (an
 * unverified fact stays absent, never invented).
 */
export class ProvinceDetailDto {
  @ApiProperty({ example: '34', description: 'Plaka kodu.' })
  plateCode!: string;

  @ApiProperty({ example: 'İstanbul', description: 'İl adı (TR).' })
  nameTr!: string;

  @ApiProperty({ example: 'istanbul', description: 'TR slug (routing key).' })
  slugTr!: string;

  @ApiProperty({ example: 'istanbul', description: 'EN slug (routing key).' })
  slugEn!: string;

  @ApiProperty({ enum: GeographicRegion, description: 'Coğrafi bölge.' })
  region!: GeographicRegion;

  @ApiProperty({
    type: String,
    nullable: true,
    example:
      "İstanbul, Karadeniz ile Marmara Denizi'ni birbirine bağlayan Boğaz'ın iki yakasına kurulmuştur.",
    description:
      'Yazılı açılış cümlesi (il girişi). Null ise web veri-tabanlı bir cümle kurar (fallback).',
  })
  introTr!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 15754053,
    description: 'Nüfus (TÜİK ADNKS). Null until fact-checked.',
  })
  population!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 2025,
    description: 'Nüfus referans yılı.',
  })
  populationYear!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 5461,
    description: 'Yüzölçümü (km², HGM).',
  })
  areaKm2!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 39, description: 'İlçe sayısı.' })
  districtCount!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 2885,
    description:
      'Nüfus yoğunluğu (kişi/km²) — SERVER-COMPUTED, not stored: round(nüfus / yüzölçümü). ' +
      'Null when population or area is null. Consume this rather than recomputing, so the ' +
      'rounding/null rule stays single-sourced.',
  })
  populationDensity!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 33,
    description: 'İl merkezi rakımı (m) — MGM il-merkez istasyonu referansı.',
  })
  elevationM!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 40.9819,
    description: 'İl merkezi enlemi (decimal degrees) — MGM il-merkez istasyonu.',
  })
  latitude!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 28.8208,
    description: 'İl merkezi boylamı (decimal degrees) — MGM il-merkez istasyonu.',
  })
  longitude!: number | null;

  @ApiProperty({
    type: [String],
    example: ['59', '41'],
    description: 'Komşu illerin plaka kodları (hub-and-spoke için).',
  })
  neighborPlateCodes!: string[];

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Csa',
    description: 'Köppen iklim kısa kodu (MGM 2023).',
  })
  climateKoppen!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Akdeniz iklimi',
    description: 'MGM Türkçe iklim sınıf adı.',
  })
  climateClassTr!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example:
      "MGM'nin 2023 Köppen sınıflandırması bu ili Csa (Akdeniz iklimi) olarak verir; ancak MGM'nin kendi raporu bu basitleştirilmiş yöntemin bölgesel ayırt ediciliğinin sınırlı olduğunu not düşer.",
    description:
      "MGM Köppen metodolojik uyarı notu — Köppen değeriyle birlikte ZORUNLU olarak sunulur (bare bir 'Csa' yayınlanmaz).",
  })
  climateNoteTr!: string | null;

  @ApiProperty({
    type: ClimateDto,
    nullable: true,
    description:
      'İklim serisi (ERA5-Land 1991-2020 aylık normalleri + kaynak/dönem) + TÜRETİLMİŞ ' +
      'yıllık/mevsimsel değerler. Null = yayınlanabilir seri yok → web iklim bölümünü hiç render ' +
      'etmez. Türetilmiş değerler bizimdir, kaynağa atfedilemez; tüm sayılar ham ' +
      "(biçimlendirme web'in işi).",
  })
  climate!: ClimateDto | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "NOVA'nın il-il yazdığı iklim yorumu (TR) — mekanizma anlatan gerçek düzyazı. `climateNoteTr` " +
      '(kilitli MGM Köppen uyarısı) DEĞİL; ayrı bir alandır. İçerik dalgaları doldurana kadar null.',
  })
  climateNarrativeTr!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Öne çıkan yer şekilleri / jeoloji notu (TR).',
  })
  landformNoteTr!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Hidrografya — kısa düzyazı not (nehir/göl/baraj anlatısı, TR).',
  })
  hydrographyNoteTr!: string | null;

  @ApiProperty({
    type: [HydrographyFeatureDto],
    nullable: true,
    description:
      'Hidrografya — yapısal özellik listesi (baraj/nehir/göl). Null = araştırılmadı; ' +
      'boş dizi = "belirgin özellik yok" (bilinçli ifade).',
  })
  hydrographyFeatures!: HydrographyFeatureDto[] | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 93.5,
    description: 'Şehirleşme oranı (%) — TÜİK ADNKS (il/ilçe merkezi nüfusu / toplam).',
  })
  urbanizationRate!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 19.6,
    description: 'Net göç hızı (‰) — TÜİK Göç İstatistikleri; işaretli (net göç ± olabilir).',
  })
  netMigrationRate!: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Nüfus ve yerleşme — kısa düzyazı not (TR).',
  })
  settlementNoteTr!: string | null;

  @ApiProperty({
    type: EconomyIndicatorDto,
    nullable: true,
    description: 'Ekonomik coğrafya — TEK, TÜİK-çıpalı yapısal istatistik (serbest metin değil).',
  })
  economyIndicator!: EconomyIndicatorDto | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Kayıt oluşturulma zamanı.' })
  createdAt!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Son güncelleme zamanı (SEO dateModified / sitemap lastmod).',
  })
  updatedAt!: string;
}
