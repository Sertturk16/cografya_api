import { GLOBAL_API_PREFIX } from '../common/bootstrap';

/**
 * The route segment `VideoCoverController` is mounted on (`@Controller(VIDEO_COVER_ROUTE_SEGMENT)`).
 *
 * A named constant rather than a literal repeated in two files: the controller and
 * {@link buildVideoCoverPath} must agree on this one word, and importing it is what makes
 * disagreement a compile-time impossibility for THIS half of the address. The full route —
 * including the global `/api` prefix, which the controller decorator does not itself carry
 * (`applyGlobalPrefix` adds it at bootstrap, ENGINEERING.md §2) — cannot be checked by the type
 * system alone, which is exactly why `test/video-cover.e2e-spec.ts` boots the real app and asserts
 * it answers on the address {@link buildVideoCoverPath} produces, rather than trusting agreement by
 * convention.
 */
export const VIDEO_COVER_ROUTE_SEGMENT = 'video-cover';

/**
 * The api's own published cover address for one video — plan §5.3, closing VAL137-NEW-C1.
 *
 * The SINGLE source both `BookService.toYoutubeDto` (which fills `BookVideoYoutubeDto.thumbnailUrl`
 * with this value) and `VideoCoverController`'s own route must agree with. Keyed on `bookVideoId`
 * (`book_videos.id`) — already the public per-video identifier the anonymous `BookVideoDto` and the
 * guarded `GET /api/video-identity/{bookVideoId}` route both use — never on the provider's own video
 * id, which this address carries nowhere, not even in a path segment.
 *
 * Returns the RELATIVE address, including the global `/api` prefix, so the value is directly
 * fetchable by a reader's browser (`<img src>`) exactly as the published DTO field promises. This
 * repo carries no configured public base URL for itself today
 * (`rg -n "API_BASE_URL|PUBLIC_URL" -i src/config/env.schema.ts` finds only provider-pointing
 * values, none describing this api), and this plan does not introduce one — the absolute-vs-relative
 * question is deferred to Atlas/Vera's own web-side coordination (plan §3/§13).
 */
export function buildVideoCoverPath(bookVideoId: string): string {
  return `/${GLOBAL_API_PREFIX}/${VIDEO_COVER_ROUTE_SEGMENT}/${bookVideoId}`;
}
