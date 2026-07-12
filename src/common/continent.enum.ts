/**
 * The continents used to group countries on the dünya haritası (world map) — the
 * country-scale analog of `GeographicRegion` for provinces. Stored as a Postgres
 * enum on the `countries` table (`continent`) and surfaced in the public contract.
 *
 * The enum *values* are ASCII, upper-snake keys (safe as DB enum labels and in the
 * generated web types); the Turkish display names live in the label map below — a
 * presentation concern kept out of the stored value so the enum stays stable, exactly
 * as `GeographicRegion` handles its Turkish labels.
 *
 * ANTARKTİKA IS DELIBERATELY ABSENT: no sovereign country sits on it, so — mirroring
 * the province enum's discipline of listing only groupings that actually occur (all
 * seven regions have provinces) — it is left out rather than shipped as a value with
 * zero rows forever. Add it only if a real content need (e.g. research-station pages)
 * ever appears; that is a schema change surfaced to Atlas, not a pre-built value.
 */
export enum Continent {
  Asia = 'ASYA',
  Europe = 'AVRUPA',
  Africa = 'AFRIKA',
  NorthAmerica = 'KUZEY_AMERIKA',
  SouthAmerica = 'GUNEY_AMERIKA',
  Oceania = 'OKYANUSYA',
}

/**
 * Turkish display labels for each continent. Used by `db:seed:world` and any
 * server-side rendering of the continent name; the web repo may also map these keys
 * itself. Kept here as the single source so the fixed labels never drift.
 */
export const CONTINENT_LABELS_TR: Record<Continent, string> = {
  [Continent.Asia]: 'Asya',
  [Continent.Europe]: 'Avrupa',
  [Continent.Africa]: 'Afrika',
  [Continent.NorthAmerica]: 'Kuzey Amerika',
  [Continent.SouthAmerica]: 'Güney Amerika',
  [Continent.Oceania]: 'Okyanusya',
};

/** The Postgres enum type name, shared by the entity and its migration. */
export const CONTINENT_DB_ENUM = 'continent';
