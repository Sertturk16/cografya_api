import { ApiProperty } from '@nestjs/swagger';
import { GeographicRegion } from '../../common/geographic-region.enum';

/**
 * Purpose-sized bulk payload for the homepage's interactive SVG map hover-card
 * (SPEC "interactive-map-hover" §1.3 + §5.1). Served by `GET /api/provinces/map-summary`
 * for all 81 provinces at once, so the web repo can pre-embed the whole set at
 * build/ISR time and show a hover-card with ZERO per-hover network request (CWV/INP).
 *
 * A DEDICATED DTO, not extra fields on `ProvinceListItemDto`: the hover-card and
 * the il-hub list have different needs, so their contracts are kept decoupled — the
 * hub list stays lean and the map's shape can evolve independently. It is a
 * standalone class (not `extends ProvinceListItemDto`) on purpose: the small
 * overlap of identity fields is worth keeping the two contracts fully independent.
 *
 * The 4 summary numbers are `nullable`: only the 5 pilot provinces carry real data
 * today; the other 76 come back with nulls until seeded (same discipline as
 * `GET /api/provinces` — an unverified fact stays absent, never invented).
 */
export class ProvinceMapSummaryDto {
  @ApiProperty({ example: '34', description: 'Plaka kodu (stable, unique).' })
  plateCode!: string;

  @ApiProperty({ example: 'İstanbul', description: 'İl adı (TR).' })
  nameTr!: string;

  @ApiProperty({ enum: GeographicRegion, description: 'Coğrafi bölge.' })
  region!: GeographicRegion;

  @ApiProperty({ example: 'istanbul', description: 'TR slug (routing key — kart tıklaması).' })
  slugTr!: string;

  @ApiProperty({ example: 'istanbul', description: 'EN slug (routing key).' })
  slugEn!: string;

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
}
