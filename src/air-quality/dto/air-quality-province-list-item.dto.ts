import { ApiProperty } from '@nestjs/swagger';
import { AirQualityCategory, AirQualityPollutant, AirQualityStatus } from '../air-quality.types';

/**
 * Lean list payload for the 81-province hub — `GET /api/air-quality/provinces`. Frozen in A1,
 * served from A2b.
 *
 * Bounded, fixed set → plain typed array, no envelope, no pagination (ENGINEERING §2).
 *
 * DELIBERATELY LEAN: no attribution, no coordinates, no per-pollutant values. The hub renders a
 * map and a list; everything heavier belongs to the detail payload. Where the hub page sources
 * its licence line is an air-web decision (Atlas ruling Q6) — this DTO stays lean until an
 * additive field is agreed for a real consumer.
 */
export class AirQualityProvinceListItemDto {
  @ApiProperty({ type: String, example: '06' })
  plateCode!: string;

  @ApiProperty({ type: String, example: 'ankara' })
  slugTr!: string;

  @ApiProperty({ type: String, example: 'ankara' })
  slugEn!: string;

  @ApiProperty({ type: Number, nullable: true, minimum: 1, maximum: 6, example: 2 })
  band!: number | null;

  @ApiProperty({ enum: AirQualityCategory, nullable: true })
  category!: AirQualityCategory | null;

  @ApiProperty({ enum: AirQualityPollutant, nullable: true })
  dominantPollutant!: AirQualityPollutant | null;

  @ApiProperty({ enum: AirQualityStatus })
  status!: AirQualityStatus;

  @ApiProperty({ type: String, nullable: true, example: '2026-08-01T14:00:00.000Z' })
  validAtUtc!: string | null;
}
