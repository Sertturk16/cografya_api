import { IsUUID } from 'class-validator';

/**
 * `{bookVideoId}` — a private, authenticated UUID route parameter (plan §5.3).
 *
 * Deliberately module-local rather than a reuse of `VideoProgressParams`, mirroring THAT class's
 * own docblock reasoning verbatim: a protected, authenticated identifier with no SEO/crawl
 * dimension is a different family from the shared public-route-param file, and each protected
 * surface owns its own copy rather than reaching across module boundaries for a same-shaped class.
 */
export class VideoIdentityParams {
  @IsUUID('4')
  bookVideoId!: string;
}
