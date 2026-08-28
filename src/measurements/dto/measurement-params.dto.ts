import { IsUUID } from 'class-validator';

/**
 * `{id}` — a private, authenticated UUID route parameter (plan §5.5).
 *
 * Deliberately module-local rather than `src/common/dto/route-params.dto.ts`, following
 * `VideoProgressParams`'s own precedent exactly: that shared file scopes itself to the two
 * route-parameter shapes every PUBLIC endpoint uses. This is a protected, authenticated
 * identifier with no SEO/crawl dimension — a different family entirely.
 */
export class MeasurementParams {
  @IsUUID('4')
  id!: string;
}
