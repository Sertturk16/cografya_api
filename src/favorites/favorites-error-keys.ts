/**
 * The four i18n error keys this module publishes (`ENGINEERING.md` §6 — the api never writes
 * user-facing prose; the sentence a reader sees is `cografya_web`'s). `provinceNotFound` and
 * `countryNotFound` keep their exact existing key strings byte-identical (P1 PR-A plan §5.1.2) so
 * the web's already-authored `messages/{tr,en}.json` entries survive unchanged; `regionNotFound`
 * and `continentNotFound` are additive.
 */
export const FAVORITES_ERROR_KEYS = {
  /** `PUT /favorites/province/{entityId}`, `entityId` is well-formed but names no `Province` row. */
  provinceNotFound: 'errors.favorites.provinceNotFound',
  /** `PUT /favorites/country/{entityId}`, `entityId` is well-formed but names no `Country` row. */
  countryNotFound: 'errors.favorites.countryNotFound',
  /** `PUT /favorites/region/{entityId}`, `entityId` is well-formed but names no `Region` row. */
  regionNotFound: 'errors.favorites.regionNotFound',
  /** `PUT /favorites/continent/{entityId}`, `entityId` is well-formed but names no live `Continent` label. */
  continentNotFound: 'errors.favorites.continentNotFound',
} as const;

export type FavoritesErrorKey = (typeof FAVORITES_ERROR_KEYS)[keyof typeof FAVORITES_ERROR_KEYS];
