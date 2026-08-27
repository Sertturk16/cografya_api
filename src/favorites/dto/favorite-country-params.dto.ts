import { Matches } from 'class-validator';

/**
 * `{isoCode}` — a country's ISO 3166-1 alpha-2 code, exactly two uppercase letters, mirroring
 * `Country.isoCode`'s own seed-discipline docblock ("always UPPERCASE, exactly 2 letters").
 *
 * Deliberately module-local rather than added to `src/common/dto/route-params.dto.ts`: that
 * file's own docblock scopes itself to "the two route-parameter shapes every PUBLIC endpoint
 * here uses" (localized slug, plate code) and reasons entirely from an SEO/crawler angle (a
 * pattern too tight turns a real page into a wrong 400). None of that reasoning applies to a
 * protected, `no-store`, non-indexed favorites route, and adding a third export would leave that
 * docblock's own "the two" sentence false. Mirrors `VideoProgressParams`'s own precedent for the
 * identical reason — "a private, authenticated … identifier with no SEO/crawl dimension, a
 * different family."
 */
export class FavoriteCountryParams {
  @Matches(/^[A-Z]{2}$/, { message: 'isoCode must be exactly two uppercase letters' })
  isoCode!: string;
}
