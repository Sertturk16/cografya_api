import { toTilePixel } from './cmems-geo';
import { CMEMS_TILE_MATRIX_SET, CMEMS_VARIABLE_IDS, CMEMS_ZOOM } from './cmems.constants';
import type { CmemsLayerField } from './cmems.constants';

/**
 * WMTS URL construction — the M1 probe's request shape plus the ALWAYS-explicit `time=`.
 *
 * One builder for the runtime client AND the probe, so the committed probe artifact proves the
 * exact request production sends (same zoom, same parameter set, same encoding).
 */

export interface CmemsGetFeatureInfoRequest {
  /** e.g. `https://wmts.marine.copernicus.eu/teroWmts` (env `CMEMS_WMTS_BASE_URL`). */
  readonly wmtsBaseUrl: string;
  /** Resolved `PRODUCT_ID/dataset_id` path — from the STAC resolver, never pinned. */
  readonly datasetPath: string;
  readonly field: CmemsLayerField;
  readonly latitude: number;
  readonly longitude: number;
  /** Hour-aligned explicit instant from `selectCmemsTime` — never defaulted (SPEC v1 §3.1). */
  readonly timeIso: string;
}

export function buildCmemsGetFeatureInfoUrl(request: CmemsGetFeatureInfoRequest): string {
  const pixel = toTilePixel(request.latitude, request.longitude, CMEMS_ZOOM);
  const params = new URLSearchParams({
    service: 'WMTS',
    version: '1.0.0',
    request: 'GetFeatureInfo',
    layer: `${request.datasetPath}/${CMEMS_VARIABLE_IDS[request.field]}`,
    style: '',
    format: 'image/png',
    tilematrixset: CMEMS_TILE_MATRIX_SET,
    TileMatrix: String(CMEMS_ZOOM),
    TileRow: String(pixel.tileRow),
    TileCol: String(pixel.tileCol),
    I: String(pixel.i),
    J: String(pixel.j),
    infoformat: 'application/json',
    time: request.timeIso,
  });
  return `${request.wmtsBaseUrl}?${params.toString()}`;
}

/** The STAC product-document URL (env `CMEMS_STAC_BASE_URL` + the stable product id). */
export function buildCmemsProductStacUrl(stacBaseUrl: string, productId: string): string {
  return `${stacBaseUrl}/${productId}/product.stac.json`;
}
