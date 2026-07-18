import { ApiProperty } from '@nestjs/swagger';
import {
  CLIMATE_SOURCE_MGM_GENERAL,
  type Climate,
  type ClimateDerived,
  type ClimateExtremeRecord,
  type ClimateMonthlyNormal,
  type ClimateRecords,
  type ClimateSource,
  type SeasonalPrecipitation,
} from '../province.types';

/**
 * The climate contract DTOs. Each `implements` its shared interface from `province.types.ts`,
 * so the published OpenAPI schema and the stored/derived shapes cannot drift — a change to an
 * interface breaks compilation here until the DTO follows (the same discipline as
 * `HydrographyFeatureDto`).
 *
 * Every numeric field is a RAW number, never a pre-formatted string: formatting is the web
 * repo's `next-intl` `getFormatter()` concern. NOTHING derived here is attributed to MGM — the
 * annual/seasonal figures are ours (MGM's own "Yıllık" column is empty in the source).
 */

/** One dated all-time record (e.g. the wettest day on record). */
export class ClimateExtremeRecordDto implements ClimateExtremeRecord {
  @ApiProperty({ type: Number, example: 189.4, description: 'Ölçülen uç değer (ham sayı).' })
  value!: number;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '1968-12-26',
    description:
      'Gerçekleşme tarihi (ISO YYYY-MM-DD). MGM tarihi basmadıysa null — değerden bağımsız nullable.',
  })
  date!: string | null;
}

/** A province's all-time records (MGM's second `k=A` table). Each member independently nullable. */
export class ClimateRecordsDto implements ClimateRecords {
  @ApiProperty({
    type: ClimateExtremeRecordDto,
    nullable: true,
    description: 'Günlük toplam en yüksek yağış miktarı (mm).',
  })
  dailyMaxPrecipitationMm!: ClimateExtremeRecordDto | null;

  @ApiProperty({
    type: ClimateExtremeRecordDto,
    nullable: true,
    description: 'Günlük en hızlı rüzgâr (m/sn).',
  })
  fastestWindMs!: ClimateExtremeRecordDto | null;

  @ApiProperty({
    type: ClimateExtremeRecordDto,
    nullable: true,
    description: 'En yüksek kar yüksekliği (cm).',
  })
  maxSnowDepthCm!: ClimateExtremeRecordDto | null;
}

/** One month of a province's climate normals. Every measure nullable per month (see the interface). */
export class ClimateMonthlyNormalDto implements ClimateMonthlyNormal {
  @ApiProperty({ type: Number, example: 7, description: '1 = Ocak … 12 = Aralık.' })
  month!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 27.9,
    description: 'Ortalama sıcaklık (°C). Çekirdek çift — yayınlanan her ilde doludur.',
  })
  tempMeanC!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 33.2,
    description: 'Ortalama en yüksek sıcaklık (°C).',
  })
  tempMaxMeanC!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 22.6,
    description: 'Ortalama en düşük sıcaklık (°C).',
  })
  tempMinMeanC!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 4.7,
    description: 'Aylık toplam yağış miktarı ortalaması (mm). Çekirdek çift.',
  })
  precipitationMm!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 11.2,
    description: 'Ortalama günlük güneşlenme süresi (saat).',
  })
  sunshineHours!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 2.1,
    description: 'Ortalama yağışlı gün sayısı.',
  })
  rainyDays!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 45.6,
    description: 'O ay ölçülmüş en yüksek sıcaklık (°C) — uç değer, ortalama değil.',
  })
  tempRecordMaxC!: number | null;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '2000-07-30',
    description:
      '`tempRecordMaxC` gerçekleşme tarihi (ISO YYYY-MM-DD). Değerden bağımsız nullable.',
  })
  tempRecordMaxDate!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 12.3,
    description: 'O ay ölçülmüş en düşük sıcaklık (°C) — uç değer, ortalama değil.',
  })
  tempRecordMinC!: number | null;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '1976-07-05',
    description:
      '`tempRecordMinC` gerçekleşme tarihi (ISO YYYY-MM-DD). Değerden bağımsız nullable.',
  })
  tempRecordMinDate!: string | null;
}

/** Seasonal precipitation shares — whole integers summing to EXACTLY 100. */
export class SeasonalPrecipitationDto implements SeasonalPrecipitation {
  @ApiProperty({ type: Number, example: 45, description: 'Kış (Ara+Oca+Şub) yağış payı (%).' })
  winterPct!: number;

  @ApiProperty({ type: Number, example: 27, description: 'İlkbahar (Mar+Nis+May) yağış payı (%).' })
  springPct!: number;

  @ApiProperty({ type: Number, example: 6, description: 'Yaz (Haz+Tem+Ağu) yağış payı (%).' })
  summerPct!: number;

  @ApiProperty({ type: Number, example: 22, description: 'Sonbahar (Eyl+Eki+Kas) yağış payı (%).' })
  autumnPct!: number;
}

/**
 * DERIVED figures — computed from the series, never stored, NOT attributed to MGM (its own
 * "Yıllık" column is empty). Raw numbers; the web formats them. Month fields are 1-12 indices;
 * a tie resolves to the earliest month.
 */
export class ClimateDerivedDto implements ClimateDerived {
  @ApiProperty({
    type: Number,
    example: 19.1,
    description:
      'Yıllık ortalama sıcaklık (°C) — 12 aylık ortalamanın ortalaması (TÜRETİLMİŞ, MGM değil).',
  })
  annualMeanTempC!: number;

  @ApiProperty({
    type: Number,
    example: 592.4,
    description: 'Yıllık toplam yağış (mm) — 12 aylık toplamın toplamı (TÜRETİLMİŞ, MGM değil).',
  })
  annualPrecipitationMm!: number;

  @ApiProperty({ type: Number, example: 8, description: 'En sıcak ay (1-12).' })
  hottestMonth!: number;

  @ApiProperty({ type: Number, example: 1, description: 'En soğuk ay (1-12).' })
  coldestMonth!: number;

  @ApiProperty({ type: Number, example: 12, description: 'En yağışlı ay (1-12).' })
  wettestMonth!: number;

  @ApiProperty({ type: Number, example: 7, description: 'En kurak ay (1-12).' })
  driestMonth!: number;

  @ApiProperty({
    type: Number,
    example: 20.4,
    description:
      'Yıllık sıcaklık farkı (°C) — en sıcak ile en soğuk ay ortalaması arası (TÜRETİLMİŞ).',
  })
  annualTempRangeC!: number;

  @ApiProperty({
    type: SeasonalPrecipitationDto,
    description: 'Mevsimsel yağış yüzdeleri (tam 100 eder) — TÜRETİLMİŞ.',
  })
  seasonalPrecipitation!: SeasonalPrecipitationDto;
}

/**
 * Full climate payload: the stored MGM `k=A` series + source/period/records, PLUS the derived
 * block. `implements Climate` so the served contract mirrors the shared interface exactly.
 */
export class ClimateDto implements Climate {
  @ApiProperty({
    enum: [CLIMATE_SOURCE_MGM_GENERAL],
    example: CLIMATE_SOURCE_MGM_GENERAL,
    description: 'Kaynak seri kimliği — MGM Genel İstatistik tablosu (k=A), 81 il için tek seri.',
  })
  source!: ClimateSource;

  @ApiProperty({
    type: String,
    example: 'https://www.mgm.gov.tr/veridegerlendirme/il-ve-ilceler-istatistik.aspx?k=A&m=ICEL',
    description:
      'Bu serinin okunduğu MGM sayfası — il başına (MGM anahtarı Türkçe adla aynı değil).',
  })
  sourceUrl!: string;

  @ApiProperty({
    type: Number,
    example: 1929,
    description: 'Ölçüm periyodu başlangıç yılı — il başına değişir, sayfadan okunur.',
  })
  periodStartYear!: number;

  @ApiProperty({ type: Number, example: 2025, description: 'Ölçüm periyodu bitiş yılı.' })
  periodEndYear!: number;

  @ApiProperty({
    type: [ClimateMonthlyNormalDto],
    description: 'Aylık normaller — tam 12 ay, 1-12 sırasıyla.',
  })
  months!: ClimateMonthlyNormalDto[];

  @ApiProperty({ type: ClimateRecordsDto, description: 'Tüm zamanların rekorları.' })
  records!: ClimateRecordsDto;

  @ApiProperty({
    type: ClimateDerivedDto,
    description: 'Seriden TÜRETİLMİŞ yıllık/uç/mevsimsel değerler — MGM’e atfedilemez.',
  })
  derived!: ClimateDerivedDto;
}
