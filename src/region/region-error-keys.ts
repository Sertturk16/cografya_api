/** The i18n error keys this module publishes; the sentence a reader sees is `cografya_web`'s. */
export const REGION_ERROR_KEYS = {
  /** `GET /regions/{slug}`, the slug matches no region in either language. */
  notFound: 'errors.region.notFound',
} as const;

export type RegionErrorKey = (typeof REGION_ERROR_KEYS)[keyof typeof REGION_ERROR_KEYS];
