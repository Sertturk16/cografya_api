import { ApiProperty } from '@nestjs/swagger';

/**
 * The guarded read's whole payload — one field, for a signed-in member only (plan §5.1/§5.3).
 *
 * **Not a field bolted onto `VideoProgressDto` or any existing shape.** The identity is not
 * progress data and has no `userId` scoping: every member sees the same `youtubeVideoId` for the
 * same video, so there is nothing here to scope by caller.
 *
 * `youtubeVideoId` used to be published anonymously as `BookVideoDto.youtubeVideoId`; P2 removed it
 * from that DTO outright (absent, not nulled) and this is where the field now lives, guarded. Its
 * operational guidance travels with it: the YouTube video id, 11 characters — the identifier the
 * embed is built from. Load the player only on a click or key press, never on hover, and place
 * nothing on top of it once it is in. Moving between etiketler happens INSIDE the loaded player
 * through the IFrame Player API, not by rebuilding the embed URL per etiket (owner ruling
 * DEC 2026-08-15d): six etiketler per video would otherwise cost six full player reloads.
 */
export class VideoIdentityDto {
  @ApiProperty({
    type: String,
    example: 'dQw4w9WgXcQ',
    description: 'The YouTube video id, 11 characters — the identifier the embed is built from.',
  })
  youtubeVideoId!: string;
}
