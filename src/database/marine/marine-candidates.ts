import { SeaBasin } from '../../marine/marine.types';
import { SEED_PROVINCES } from '../seeds/province.seed-data';
import type { BoundingBox } from './geo';

/**
 * The hand-chosen candidate reference points, the per-basin CMEMS dataset routing, and the
 * per-product acceptance thresholds.
 *
 * This file is the INPUT to `--phase=probe`. It is not the data that ships: what ships is the
 * probe ARTIFACT, and a candidate only becomes a row after every assertion in
 * `marine-assertions.ts` has passed against a live provider response.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW THE COORDINATES WERE CHOSEN (SPEC v1 §5.2, measured 2026-07-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * **No point sits inside a strait or a narrow gulf.** This is not aesthetics. At the same
 * instant in the Bosphorus the two providers reported 28.62 °C and 25.40 °C — 3.2 °C apart —
 * while offshore they agreed within ~1.5 °C. No regional model resolves a narrow, two-layer-
 * flow channel, so a number published from inside one would be a number we cannot defend. Each
 * point is therefore ~10–20 km off its province's coast, in water the model treats as open.
 *
 * Concrete consequences of that rule, each a deliberate exclusion:
 *   - **Kocaeli gets only a Black Sea point.** Its entire Marmara frontage is the İzmit Gulf, a
 *     ~50 × 2–10 km channel. There is no honest open-water Marmara point for Kocaeli.
 *   - **İstanbul's two points are on opposite sides of the Bosphorus, never in it** (Şile
 *     offshore and open Marmara south of the Princes' Islands, ~84 km apart).
 *   - **Çanakkale's two points are north-east and south-west of the Dardanelles, never in it.**
 *   - **İzmir's point is north of the Karaburun peninsula, not in the İzmir Gulf** — the gulf
 *     is exactly the "narrow" case, and a zoom-6 query there returned `null` while zoom 8
 *     returned 24.65 °C, which is how easily a gulf reads as "no data".
 *
 * **Muğla gets ONE point, basin `aegean`.** Its coast spans the conventional Aegean/
 * Mediterranean transition with no sharp boundary, and the repo already classifies Muğla as an
 * Aegean-region province. This costs nothing in data correctness: CMEMS serves the Aegean and
 * the Mediterranean from the SAME product pair, so `aegean` and `mediterranean` route to
 * identical datasets — the distinction is editorial, not technical.
 *
 * **Expected count: 30 points across 27 coastal provinces** (İstanbul, Çanakkale and Balıkesir
 * carry two each). The v1.1 addendum budgeted "~31"; the exact number is this probe's output.
 */

/**
 * A candidate before the probe has judged it.
 *
 * Every field that ends up as a `marine_points` COLUMN belongs here, including the two coast
 * labels. That is not tidiness: `assertArtifactMatchesCandidates` walks this shape to decide
 * whether the committed artifact still describes current code, so a loaded column that is NOT
 * on this interface is a column the staleness gate cannot see. `coastLabelTr`/`coastLabelEn`
 * were exactly that — derived straight from `COAST_LABELS` at probe time and thereafter read
 * only back out of the artifact, which meant a wording fix in `COAST_LABELS` shipped the OLD
 * text forever, with every gate and every test green (review #72, silent-failure I1).
 */
export interface MarinePointCandidate {
  slugTr: string;
  slugEn: string;
  nameTr: string;
  nameEn: string;
  /** Province-relative short label, derived from the basin — see {@link COAST_LABELS}. */
  coastLabelTr: string;
  coastLabelEn: string;
  plateCode: string;
  /** The province's TR name, carried into the artifact as the MAPPING audit trail (DEC 2026-07-19). */
  provinceNameTr: string;
  seaBasin: SeaBasin;
  latitude: number;
  longitude: number;
  displayOrder: number;
}

/**
 * Province-relative short labels, derived from the basin.
 *
 * Deliberately NOT per point: inside `/turkiye/{il}` the province name is already in the
 * heading, so the useful thing to say is which SEA this point is in — and that is exactly what
 * distinguishes the two rows of a two-sea province.
 */
export const COAST_LABELS: Readonly<Record<SeaBasin, { tr: string; en: string }>> = {
  [SeaBasin.BlackSea]: { tr: 'Karadeniz açıkları', en: 'Black Sea offshore' },
  [SeaBasin.Marmara]: { tr: 'Marmara açıkları', en: 'Marmara offshore' },
  [SeaBasin.Aegean]: { tr: 'Ege açıkları', en: 'Aegean offshore' },
  [SeaBasin.Mediterranean]: { tr: 'Akdeniz açıkları', en: 'Mediterranean offshore' },
};

/**
 * Coarse, HAND-DRAWN containment boxes, one per basin.
 *
 * Honest about what this check is worth: it is a cheap net that catches a coordinate typed into
 * the wrong hemisphere or the wrong sea, nothing subtler. The Black Sea and Marmara boxes
 * genuinely overlap in a thin band (40.90–41.10 N, 27.3–30.0 E) which is real Marmara water —
 * no candidate sits there, but a future one could and would pass both.
 *
 * The SHARP discriminators are the other two assertions: the dataset the provider echoes back
 * (c2) and, for the Marmara, the cross-check that the Black Sea WAVE product returns `null`
 * there (c3). Those are provider facts, not our opinion about where a sea ends.
 */
export const BASIN_BOUNDING_BOXES: Readonly<Record<SeaBasin, BoundingBox>> = {
  [SeaBasin.BlackSea]: {
    minLatitude: 40.9,
    maxLatitude: 43.5,
    minLongitude: 27.3,
    maxLongitude: 42.2,
  },
  [SeaBasin.Marmara]: {
    minLatitude: 40.3,
    maxLatitude: 41.1,
    minLongitude: 26.6,
    maxLongitude: 30.0,
  },
  [SeaBasin.Aegean]: {
    minLatitude: 36.5,
    maxLatitude: 40.3,
    minLongitude: 24.8,
    maxLongitude: 27.7,
  },
  [SeaBasin.Mediterranean]: {
    minLatitude: 35.7,
    maxLatitude: 36.95,
    minLongitude: 27.5,
    maxLongitude: 36.4,
  },
};

/** A fully-qualified CMEMS layer: `${productId}/${datasetId}/${variableId}`. */
export interface CmemsLayerRef {
  /** `PRODUCT/dataset` — exactly the string the provider echoes back as `datasetId`. */
  datasetId: string;
  variableId: string;
}

/**
 * Which CMEMS datasets serve a basin, and how tight the grid-centre threshold is there.
 *
 * Dataset ids were read from the provider's STAC catalogue on 2026-07-30 and each one was
 * confirmed to answer a live `GetFeatureInfo`. They are pinned here rather than guessed,
 * because the naming carries NO predictable pattern: the same physical quantity is
 * `phy-temp` in the Black Sea and `phy-tem` in the Marmara, the time-step token is `PT1H-m`
 * in one and `PT1H-i` in the other, and three different version stamps (`_202311`, `_202411`,
 * `_202511`) are in service simultaneously.
 *
 * A pinned id going stale is a known, recorded risk: the provider answers a retired dataset
 * with HTTP 400 + an XML error body. AÇIK-4 proposes resolving these from STAC at runtime
 * instead; that decision belongs to the M3/M4 review, and the probe pinning them is correct
 * regardless — an artifact must record the dataset it actually queried.
 */
export interface BasinCmemsRouting {
  seaSurfaceTemperature: CmemsLayerRef;
  /**
   * `null` where CMEMS carries no wave field at all. Marmara only — and permanently, not
   * transiently: the runtime reads this as `status: 'not_supported'` and makes NO call.
   */
  wave: { height: CmemsLayerRef; direction: CmemsLayerRef } | null;
  /**
   * Nominal grid spacing in degrees, for the record.
   */
  gridSpacingDeg: number;
  /**
   * Maximum accepted distance between the requested coordinate and the grid centre the
   * provider snapped to, km.
   *
   * These are the values locked in SPEC-ADDENDUM §4.5(b) — half the cell diagonal × 1.2 — and
   * they are used verbatim rather than recomputed here, because they are the reviewable
   * acceptance criterion.
   *
   * What the threshold actually catches is OUR tile/pixel arithmetic being wrong, NOT the
   * provider being far away: `GetFeatureInfo` returns the cell the pixel lands in and never
   * searches for a nearer wet cell, so the distance is structurally bounded by half a cell
   * diagonal. It can never report "the nearest model point is 40 km away".
   */
  maxGridDistanceKm: number;
}

const MED_TEMPERATURE: CmemsLayerRef = {
  datasetId:
    'MEDSEA_ANALYSISFORECAST_PHY_006_013/cmems_mod_med_phy-tem_anfc_4.2km-2D_PT1H-m_202511',
  variableId: 'thetao',
};
const MED_WAVE_DATASET =
  'MEDSEA_ANALYSISFORECAST_WAV_006_017/cmems_mod_med_wav_anfc_4.2km_PT1H-i_202311';

const MED_ROUTING: BasinCmemsRouting = {
  seaSurfaceTemperature: MED_TEMPERATURE,
  wave: {
    height: { datasetId: MED_WAVE_DATASET, variableId: 'VHM0' },
    direction: { datasetId: MED_WAVE_DATASET, variableId: 'VMDR' },
  },
  gridSpacingDeg: 0.042,
  maxGridDistanceKm: 3.4,
};

const BLACK_SEA_WAVE_DATASET =
  'BLKSEA_ANALYSISFORECAST_WAV_007_003/cmems_mod_blk_wav_anfc_2.5km_PT1H-i_202411';

/**
 * The Black Sea wave layer, reused as the Marmara CROSS-CHECK.
 *
 * The Black Sea wave product's bounding box CONTAINS the Marmara, but its land mask does not:
 * queried at a genuine Marmara point it returns `null`. A Marmara candidate that gets a NUMBER
 * back from this layer is therefore not in the Marmara at all — it has drifted into Black Sea
 * water. That is a provider-sourced falsification, which is worth far more than our own
 * hand-drawn bounding box.
 */
export const MARMARA_CROSS_CHECK_LAYER: CmemsLayerRef = {
  datasetId: BLACK_SEA_WAVE_DATASET,
  variableId: 'VHM0',
};

export const BASIN_CMEMS_ROUTING: Readonly<Record<SeaBasin, BasinCmemsRouting>> = {
  [SeaBasin.Aegean]: MED_ROUTING,
  [SeaBasin.Mediterranean]: MED_ROUTING,
  [SeaBasin.BlackSea]: {
    seaSurfaceTemperature: {
      datasetId:
        'BLKSEA_ANALYSISFORECAST_PHY_007_001/cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202511',
      variableId: 'thetao',
    },
    wave: {
      height: { datasetId: BLACK_SEA_WAVE_DATASET, variableId: 'VHM0' },
      direction: { datasetId: BLACK_SEA_WAVE_DATASET, variableId: 'VMDR' },
    },
    gridSpacingDeg: 0.025,
    maxGridDistanceKm: 2.1,
  },
  [SeaBasin.Marmara]: {
    // A 500 m sub-model that lives INSIDE the Black Sea physics product and is invisible on
    // that product's advertised bounding box — which is exactly why the basin, not the
    // province, must choose the dataset.
    seaSurfaceTemperature: {
      datasetId:
        'BLKSEA_ANALYSISFORECAST_PHY_007_001/cmems_mod_blk_phy-tem_anfc_mrm-500m_PT1H-i_202311',
      variableId: 'thetao',
    },
    wave: null,
    gridSpacingDeg: 0.005,
    maxGridDistanceKm: 0.5,
  },
};

/** Plausible sea-surface-temperature range for Turkish waters, °C (SPEC-ADDENDUM §4.5(a)). */
export const SST_MIN_C = 0;
export const SST_MAX_C = 35;

/**
 * Maximum accepted Open-Meteo snap distance, km.
 *
 * ── DEVIATION FROM SPEC-ADDENDUM §4.5(b), and why ────────────────────────────
 * The addendum set 7.5 km for Open-Meteo by the same formula it used for CMEMS: half a cell
 * diagonal × 1.2, on an assumed ~0.08° grid. That formula assumes the provider returns the cell
 * the request FALLS IN, which is what CMEMS does — its distance is structurally bounded by half
 * a cell diagonal.
 *
 * **Open-Meteo does not behave that way.** Measured 2026-07-30 across all 30 candidates: its
 * marine grid is exactly 1/12° (0.08333°) with centres on the (k + 0.5)/12 lattice, and the
 * returned cell is up to TWO grid steps away from the containing one (Kastamonu +2 lat,
 * Ordu +2 lat, Yalova −1 lat/−1 lon). It performs a NEAREST-WET-CELL SEARCH. Ten of the thirty
 * candidates therefore exceeded 7.5 km, up to 14.5 km — including points whose CMEMS snap was
 * 0.0 km with a perfectly good temperature, i.e. points that are unambiguously at sea.
 *
 * So the 7.5 km ceiling was measuring a quantity Open-Meteo does not produce. The check itself
 * stays valuable — it still catches a coordinate that is nowhere near water Open-Meteo models —
 * but its ceiling has to reflect a search radius rather than a cell offset:
 *
 *     half cell diagonal (~5.8 km at 41° N) + a two-cell wet-search allowance (~2 × 9.3 km)
 *
 * rounded down to **20 km**. Observed maximum in the 2026-07-30 run: 14.5 km. A point that
 * needs more than 20 km of reach is ~3 cells from any modelled water and is a genuine defect.
 *
 * Marked ASSUMPTION and reported to Atlas: this relaxes a locked acceptance number, on measured
 * evidence that the number modelled the wrong thing.
 */
export const OPEN_METEO_MAX_GRID_DISTANCE_KM = 20;

/**
 * Minimum separation between the two points of a two-sea province, km
 * (SPEC-ADDENDUM §4.5(c4)). Closer than this and both have almost certainly been placed in the
 * same sea.
 */
export const TWO_SEA_MIN_SEPARATION_KM = 30;
/** How each basin appears in a slug and in a display name, TR and EN. */
const BASIN_NAMING: Readonly<
  Record<SeaBasin, { slugTr: string; slugEn: string; nameTr: string; nameEn: string }>
> = {
  [SeaBasin.BlackSea]: {
    slugTr: 'karadeniz',
    slugEn: 'black-sea',
    nameTr: 'Karadeniz',
    nameEn: 'Black Sea',
  },
  [SeaBasin.Marmara]: {
    slugTr: 'marmara',
    slugEn: 'marmara',
    nameTr: 'Marmara',
    nameEn: 'Marmara',
  },
  [SeaBasin.Aegean]: { slugTr: 'ege', slugEn: 'aegean', nameTr: 'Ege', nameEn: 'Aegean' },
  [SeaBasin.Mediterranean]: {
    slugTr: 'akdeniz',
    slugEn: 'mediterranean',
    nameTr: 'Akdeniz',
    nameEn: 'Mediterranean',
  },
};

/**
 * One hand-maintained row: a coastal province, a sea, and a coordinate. Nothing else.
 *
 * Slugs, names and `displayOrder` are DERIVED (see `MARINE_POINT_CANDIDATES`) rather than typed
 * out per row. That removes 120 hand-written strings whose only job was to agree with each
 * other, and it makes one real correctness property structural instead of hopeful: a marine
 * slug always shares its province's committed slug, so the two can never drift.
 */
interface CandidateRow {
  /** Plaka kodu, zero-padded — the key into the province seed. */
  plate: string;
  basin: SeaBasin;
  latitude: number;
  longitude: number;
}

/**
 * The hand-maintained coordinate table, in hub display order: Black Sea west→east, then the
 * Marmara west→east, then the Aegean north→south, then the Mediterranean west→east — a traverse
 * of the coast rather than an alphabetical shuffle. `displayOrder` is the array index + 1, so
 * reordering a row is the only way to reorder the hub and the sequence can never develop a gap.
 */
const CANDIDATE_ROWS: readonly CandidateRow[] = [
  // ── Black Sea, west → east ──────────────────────────────────────────────────
  { plate: '39', basin: SeaBasin.BlackSea, latitude: 41.95, longitude: 28.15 }, // Kırklareli
  { plate: '34', basin: SeaBasin.BlackSea, latitude: 41.3, longitude: 29.61 }, // İstanbul, off Şile
  { plate: '41', basin: SeaBasin.BlackSea, latitude: 41.25, longitude: 30.2 }, // Kocaeli, off Kefken
  { plate: '54', basin: SeaBasin.BlackSea, latitude: 41.2, longitude: 30.68 }, // Sakarya
  { plate: '81', basin: SeaBasin.BlackSea, latitude: 41.18, longitude: 31.13 }, // Düzce
  { plate: '67', basin: SeaBasin.BlackSea, latitude: 41.55, longitude: 31.78 }, // Zonguldak
  { plate: '74', basin: SeaBasin.BlackSea, latitude: 41.85, longitude: 32.38 }, // Bartın
  { plate: '37', basin: SeaBasin.BlackSea, latitude: 42.08, longitude: 33.76 }, // Kastamonu
  { plate: '57', basin: SeaBasin.BlackSea, latitude: 42.15, longitude: 35.15 }, // Sinop
  { plate: '55', basin: SeaBasin.BlackSea, latitude: 41.4, longitude: 36.33 }, // Samsun
  { plate: '52', basin: SeaBasin.BlackSea, latitude: 41.08, longitude: 37.88 }, // Ordu
  { plate: '28', basin: SeaBasin.BlackSea, latitude: 40.99, longitude: 38.39 }, // Giresun
  { plate: '61', basin: SeaBasin.BlackSea, latitude: 41.1, longitude: 39.72 }, // Trabzon
  { plate: '53', basin: SeaBasin.BlackSea, latitude: 41.13, longitude: 40.52 }, // Rize
  { plate: '08', basin: SeaBasin.BlackSea, latitude: 41.52, longitude: 41.42 }, // Artvin, off Hopa

  // ── Marmara, west → east. All OUTSIDE the two straits and the İzmit Gulf ────
  { plate: '17', basin: SeaBasin.Marmara, latitude: 40.5, longitude: 27.35 }, // Çanakkale, off Karabiga
  { plate: '59', basin: SeaBasin.Marmara, latitude: 40.87, longitude: 27.5 }, // Tekirdağ
  { plate: '10', basin: SeaBasin.Marmara, latitude: 40.55, longitude: 27.9 }, // Balıkesir, N of Kapıdağ
  // ~14 km off Bakırköy/Yeşilköy on İstanbul's central-west Marmara shore. (An earlier comment
  // here said "south of the Princes' Islands" — wrong: the Adalar are ~29.12 E, some 27 km
  // further east. Corrected per the MAPPING leg's independent re-derivation; the coordinate
  // itself was and is correct.)
  { plate: '34', basin: SeaBasin.Marmara, latitude: 40.85, longitude: 28.8 }, // İstanbul
  { plate: '16', basin: SeaBasin.Marmara, latitude: 40.48, longitude: 28.85 }, // Bursa, off Mudanya
  // Yalova: 40.72 / 29.15, NOT the first candidate 40.58 / 29.10 — that one sat on the Armutlu
  // peninsula and the 500 m Marmara model answered `null` for it, which is exactly the land-cell
  // case the probe exists to catch. This one is ~7 km north of the shore and WEST of the İzmit
  // Gulf mouth (~29.4 E), so the narrow-gulf rule still holds.
  { plate: '77', basin: SeaBasin.Marmara, latitude: 40.72, longitude: 29.15 }, // Yalova

  // ── Aegean, north → south ───────────────────────────────────────────────────
  { plate: '17', basin: SeaBasin.Aegean, latitude: 39.78, longitude: 25.9 }, // Çanakkale, W of Bozcaada
  { plate: '10', basin: SeaBasin.Aegean, latitude: 39.42, longitude: 26.45 }, // Balıkesir, Edremit mouth
  { plate: '35', basin: SeaBasin.Aegean, latitude: 38.72, longitude: 26.6 }, // İzmir, N of Karaburun
  { plate: '09', basin: SeaBasin.Aegean, latitude: 37.6, longitude: 27.1 }, // Aydın
  { plate: '48', basin: SeaBasin.Aegean, latitude: 36.95, longitude: 27.25 }, // Muğla, off Bodrum

  // ── Mediterranean, west → east ──────────────────────────────────────────────
  { plate: '07', basin: SeaBasin.Mediterranean, latitude: 36.6, longitude: 30.7 }, // Antalya
  { plate: '33', basin: SeaBasin.Mediterranean, latitude: 36.6, longitude: 34.5 }, // Mersin
  { plate: '01', basin: SeaBasin.Mediterranean, latitude: 36.4, longitude: 35.38 }, // Adana, off Karataş
  { plate: '31', basin: SeaBasin.Mediterranean, latitude: 36.05, longitude: 35.8 }, // Hatay, off Samandağ
];

/**
 * The candidate list, with identity derived from the province seed.
 *
 * NAMING: only a province that appears TWICE in the table carries the sea in its name and slug —
 * that is the case the qualifier exists to disambiguate, since İstanbul's two points sit next to
 * each other on the hub showing different numbers. Adding "– Karadeniz" to all fifteen Black Sea
 * points would be noise; the sea is on every point anyway, in `coastLabel*` and `seaBasin`.
 *
 * Province identity is READ from `SEED_PROVINCES` rather than retyped, so a plate code that is
 * not a real province fails here, loudly, at module load — not silently at seed time.
 */
export const MARINE_POINT_CANDIDATES: readonly MarinePointCandidate[] = (() => {
  const provinceByPlate = new Map(SEED_PROVINCES.map((province) => [province.plateCode, province]));
  const pointsPerPlate = new Map<string, number>();
  for (const row of CANDIDATE_ROWS) {
    pointsPerPlate.set(row.plate, (pointsPerPlate.get(row.plate) ?? 0) + 1);
  }

  return CANDIDATE_ROWS.map((row, index) => {
    const province = provinceByPlate.get(row.plate);
    if (province === undefined) {
      throw new Error(
        `marine candidate #${String(index + 1)} names plate code ${row.plate}, which is not a ` +
          `seeded province. Fix the table — a marine point without its province is an orphan.`,
      );
    }

    const naming = BASIN_NAMING[row.basin];
    const needsSeaQualifier = (pointsPerPlate.get(row.plate) ?? 0) > 1;

    return {
      slugTr: needsSeaQualifier
        ? `${province.slugTr}-${naming.slugTr}-aciklari`
        : `${province.slugTr}-aciklari`,
      slugEn: needsSeaQualifier
        ? `${province.slugEn}-${naming.slugEn}-offshore`
        : `${province.slugEn}-offshore`,
      nameTr: needsSeaQualifier
        ? `${province.nameTr} – ${naming.nameTr} Açıkları`
        : `${province.nameTr} Açıkları`,
      // The province seed carries no EN name: Turkish province names are used unchanged in
      // English, so `nameTr` is the correct EN form too.
      nameEn: needsSeaQualifier
        ? `${province.nameTr} – ${naming.nameEn} Offshore`
        : `${province.nameTr} Offshore`,
      coastLabelTr: COAST_LABELS[row.basin].tr,
      coastLabelEn: COAST_LABELS[row.basin].en,
      plateCode: province.plateCode,
      provinceNameTr: province.nameTr,
      seaBasin: row.basin,
      latitude: row.latitude,
      longitude: row.longitude,
      displayOrder: index + 1,
    } satisfies MarinePointCandidate;
  });
})();
