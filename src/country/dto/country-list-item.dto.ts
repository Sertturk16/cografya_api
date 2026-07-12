import { ApiProperty } from '@nestjs/swagger';
import { Continent } from '../../common/continent.enum';

/**
 * Lean list payload for the /dunya ülke-hub index.
 *
 * Read-DTO tiers for this entity mirror the province model: List + Detail
 * (CountryDetailDto) + MapSummary (CountryMapSummaryDto) — the last a purpose-sized
 * bulk read for the world-map hover-card. Each has a concrete consumer, so none is
 * speculative (CLAUDE §2). A write/"Response" tier is intentionally NOT introduced: the
 * API is public read-only with no write endpoint echoing input back.
 *
 * Carries BOTH nameTr and nameEn (unlike the province list): country names exist in
 * both locales from day one (MFA source, SPEC §7), and the EN hub reuses the same lean
 * payload.
 */
export class CountryListItemDto {
  @ApiProperty({ example: 'TR', description: 'ISO 3166-1 alpha-2 kodu (stable, unique).' })
  isoCode!: string;

  @ApiProperty({ example: 'Türkiye', description: 'Ülke adı (TR).' })
  nameTr!: string;

  @ApiProperty({ example: 'Türkiye', description: 'Ülke adı (EN).' })
  nameEn!: string;

  @ApiProperty({ enum: Continent, description: 'Kıta.' })
  continent!: Continent;

  @ApiProperty({ example: 'turkiye', description: 'TR slug (routing key).' })
  slugTr!: string;

  @ApiProperty({ example: 'turkey', description: 'EN slug (routing key).' })
  slugEn!: string;
}
