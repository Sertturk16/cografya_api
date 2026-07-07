import { ApiProperty } from '@nestjs/swagger';
import { GeographicRegion } from '../../common/geographic-region.enum';

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
    example: 40,
    description: 'İl merkezi rakımı (m).',
  })
  elevationM!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 41.0136,
    description: 'İl merkezi enlemi (decimal degrees).',
  })
  latitude!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 28.955,
    description: 'İl merkezi boylamı (decimal degrees).',
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
    example: 'Cfa',
    description: 'Köppen iklim kısa kodu.',
  })
  climateKoppen!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Nemli ılıman iklim',
    description: 'MGM Türkçe iklim sınıf adı.',
  })
  climateClassTr!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Öne çıkan yer şekilleri / jeoloji notu (TR).',
  })
  landformNoteTr!: string | null;

  @ApiProperty({ type: String, format: 'date-time', description: 'Kayıt oluşturulma zamanı.' })
  createdAt!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Son güncelleme zamanı (SEO dateModified / sitemap lastmod).',
  })
  updatedAt!: string;
}
