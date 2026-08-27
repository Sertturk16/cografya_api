import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The persisted-row echo, returned both by `GET /api/game-rounds` (one per item) and by `POST
 * /api/game-rounds` (plan §5.5).
 *
 * **Deliberately omits `id` and `userId`**, matching `VideoProgressDto`'s/`FavoriteDto`'s own
 * minimum-surface precedent — the caller already knows its own identity, and `clientRoundId`
 * (which the caller itself generated) already serves as the natural per-item key for a list.
 */
export class GameRoundDto {
  @ApiProperty({ type: String, example: 'provinces' })
  mode!: string;

  @ApiProperty({ type: String, example: '018f2f3a-9c3e-7b2a-8b9d-2e6f1a7c9d40' })
  clientRoundId!: string;

  @ApiProperty({ type: Number, example: 87 })
  score!: number;

  @ApiProperty({ type: Number, example: 70 })
  found!: number;

  @ApiProperty({ type: Number, example: 60 })
  firstTry!: number;

  @ApiProperty({ type: Number, example: 81 })
  total!: number;

  @ApiProperty({ type: Number, example: 81 })
  poolTotal!: number;

  @ApiProperty({ type: Number, example: 12 })
  totalWrongs!: number;

  @ApiProperty({ type: Boolean, example: false })
  endedEarly!: boolean;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: null,
    description: 'Elapsed seconds, or null when the submission carried none.',
  })
  completionTimeSeconds!: number | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When this round was recorded, UTC.',
  })
  createdAt!: string;
}
