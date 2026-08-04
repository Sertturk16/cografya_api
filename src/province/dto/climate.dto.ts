import { ApiProperty } from '@nestjs/swagger';
import {
  CLIMATE_SOURCE_ERA5_LAND_MONTHLY,
  type Climate,
  type ClimateDerived,
  type ClimateMonthlyNormal,
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
 * repo's `next-intl` `getFormatter()` concern. NOTHING derived here is attributed to the provider
 * — the annual/seasonal figures are ours, computed from the series C3S publishes.
 *
 * The `example` values below are illustrative of the RANGE and PRECISION a consumer should
 * expect. They are not fact claims about any province and must never be read as one.
 */

/** One month of a province's climate normals — the core pair, both always present. */
export class ClimateMonthlyNormalDto implements ClimateMonthlyNormal {
  @ApiProperty({ type: Number, example: 7, description: '1 = Ocak … 12 = Aralık.' })
  month!: number;

  @ApiProperty({
    type: Number,
    example: 24.1,
    description:
      '30 yıllık (1991-2020) aylık ortalama sıcaklık (°C). Çekirdek çift — her yayınlanan ilde doludur.',
  })
  tempMeanC!: number;

  @ApiProperty({
    type: Number,
    example: 21.5,
    description:
      '30 yıllık (1991-2020) aylık toplam yağış ortalaması (mm). Çekirdek çift — her yayınlanan ilde doludur.',
  })
  precipitationMm!: number;
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
 * DERIVED figures — computed from the series, never stored, NOT attributable to the provider: C3S
 * publishes a gridded reanalysis, not a per-province annual mean or a seasonal breakdown. Raw
 * numbers; the web formats them. Month fields are 1-12 indices; a tie resolves to the earliest
 * month.
 */
export class ClimateDerivedDto implements ClimateDerived {
  @ApiProperty({
    type: Number,
    example: 14.7,
    description:
      'Yıllık ortalama sıcaklık (°C) — 12 aylık ortalamanın ortalaması (TÜRETİLMİŞ; kaynağa atfedilemez).',
  })
  annualMeanTempC!: number;

  @ApiProperty({
    type: Number,
    example: 630.2,
    description:
      'Yıllık toplam yağış (mm) — 12 aylık toplamın toplamı (TÜRETİLMİŞ; kaynağa atfedilemez).',
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
    example: 18.3,
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
 * Full climate payload: the stored ERA5-Land series + source/period, PLUS the derived block.
 * `implements Climate` so the served contract mirrors the shared interface exactly.
 */
export class ClimateDto implements Climate {
  @ApiProperty({
    enum: [CLIMATE_SOURCE_ERA5_LAND_MONTHLY],
    example: CLIMATE_SOURCE_ERA5_LAND_MONTHLY,
    description:
      'Kaynak seri kimliği — Copernicus C3S ERA5-Land aylık ortalamaları, 81 il için tek dataset.',
  })
  source!: ClimateSource;

  @ApiProperty({
    type: String,
    example: 'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-monthly-means',
    description:
      'Serinin türetildiği ERA5-Land dataset sayfası — 81 ilde AYNI sabit değer (il başına sayfa yoktur).',
  })
  sourceUrl!: string;

  @ApiProperty({
    type: Number,
    example: 1991,
    description: 'Normal penceresi başlangıç yılı — WMO 1991-2020, 81 ilde sabit.',
  })
  periodStartYear!: number;

  @ApiProperty({
    type: Number,
    example: 2020,
    description: 'Normal penceresi bitiş yılı — WMO 1991-2020, 81 ilde sabit.',
  })
  periodEndYear!: number;

  @ApiProperty({
    type: [ClimateMonthlyNormalDto],
    description: 'Aylık normaller — tam 12 ay, 1-12 sırasıyla.',
  })
  months!: ClimateMonthlyNormalDto[];

  @ApiProperty({
    type: ClimateDerivedDto,
    description: 'Seriden TÜRETİLMİŞ yıllık/uç/mevsimsel değerler — kaynağa atfedilemez.',
  })
  derived!: ClimateDerivedDto;
}
