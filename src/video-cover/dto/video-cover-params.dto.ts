import { IsUUID } from 'class-validator';

/**
 * `{bookVideoId}` — a public route parameter, `book_videos.id` (plan §5.2).
 *
 * Deliberately module-local rather than a reuse of `VideoIdentityParams`, mirroring THAT class's
 * own docblock reasoning verbatim: each surface owns its own copy rather than reaching across
 * module boundaries for a same-shaped class, even though the validation is identical.
 */
export class VideoCoverParams {
  @IsUUID('4')
  bookVideoId!: string;
}
