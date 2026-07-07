/**
 * The seven official geographic regions of Türkiye (MEB coğrafya müfredatı /
 * TÜİK bölge sınıflandırması). Stored as a Postgres enum on the `provinces`
 * table (`geographic_region`) and surfaced in the public contract.
 *
 * The enum *values* are ASCII, upper-snake keys (safe as DB enum labels and in
 * generated web types). The Turkish display names live in the label map below —
 * a presentation concern kept out of the stored value so the enum stays stable.
 */
export enum GeographicRegion {
  Marmara = 'MARMARA',
  Ege = 'EGE',
  Akdeniz = 'AKDENIZ',
  IcAnadolu = 'IC_ANADOLU',
  Karadeniz = 'KARADENIZ',
  DoguAnadolu = 'DOGU_ANADOLU',
  GuneydoguAnadolu = 'GUNEYDOGU_ANADOLU',
}

/**
 * Turkish display labels for each region. Used by `db:seed:geography` and any
 * server-side rendering of the region name; the web repo may also map these
 * keys itself. Kept here as the single source so the seven fixed labels never
 * drift.
 */
export const GEOGRAPHIC_REGION_LABELS_TR: Record<GeographicRegion, string> = {
  [GeographicRegion.Marmara]: 'Marmara',
  [GeographicRegion.Ege]: 'Ege',
  [GeographicRegion.Akdeniz]: 'Akdeniz',
  [GeographicRegion.IcAnadolu]: 'İç Anadolu',
  [GeographicRegion.Karadeniz]: 'Karadeniz',
  [GeographicRegion.DoguAnadolu]: 'Doğu Anadolu',
  [GeographicRegion.GuneydoguAnadolu]: 'Güneydoğu Anadolu',
};

/** The Postgres enum type name, shared by the entity and its migration. */
export const GEOGRAPHIC_REGION_DB_ENUM = 'geographic_region';
