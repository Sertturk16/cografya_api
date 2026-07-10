import { ApiProperty } from '@nestjs/swagger';
import { type EconomyIndicator } from '../province.types';

/**
 * A single TÜİK-anchored economic statistic for a province (the whole "Ekonomik
 * Coğrafya" section — a lone structured stat, never free prose; CONVENTIONS §4).
 * `implements EconomyIndicator` so the contract cannot drift from the stored jsonb.
 */
export class EconomyIndicatorDto implements EconomyIndicator {
  @ApiProperty({ example: "GSYH'de Türkiye payı", description: 'İstatistiğin ölçtüğü büyüklük.' })
  label!: string;

  @ApiProperty({
    example: '%30,2',
    description: 'Değer, string — pay/sıra/ürün adı olabildiği için (heterojen).',
  })
  value!: string;

  @ApiProperty({ type: Number, example: 2024, description: 'İstatistiğin referans yılı.' })
  year!: number;

  @ApiProperty({ example: 'TÜİK Bölgesel GSYH', description: 'Otoriter kaynak.' })
  source!: string;
}
