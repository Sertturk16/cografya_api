import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MeasurementType } from '../entities/measurement.entity';
import { MeasurementPointDto } from './measurement-point.dto';

/**
 * The persisted-row echo (plan §5.8), returned by all five routes.
 *
 * **Includes `id`, unlike `FavoriteDto`/`GameRoundDto`.** Those two omit `id`/`userId` because the
 * caller addresses every route by a BUSINESS key it already holds — neither module has a
 * per-item `GET`/`PATCH`/`DELETE` routed by an opaque server id. This module's CRUD IS routed by
 * server `id` (plan §5.5), so publishing it is required for the client to ever construct those
 * URLs — a deliberate, named divergence, not an oversight.
 */
export class MeasurementDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;

  @ApiProperty({
    enum: MeasurementType,
    example: MeasurementType.Distance,
  })
  type!: MeasurementType;

  @ApiProperty({ type: [MeasurementPointDto] })
  points!: MeasurementPointDto[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'İstanbul - Ankara mesafesi',
    description: 'null when no title was set or the title was cleared.',
  })
  title!: string | null;

  @ApiProperty({
    type: String,
    minLength: 1,
    maxLength: 128,
    example: '018f2f3a-9c3e-7b2a-8b9d-2e6f1a7c9d40',
    description: 'The idempotency key this measurement was created with.',
  })
  clientMeasurementId!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When this measurement was first saved, UTC.',
  })
  createdAt!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When this row last changed (creation, or a subsequent title rename), UTC.',
  })
  updatedAt!: string;
}
