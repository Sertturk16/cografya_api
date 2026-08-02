import { MarineLayerId } from '../marine.types';
import type { CmemsProductResolution } from './cmems-stac';

/**
 * The `/layers` CMEMS fill (plan §6, deltas d1–d3): the three provider-catalogue fields of the
 * CMEMS-PRIMARY layers, derived from the stored STAC resolutions. Pure — the service reads the
 * resolution cache and hands the results here.
 *
 * ## Which products serve which layer
 * The layer is basin-agnostic while the products are per-basin, so one layer aggregates over
 * every product that serves it anywhere on the Turkish coast (the routing table's four product
 * families; the Marmara sub-model shares the Black Sea physics document).
 */
export const CMEMS_LAYER_PRODUCTS: Readonly<Partial<Record<MarineLayerId, readonly string[]>>> = {
  [MarineLayerId.SeaSurfaceTemperature]: [
    'MEDSEA_ANALYSISFORECAST_PHY_006_013',
    'BLKSEA_ANALYSISFORECAST_PHY_007_001',
  ],
  [MarineLayerId.WaveHeight]: [
    'MEDSEA_ANALYSISFORECAST_WAV_006_017',
    'BLKSEA_ANALYSISFORECAST_WAV_007_003',
  ],
  [MarineLayerId.WaveDirection]: [
    'MEDSEA_ANALYSISFORECAST_WAV_006_017',
    'BLKSEA_ANALYSISFORECAST_WAV_007_003',
  ],
};

export interface CmemsCatalogueFields {
  readonly horizonEndUtc: string | null;
  readonly updateFrequency: string | null;
  readonly catalogueUpdatedAtUtc: string | null;
}

const EMPTY: CmemsCatalogueFields = {
  horizonEndUtc: null,
  updateFrequency: null,
  catalogueUpdatedAtUtc: null,
};

/**
 * Aggregate one layer's catalogue fields over its serving products' resolutions.
 *
 * ## ALL serving products, or honest null — per field
 * (d1) `horizonEndUtc` is the MINIMUM of the serving products' temporal-extent ends: the layer
 * is one field for every basin, so the only horizon the whole layer can honour is the earliest
 * one — a maximum would promise Mediterranean data on a Black Sea horizon. A missing resolution
 * (cold cache) or an open-ended extent yields `null` rather than a minimum over half the coast:
 * the partial minimum could OVERSTATE the horizon exactly when the unresolved product is the
 * shorter one.
 * (d2) `updateFrequency` is provider-verbatim; distinct per-product strings are joined with
 * `' | '` (the same separator the per-product compaction already uses).
 * (d3) `catalogueUpdatedAtUtc` is the NEWEST `admp_updated` across the serving products — "when
 * did the provider last touch any catalogue this layer serves".
 * The all-or-null rule applies to each field over the values it needs, so one product omitting
 * `admp_updated` nulls d3 without nulling d1.
 */
export function resolveCmemsCatalogueFields(
  resolutions: readonly (CmemsProductResolution | null)[],
): CmemsCatalogueFields {
  if (resolutions.length === 0 || resolutions.some((resolution) => resolution === null)) {
    return EMPTY;
  }
  const present = resolutions.filter(
    (resolution): resolution is CmemsProductResolution => resolution !== null,
  );

  return {
    horizonEndUtc: extremeIso(
      present.map((resolution) => resolution.temporalExtent.endUtc),
      'min',
    ),
    updateFrequency: joinedFrequencies(present.map((resolution) => resolution.updateFrequency)),
    catalogueUpdatedAtUtc: extremeIso(
      present.map((resolution) => resolution.admpUpdatedUtc),
      'max',
    ),
  };
}

/** Min/max over ISO stamps; `null` when ANY value is absent or unparseable (all-or-null). */
function extremeIso(stamps: readonly (string | null)[], mode: 'min' | 'max'): string | null {
  let winner: string | null = null;
  for (const stamp of stamps) {
    if (stamp === null || !Number.isFinite(Date.parse(stamp))) return null;
    if (
      winner === null ||
      (mode === 'min'
        ? Date.parse(stamp) < Date.parse(winner)
        : Date.parse(stamp) > Date.parse(winner))
    ) {
      winner = stamp;
    }
  }
  return winner;
}

/** Distinct provider-verbatim strings joined with the compaction's own separator (d2). */
function joinedFrequencies(frequencies: readonly (string | null)[]): string | null {
  const distinct: string[] = [];
  for (const frequency of frequencies) {
    if (frequency === null) return null;
    if (!distinct.includes(frequency)) distinct.push(frequency);
  }
  return distinct.length === 0 ? null : distinct.join(' | ');
}
