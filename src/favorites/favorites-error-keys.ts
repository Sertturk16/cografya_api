/**
 * The two i18n error keys this module publishes (`ENGINEERING.md` §6 — the api never writes
 * user-facing prose; the sentence a reader sees is `cografya_web`'s).
 */
export const FAVORITES_ERROR_KEYS = {
  /** `PUT .../provinces/{plateCode}`, `plateCode` is well-formed but names no `Province` row. */
  provinceNotFound: 'errors.favorites.provinceNotFound',
  /** `PUT .../countries/{isoCode}`, `isoCode` is well-formed but names no `Country` row. */
  countryNotFound: 'errors.favorites.countryNotFound',
} as const;

export type FavoritesErrorKey = (typeof FAVORITES_ERROR_KEYS)[keyof typeof FAVORITES_ERROR_KEYS];
