import { GeographicRegion } from './geographic-region.enum';

/**
 * Canonical URL slugs for the seven geographic regions of Türkiye.
 * Matches `cografya_web/lib/game/region-slug.ts` and `sayfa-yapim-plani.md`.
 */
export const GEOGRAPHIC_REGION_SLUGS: Record<GeographicRegion, string> = {
  [GeographicRegion.Marmara]: 'marmara',
  [GeographicRegion.Ege]: 'ege',
  [GeographicRegion.Akdeniz]: 'akdeniz',
  [GeographicRegion.IcAnadolu]: 'ic-anadolu',
  [GeographicRegion.Karadeniz]: 'karadeniz',
  [GeographicRegion.DoguAnadolu]: 'dogu-anadolu',
  [GeographicRegion.GuneydoguAnadolu]: 'guneydogu-anadolu',
};

/** Reverse lookup: URL slug -> GeographicRegion enum. */
export const SLUG_TO_GEOGRAPHIC_REGION: Record<string, GeographicRegion> = {
  marmara: GeographicRegion.Marmara,
  ege: GeographicRegion.Ege,
  akdeniz: GeographicRegion.Akdeniz,
  'ic-anadolu': GeographicRegion.IcAnadolu,
  karadeniz: GeographicRegion.Karadeniz,
  'dogu-anadolu': GeographicRegion.DoguAnadolu,
  'guneydogu-anadolu': GeographicRegion.GuneydoguAnadolu,
};

/** Canonical ordered list of the 7 regions (standard reporting sequence). */
export const GEOGRAPHIC_REGIONS_ORDERED: readonly GeographicRegion[] = [
  GeographicRegion.Marmara,
  GeographicRegion.Ege,
  GeographicRegion.Akdeniz,
  GeographicRegion.IcAnadolu,
  GeographicRegion.Karadeniz,
  GeographicRegion.DoguAnadolu,
  GeographicRegion.GuneydoguAnadolu,
];

/** Return the URL slug for a given geographic region enum. */
export function geographicRegionSlug(region: GeographicRegion): string {
  return GEOGRAPHIC_REGION_SLUGS[region];
}

/** Return the geographic region enum for a URL slug, or null if unknown. */
export function geographicRegionFromSlug(slug: string): GeographicRegion | null {
  return SLUG_TO_GEOGRAPHIC_REGION[slug] ?? null;
}
