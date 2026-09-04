import { ApiProperty } from '@nestjs/swagger';
import { GeographicRegion } from '../../common/geographic-region.enum';

/**
 * Lean payload for region list & hub cards.
 */
export class RegionListItemDto {
  @ApiProperty({ example: 'marmara', description: 'URL identifier slug.' })
  slug!: string;

  @ApiProperty({ example: 'Marmara Bölgesi', description: 'Tam bölge adı.' })
  nameTr!: string;

  @ApiProperty({ example: 'Marmara', description: 'Kısa başlık adı.' })
  headingName!: string;

  @ApiProperty({ enum: GeographicRegion, description: 'Coğrafi bölge enum anahtarı.' })
  region!: GeographicRegion;

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
}
