import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MeasurementType } from '../entities/measurement.entity';
import { MeasurementPointDto } from './measurement-point.dto';

/**
 * Generous-but-real ceiling on the geometry array — matches `cografya_web`'s own real, shipped
 * `MAX_POINTS` (`components/tools/tool-island.tsx`), not an invented number (plan §5.8/§5.12).
 * Declared ONCE and reused by the e2e, the `GAME_ROUND_COUNTER_MAX`-style "declare once, reuse in
 * both" convention.
 */
export const MEASUREMENT_POINTS_MAX = 20;

/**
 * Grounded against `book.entity.ts`'s `title_tr`/`title_en`, the repo's one existing "title"
 * column precedent (plan §5.2/§5.8).
 */
export const MEASUREMENT_TITLE_MAX_LENGTH = 200;

/**
 * `POST /api/measurements` request body — a saved measurement the caller creates for itself
 * (plan §5.8).
 *
 * Cross-field shape (the type-dependent minimum point count) is deliberately NOT expressed as a
 * decorator here — see `measurement-shape.validator.ts`'s own docblock for why that lives in the
 * service instead.
 */
export class CreateMeasurementRequestDto {
  @ApiProperty({
    enum: MeasurementType,
    example: MeasurementType.Distance,
    description: 'Which kind of measurement this geometry represents.',
  })
  @IsEnum(MeasurementType)
  type!: MeasurementType;

  @ApiProperty({
    type: [MeasurementPointDto],
    minItems: 1,
    maxItems: MEASUREMENT_POINTS_MAX,
    description:
      'The geometry, in order. The type-dependent minimum (1 for coordinate, 2 for distance, ' +
      '3 for area) is enforced server-side, not by this array bound alone.',
  })
  @ValidateNested({ each: true })
  @Type(() => MeasurementPointDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(MEASUREMENT_POINTS_MAX)
  // VAL150-I1 (originally CODE150-C1): class-transformer preserves a nested array element's own
  // arrayness instead of coercing it to `MeasurementPointDto`, and class-validator's `each: true`
  // then happily validates that nested array's own elements — so `points: [[]]` or
  // `points: [[{lon,lat}]]` slipped past `@ValidateNested`/`@ArrayMaxSize` and both
  // `measurement-shape.validator.ts` (outer-length-only) and `CHK_measurements_points_array`
  // (outer-non-empty-array-only). `isObject` returns `false` for an array, so this rejects any
  // nested-array element while a flat array of real point objects still passes unchanged.
  @IsObject({ each: true })
  points!: MeasurementPointDto[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MEASUREMENT_TITLE_MAX_LENGTH,
    example: 'İstanbul - Ankara mesafesi',
    description: 'Optional label. Omit for no title, or send null.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(MEASUREMENT_TITLE_MAX_LENGTH)
  title?: string | null;

  @ApiProperty({
    type: String,
    example: '018f2f3a-9c3e-7b2a-8b9d-2e6f1a7c9d40',
    minLength: 1,
    maxLength: 128,
    pattern: '^[A-Za-z0-9_-]+$',
    description:
      'Opaque, client-generated per-measurement id. Together with the caller, this is the ' +
      'idempotency key: resubmitting the same value returns the row as it was first recorded.',
  })
  @IsString()
  @Length(1, 128)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'clientMeasurementId must contain only letters, digits, underscores or hyphens',
  })
  clientMeasurementId!: string;
}
