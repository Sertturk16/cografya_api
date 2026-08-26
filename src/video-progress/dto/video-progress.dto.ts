import { ApiProperty } from '@nestjs/swagger';

/**
 * The persisted-row echo, returned on both `GET` and `PUT` (plan §5.5).
 *
 * **Deliberately omits `id` and `userId`.** The client already knows `bookVideoId` (it asked for
 * it) and its own identity, so echoing the row's own PK or the FK back adds no value while being
 * one more identifier surface — matching `SessionDto`'s own minimum-PII-surface precedent
 * (`id, firstName, accountRole ONLY`).
 */
export class VideoProgressDto {
  @ApiProperty({ format: 'uuid', description: 'book_videos.id.' })
  bookVideoId!: string;

  @ApiProperty({
    type: Number,
    example: 245,
    description: 'Last playback position, in seconds.',
  })
  lastPositionSeconds!: number;

  @ApiProperty({ type: Boolean, description: 'The user-declared "I watched this" signal.' })
  watched!: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'When the caller most recently confirmed watched:true, UTC — "last confirmed instant", ' +
      'not "first ever watched instant". null whenever watched is false.',
  })
  watchedAt!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'When this row was last written.',
  })
  updatedAt!: string;
}
