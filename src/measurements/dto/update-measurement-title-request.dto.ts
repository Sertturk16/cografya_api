import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, ValidateIf } from 'class-validator';
import { MEASUREMENT_TITLE_MAX_LENGTH } from './create-measurement-request.dto';

/**
 * `PATCH /api/measurements/:id` request body — title-only rename (plan §5.6). `type`/`points`/
 * `clientMeasurementId` stay immutable after create; re-measuring is a new `POST` with a new
 * idempotency key, not an edit.
 *
 * Omitting `title` entirely 400s naturally (no `@IsOptional()`, so `@IsString()` runs against
 * `undefined` and fails) — the caller must send either a bounded string or explicit `null` to
 * clear it.
 */
export class UpdateMeasurementTitleRequestDto {
  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: MEASUREMENT_TITLE_MAX_LENGTH,
    example: 'İstanbul - Ankara mesafesi',
    description: 'A bounded string to rename, or explicit null to clear the title.',
  })
  @ValidateIf((_, value: unknown) => value !== null)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(MEASUREMENT_TITLE_MAX_LENGTH)
  title!: string | null;
}
