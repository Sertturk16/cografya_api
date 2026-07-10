import { ApiProperty } from '@nestjs/swagger';
import { GeographicRegion } from '../../common/geographic-region.enum';

/**
 * Lean list payload for the il-hub index.
 *
 * Read-DTO tiers for this entity are List + Detail (ProvinceDetailDto) + MapSummary
 * (ProvinceMapSummaryDto) — the last a purpose-sized bulk read for the homepage map
 * hover-card. Each has a concrete consumer, so none is speculative (CLAUDE §2 "keep
 * DTO tiers minimal" — consciously ratified: three READ shapes, no more). A write/
 * "Response" tier is still intentionally NOT introduced: the API is public read-only
 * with no write endpoint echoing input back, so it would be speculative today.
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
