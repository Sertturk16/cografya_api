import { ApiProperty } from '@nestjs/swagger';
import { AirQualityCategory, AirQualityPollutant, AirQualityStatus } from '../air-quality.types';

/**
 * Lean list payload for the 81-province hub — `GET /api/air-quality/provinces` (A2).
 *
 * **NOT SERVED BY ANY A1 ENDPOINT** — frozen contract, published for codegen. Bounded, fixed
 * set → plain typed array, no envelope, no pagination (playbook §2).
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
