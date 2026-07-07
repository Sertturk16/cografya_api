import { ApiProperty } from '@nestjs/swagger';
import { GeographicRegion } from '../../common/geographic-region.enum';

/**
 * Lean list payload for the il-hub index + the light SVG map navigation.
 *
 * DTO tiers for this entity are List + Detail (see ProvinceDetailDto). A third
 * "Response" tier is intentionally NOT introduced: the API is public read-only
 * with no write endpoints echoing input back, so it would be speculative today.
 */
export class ProvinceListItemDto {
  @ApiProperty({ example: '34', description: 'Plaka kodu (stable, unique).' })
  plateCode!: string;

  @ApiProperty({ example: 'İstanbul', description: 'İl adı (TR).' })
  nameTr!: string;

  @ApiProperty({ enum: GeographicRegion, description: 'Coğrafi bölge.' })
  region!: GeographicRegion;

  @ApiProperty({ example: 'istanbul', description: 'TR slug (routing key).' })
  slugTr!: string;

  @ApiProperty({ example: 'istanbul', description: 'EN slug (routing key).' })
  slugEn!: string;
}
