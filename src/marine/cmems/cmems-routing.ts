import { SeaBasin } from '../marine.types';

/**
 * Basin → CMEMS product routing, and the per-basin acceptance thresholds (plan §3.1).
 *
 * ## What is pinned here and what is NOT
 * **Product ids are pinned; dataset ids are NEVER pinned** (ADDENDUM §6.6 / AÇIK-4). The four
 * product ids are stable catalogue families; the dataset UNDER a product carries a rotating
 * version stamp (`_202311` → `_202511` was observed live during M4 planning) and is resolved
 * from the provider's STAC catalogue at runtime (`cmems-stac.ts`). A retired pinned dataset id
 * answers every call with HTTP 400 + XML — the exact outage class M1 recorded as its most
 * likely failure.
 *
 * ## The basin is the POINT's basin, never the province's
 * İstanbul has one `black_sea` row and one `marmara` row; deriving the basin from the province
 * would send the Marmara point at the Black Sea model. The Marmara temperature comes from a
 * 500 m sub-model that lives INSIDE the Black Sea physics product and is invisible on that
 * product's advertised bounding box (SPEC v1 §3.3).
 *
 * ## Marmara wave is `null`, permanently
 * The Black Sea wave product's land mask excludes the Marmara and no Marmara wave dataset
 * exists in any CMEMS product (M1 cross-check + the M4a probe's negative STAC evidence). The
 * runtime reads `null` as `not_supported` and makes NO call — the wave pair then resolves from
 * ECMWF (`cmems-merge.ts` pair-consistency rule).
 */

/** How a dataset is selected from a product's STAC item list — the resolver's input. */
export interface CmemsDatasetSelector {
  /** The stable product family, e.g. `BLKSEA_ANALYSISFORECAST_PHY_007_001`. */
  readonly productId: string;
  /**
   * Variable tokens accepted in the dataset id. Temperature accepts BOTH `phy-tem` and
   * `phy-temp` — a measured provider inconsistency, not a typo: the Marmara sub-model says
   * `tem` while the 2.5 km Black Sea set says `temp`, for the same physical quantity.
   */
  readonly acceptedVariableTokens: readonly string[];
  /**
   * The grid token, matched EXACTLY. `2.5km` must not match `detided-2.5km`, and the MEDSEA
   * hourly surface temperature is `4.2km-2D` — its `4.2km-3D` sibling is the full water
   * column, which is not a sea-surface product.
   */
  readonly gridToken: string;
}

const TEMPERATURE_TOKENS: readonly string[] = ['phy-tem', 'phy-temp'];
const WAVE_TOKENS: readonly string[] = ['wav'];

export interface BasinCmemsRoute {
  readonly seaSurfaceTemperature: CmemsDatasetSelector;
  /** `null` where CMEMS carries no wave field at all — Marmara only, and permanently. */
  readonly wave: CmemsDatasetSelector | null;
  /**
   * Maximum accepted distance between the requested coordinate and the grid centre the
   * provider snapped to, km — SPEC-ADDENDUM §4.5(b), verbatim (half the cell diagonal × 1.2).
   *
   * What a breach actually means is that OUR tile/pixel arithmetic picked the wrong cell, NOT
   * that the provider is far away: `GetFeatureInfo` returns the cell the pixel lands in and
   * never searches for a nearer wet cell, so the distance is structurally bounded by half a
   * cell diagonal. The runtime maps a breach to `schema_error`; the probe fails its run.
   */
  readonly maxGridDistanceKm: number;
}

const MED_ROUTE: BasinCmemsRoute = {
  seaSurfaceTemperature: {
    productId: 'MEDSEA_ANALYSISFORECAST_PHY_006_013',
    acceptedVariableTokens: TEMPERATURE_TOKENS,
    gridToken: '4.2km-2D',
  },
  wave: {
    productId: 'MEDSEA_ANALYSISFORECAST_WAV_006_017',
    acceptedVariableTokens: WAVE_TOKENS,
    gridToken: '4.2km',
  },
  maxGridDistanceKm: 3.4,
};

/**
 * CMEMS serves the Aegean and the Mediterranean from the SAME product pair, so both basins
 * route identically — the basin distinction is editorial there, not technical (M1 record).
 */
export const CMEMS_BASIN_ROUTING: Readonly<Record<SeaBasin, BasinCmemsRoute>> = {
  [SeaBasin.Aegean]: MED_ROUTE,
  [SeaBasin.Mediterranean]: MED_ROUTE,
  [SeaBasin.BlackSea]: {
    seaSurfaceTemperature: {
      productId: 'BLKSEA_ANALYSISFORECAST_PHY_007_001',
      acceptedVariableTokens: TEMPERATURE_TOKENS,
      gridToken: '2.5km',
    },
    wave: {
      productId: 'BLKSEA_ANALYSISFORECAST_WAV_007_003',
      acceptedVariableTokens: WAVE_TOKENS,
      gridToken: '2.5km',
    },
    maxGridDistanceKm: 2.1,
  },
  [SeaBasin.Marmara]: {
    seaSurfaceTemperature: {
      productId: 'BLKSEA_ANALYSISFORECAST_PHY_007_001',
      acceptedVariableTokens: TEMPERATURE_TOKENS,
      gridToken: 'mrm-500m',
    },
    wave: null,
    maxGridDistanceKm: 0.5,
  },
};

/**
 * The CMEMS support verdict for one basin's wave pair — the "make NO call" rule's input.
 *
 * Consumers: the probe-artifact gate (`a2-wave-support`, `marine-cmems-assertions.ts`) reads
 * it now; the M4b `resolveWavePair` caller is the runtime consumer. The probe itself keeps
 * the inline `route.wave !== null` form because that null check is also the type narrowing
 * that lets it read `route.wave` — the two spellings are pinned equal by construction here.
 */
export function cmemsWaveSupport(basin: SeaBasin): 'supported' | 'not_supported' {
  return CMEMS_BASIN_ROUTING[basin].wave === null ? 'not_supported' : 'supported';
}

/**
 * The canonical selector-key format, spelled ONCE (review #81 M2). The literal keys in the
 * probe's licence-row table must match this format; a drift there fails the `a4` row gates
 * loudly because the row's dataset lookup resolves nothing.
 */
export function cmemsSelectorKey(selector: CmemsDatasetSelector): string {
  return `${selector.productId}/${selector.gridToken}`;
}

/**
 * Every distinct (product, selector) pair the platform needs, keyed for resolution storage.
 *
 * FIVE selectors over FOUR product documents: the Black Sea physics product serves both the
 * 2.5 km Black Sea grid and the 500 m Marmara sub-model from one STAC document, so a warmup
 * resolution pass fetches ≤ 4 documents, never 5 (plan §4.3's "≤4 STAC calls").
 */
export interface CmemsSelectorEntry {
  /** Stable storage/logging key, e.g. `blksea-phy/mrm-500m`. */
  readonly key: string;
  readonly selector: CmemsDatasetSelector;
}

export const CMEMS_SELECTOR_ENTRIES: readonly CmemsSelectorEntry[] = (() => {
  const entries = new Map<string, CmemsSelectorEntry>();
  for (const route of Object.values(CMEMS_BASIN_ROUTING)) {
    for (const selector of [route.seaSurfaceTemperature, route.wave]) {
      if (selector === null) continue;
      const key = cmemsSelectorKey(selector);
      if (!entries.has(key)) entries.set(key, { key, selector });
    }
  }
  return [...entries.values()];
})();
