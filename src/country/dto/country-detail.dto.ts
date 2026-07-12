import { ApiProperty } from '@nestjs/swagger';
import { Continent } from '../../common/continent.enum';

/**
 * Full detail payload for a ülke detay sayfası (`/dunya/{slug}`, SSG source).
 *
 * Research-derived fields are `nullable` because the content pipeline fills them
 * progressively after fact-check; the web side must handle absent data (an unverified
 * fact stays absent, never invented). Two country-specific shapes vs the province model:
 *   - `neighborCount` is SERVER-DERIVED (neighbour-array length) — the "ilçe sayısı"
 *     replacement; `neighborIsoCodes` carries the raw array for the hub-and-spoke.
 *   - climate is `climateNoteTr` FREE PROSE only — there is no structured Köppen field
 *     at country scale (owner-ruled → DEC 2026-07-13).
 */
export class CountryDetailDto {
  @ApiProperty({ example: 'TR', description: 'ISO 3166-1 alpha-2 kodu.' })
  isoCode!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'TUR',
    description: 'ISO 3166-1 alpha-3 kodu (ikincil tanımlayıcı).',
  })
  isoCodeAlpha3!: string | null;

  @ApiProperty({ example: 'Türkiye', description: 'Ülke adı (TR).' })
  nameTr!: string;

  @ApiProperty({ example: 'Türkiye', description: 'Ülke adı (EN).' })
  nameEn!: string;

  @ApiProperty({ example: 'turkiye', description: 'TR slug (routing key).' })
  slugTr!: string;

  @ApiProperty({ example: 'turkey', description: 'EN slug (routing key).' })
  slugEn!: string;

  @ApiProperty({ enum: Continent, description: 'Kıta.' })
  continent!: Continent;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Batı Asya',
    description: 'BM alt-bölgesi (UNSD M49) TR etiketi.',
  })
  unSubregionTr!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example:
      "Türkiye, Asya ile Avrupa'yı birbirine bağlayan, üç tarafı denizlerle çevrili bir ülkedir.",
    description: 'Yazılı açılış cümlesi (ülke girişi). Null ise web veri-tabanlı bir cümle kurar.',
  })
  introTr!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 85372000,
    description: 'Nüfus (World Bank / UN). Null until fact-checked.',
  })
  population!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 2024, description: 'Nüfus referans yılı.' })
  populationYear!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 783562,
    description: 'Yüzölçümü (km², World Bank / UN).',
  })
  areaKm2!: number | null;

  @ApiProperty({
    type: Number,
    example: 8,
    description:
      'Komşu ülke sayısı — SERVER-DERIVED: neighbour ISO-code array length (the "ilçe ' +
      'sayısı" replacement). Consume this rather than recomputing. Always present (0 for ' +
      'island nations).',
  })
  neighborCount!: number;

  @ApiProperty({
    type: [String],
    example: ['GR', 'BG', 'GE', 'AM', 'AZ', 'IR', 'IQ', 'SY'],
    description: 'Komşu ülkelerin ISO 3166-1 alpha-2 kodları (hub-and-spoke için).',
  })
  neighborIsoCodes!: string[];

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Ankara',
    description: 'Başkent adı (TR).',
  })
  capitalNameTr!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Ankara',
    description: 'Başkent adı (EN).',
  })
  capitalNameEn!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 39.9334,
    description: 'Başkent enlemi (decimal degrees).',
  })
  capitalLatitude!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 32.8597,
    description: 'Başkent boylamı (decimal degrees).',
  })
  capitalLongitude!: number | null;

  @ApiProperty({
    type: [String],
    nullable: true,
    example: ['Türkçe'],
    description: 'Resmi dil(ler) (TR dil adları). Null = araştırılmadı.',
  })
  officialLanguagesTr!: string[] | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Türk lirası',
    description: 'Para birimi adı (TR).',
  })
  currencyNameTr!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'TRY',
    description: 'Para birimi kodu (ISO 4217).',
  })
  currencyCode!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Üniter başkanlık cumhuriyeti',
    description: 'Yönetim biçimi (TR).',
  })
  governmentFormTr!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '29 Ekim 1923',
    description: 'Bağımsızlık tarihi / notu (serbest metin, yapılandırılmış tarih değil).',
  })
  independenceNoteTr!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Öne çıkan yer şekilleri / jeoloji notu (TR).',
  })
  landformNoteTr!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'İklim — serbest anlatı düzyazısı (ülke içi bölgesel iklim çeşitliliği). ' +
      'Yapılandırılmış Köppen kodu DEĞİL (ülke ölçeğinde tek kod yanıltıcı olur).',
  })
  climateNoteTr!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Hidrografya — kısa düzyazı not (nehir/göl/deniz anlatısı, TR).',
  })
  hydrographyNoteTr!: string | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Kayıt oluşturulma zamanı.' })
  createdAt!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Son güncelleme zamanı (SEO dateModified / sitemap lastmod).',
  })
  updatedAt!: string;
}
