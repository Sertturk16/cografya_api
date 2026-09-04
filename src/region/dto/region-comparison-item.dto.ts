import { ApiProperty } from '@nestjs/swagger';

/**
 * 7-region comparative row in region detail page (Bölüm 13).
 */
export class RegionComparisonItemDto {
  @ApiProperty({ example: 'Marmara', description: 'Bölge adı.' })
  nameTr!: string;

  @ApiProperty({ example: 'marmara', description: 'Bölge slugı.' })
  slug!: string;

  @ApiProperty({ example: 11, description: 'İl sayısı.' })
  provinceCount!: number;

  @ApiProperty({ example: 26711525, description: 'Nüfus.' })
  population!: number;

  @ApiProperty({ example: 31.03, description: 'Nüfus payı (%).' })
  populationSharePercent!: number;

  @ApiProperty({ example: 72666, description: 'Yüzölçümü (km²).' })
  areaKm2!: number;

  @ApiProperty({ example: 368, description: 'Nüfus yoğunluğu (kişi/km²).' })
  populationDensity!: number;
}
