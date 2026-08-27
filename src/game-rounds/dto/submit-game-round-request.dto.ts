import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

/**
 * Generous, defensive sanity bounds against a malformed or hostile payload — declared ONCE and
 * reused in both the decorator and the e2e, matching `BOOK_LIST_*`'s own "declare once, reuse in
 * both" reasoning (plan §5.5). Not chosen because gameplay could plausibly reach them (the
 * current 81-question mode takes roughly twenty minutes per `round.ts`'s own comment) — these
 * are ceilings, not expectations.
 */
export const GAME_ROUND_COUNTER_MAX = 1000;
export const GAME_ROUND_TOTAL_WRONGS_MAX = 100_000;
export const GAME_ROUND_COMPLETION_TIME_SECONDS_MAX = 21_600; // 6h

/**
 * `POST /api/game-rounds` request body — a completed (or player-ended-early) round result the
 * caller submits for itself (plan §5.5).
 *
 * `clientRoundId`'s charset (`[A-Za-z0-9_-]`) admits any reasonable client-side id scheme (a
 * UUID, a ULID, a nanoid) without committing this package to one — UYELIK-10 has not been built
 * yet and is free to choose. `mode`'s charset (`[a-z][a-z0-9-]`) matches the two live
 * `GameModeId` values' own casing convention; the API never validates it against a closed set
 * (see the entity's own docblock).
 *
 * `completionTimeSeconds` is the ONLY optional field — see the entity docblock's own note on the
 * client's current no-clock design (plan §5.5/§15).
 */
export class SubmitGameRoundRequestDto {
  @ApiProperty({
    type: String,
    example: 'provinces',
    minLength: 1,
    maxLength: 40,
    pattern: '^[a-z][a-z0-9-]{0,39}$',
    description:
      'Opaque game-mode tag, echoed back unchanged. Never validated against a closed set.',
  })
  @IsString()
  @Length(1, 40)
  @Matches(/^[a-z][a-z0-9-]{0,39}$/, {
    message:
      'mode must start with a lowercase letter and contain only lowercase letters, digits or hyphens',
  })
  mode!: string;

  @ApiProperty({
    type: String,
    example: '018f2f3a-9c3e-7b2a-8b9d-2e6f1a7c9d40',
    minLength: 1,
    maxLength: 128,
    pattern: '^[A-Za-z0-9_-]+$',
    description:
      'Opaque, client-generated per-round id. Together with the caller, this is the ' +
      'idempotency key: resubmitting the same value returns the row as it was first recorded.',
  })
  @IsString()
  @Length(1, 128)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'clientRoundId must contain only letters, digits, underscores or hyphens',
  })
  clientRoundId!: string;

  @ApiProperty({ type: Number, minimum: 0, maximum: 100, example: 87 })
  @IsInt()
  @Min(0)
  @Max(100)
  score!: number;

  @ApiProperty({ type: Number, minimum: 0, maximum: GAME_ROUND_COUNTER_MAX, example: 70 })
  @IsInt()
  @Min(0)
  @Max(GAME_ROUND_COUNTER_MAX)
  found!: number;

  @ApiProperty({ type: Number, minimum: 0, maximum: GAME_ROUND_COUNTER_MAX, example: 60 })
  @IsInt()
  @Min(0)
  @Max(GAME_ROUND_COUNTER_MAX)
  firstTry!: number;

  @ApiProperty({ type: Number, minimum: 0, maximum: GAME_ROUND_COUNTER_MAX, example: 81 })
  @IsInt()
  @Min(0)
  @Max(GAME_ROUND_COUNTER_MAX)
  total!: number;

  @ApiProperty({ type: Number, minimum: 0, maximum: GAME_ROUND_COUNTER_MAX, example: 81 })
  @IsInt()
  @Min(0)
  @Max(GAME_ROUND_COUNTER_MAX)
  poolTotal!: number;

  @ApiProperty({ type: Number, minimum: 0, maximum: GAME_ROUND_TOTAL_WRONGS_MAX, example: 12 })
  @IsInt()
  @Min(0)
  @Max(GAME_ROUND_TOTAL_WRONGS_MAX)
  totalWrongs!: number;

  @ApiProperty({ type: Boolean, example: false })
  @IsBoolean()
  endedEarly!: boolean;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    maximum: GAME_ROUND_COMPLETION_TIME_SECONDS_MAX,
    example: null,
    description:
      'Elapsed seconds, if the caller has one to send. The current client engine tracks no ' +
      'clock (`DEC 2026-07-30m/30n`) and omits this field entirely — omitted or explicit ' +
      'null are both accepted and stored as null.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(GAME_ROUND_COMPLETION_TIME_SECONDS_MAX)
  completionTimeSeconds?: number | null;
}
