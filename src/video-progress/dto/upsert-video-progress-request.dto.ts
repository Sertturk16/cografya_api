import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';
import { VIDEO_PROGRESS_MAX_POSITION_SECONDS } from '../video-progress-duration';

/**
 * The upsert body — a full-state replace (idempotent PUT semantics), matching
 * `youtube-snapshot.store.ts`'s "every column takes the new value" upsert shape (plan §5.5). Both
 * fields are required.
 *
 * `lastPositionSeconds`'s `@Max()` is the SAME constant the service's unknown-duration fallback
 * reads (`resolveMaxAllowedPosition`) — one magic number, published in `openapi.json`, rather than
 * two copies nobody cross-checks (plan §5.4).
 *
 * `watched` is deliberately NOT coupled to `lastPositionSeconds` reaching the video's duration —
 * no cross-field rule requires `watched: true` to imply "position == duration". A caller may mark
 * watched without scrubbing to the exact end, or after the player closed before an auto-save
 * fired. This is a deliberate absence (plan §5.5), not a gap.
 */
export class UpsertVideoProgressRequestDto {
  @ApiProperty({
    type: Number,
    minimum: 0,
    maximum: VIDEO_PROGRESS_MAX_POSITION_SECONDS,
    example: 245,
    description: 'Last playback position, in seconds.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(VIDEO_PROGRESS_MAX_POSITION_SECONDS)
  lastPositionSeconds!: number;

  @ApiProperty({
    type: Boolean,
    description:
      'A user-declared "I watched this" signal. Not derived from lastPositionSeconds — a caller ' +
      'may mark watched without scrubbing to the exact end.',
  })
  @IsBoolean()
  watched!: boolean;
}
