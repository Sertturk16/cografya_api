import { IsUUID } from 'class-validator';

/**
 * `{bookVideoId}` — a private, authenticated UUID route parameter (plan §5.5).
 *
 * Deliberately module-local rather than `src/common/dto/route-params.dto.ts`: that file's own
 * docblock scopes itself to "the two route-parameter shapes every PUBLIC endpoint here uses"
 * (localized slug, plate code). This is a protected, authenticated identifier with no SEO/crawl
 * dimension — a different family, not a candidate for that shared file.
 */
export class VideoProgressParams {
  @IsUUID('4')
  bookVideoId!: string;
}
