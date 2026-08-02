import type { OperationDeadline } from '../../upstream/operation-deadline';
import type { ProviderBudgetLimits } from '../../upstream/provider-budget';
import type { UpstreamHttpClient } from '../../upstream/upstream-http.client';
import type { UpstreamOutcome } from '../../upstream/upstream.types';
import { MARINE_PROVIDER } from '../marine-upstream.config';
import { parseCmemsGetFeatureInfo, type CmemsPointValue } from './cmems-response';
import type { CmemsDatasetSelector } from './cmems-routing';
import {
  parseCmemsProductStac,
  resolveCmemsProduct,
  type CmemsProductResolution,
} from './cmems-stac';
import { buildCmemsGetFeatureInfoUrl, buildCmemsProductStacUrl } from './cmems-url';
import { CMEMS_VARIABLE_IDS, type CmemsLayerField } from './cmems.constants';

/**
 * The CMEMS adapter — every call this API makes to Copernicus Marine goes through here.
 *
 * ## What it is, and is not
 * A thin composition over the SHARED `UpstreamHttpClient` (guard order: budget → breaker →
 * deadline → byte cap → content type → parse — never duplicated, DEC 2026-07-31 A-1 lineage)
 * plus the pure CMEMS modules in this directory. It holds no cache, no schedule and no Redis:
 * the read-through cache and the warmup target wire it in M4b. Nothing constructs it in M4a —
 * zero runtime behaviour, by acceptance criterion.
 *
 * ## The XML error path, stated once
 * A retired dataset id (or an out-of-extent `time=`) answers HTTP 400 + `text/xml` OWS
 * ExceptionReport (measured, fixture committed). The shared client classifies the STATUS
 * before any body parse, so that reply becomes `client_error` (loud, 900 s negative TTL) and
 * the JSON parser never sees XML. `cmems-reresolve.ts` turns that signal into a forced STAC
 * re-resolution, once per tour (M4b wiring).
 *
 * ## No credentials, by measurement
 * Both endpoints are anonymous — no key, no account, no token (verified 2026-08-02). Stated
 * so nobody later "fixes" that by adding one. If the provider ever closes anonymous access,
 * that is a provider change → breaker → `unavailable`, and a decision for Atlas (risk R4).
 */
export interface CmemsClientOptions {
  readonly wmtsBaseUrl: string;
  readonly stacBaseUrl: string;
  readonly limits: ProviderBudgetLimits;
  /**
   * `CMEMS_SINGLE_CALL_TIMEOUT_MS` (6 000): a session's FIRST call measured 2.54 s on a cold
   * TLS handshake, so the shared client's 3 s marine default would manufacture false timeouts.
   * Passed PER REQUEST via the shared client's `singleCallTimeoutMs` override (the review #80
   * I8 seam) rather than by constructing a second client instance — the ECMWF second-instance
   * pattern predates that seam.
   */
  readonly singleCallTimeoutMs: number;
  /** ~10–15 KB text documents; a cap far above them, far below the shared 8 MB default. */
  readonly maxResponseBytes?: number;
}

/** GetFeatureInfo replies are ~300 B and STAC documents ~15 KB; 1 MiB is ample headroom. */
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;

export interface CmemsFetchValueRequest {
  readonly field: CmemsLayerField;
  readonly latitude: number;
  readonly longitude: number;
  /**
   * Resolved `PRODUCT_ID/dataset_id` (STAC resolver output — never a pinned constant).
   *
   * SECURITY INVARIANT (review #81 M-SEC-1): the product half of this path originates ONLY
   * from the static `CMEMS_BASIN_ROUTING` table, and the dataset half only from the STAC
   * resolver run against that same table's product ids. Nothing request-shaped — no slug, no
   * query parameter, no header — may ever reach this string: it is interpolated into an
   * outbound URL, and a caller-influenced value would let a request choose which upstream
   * resource this server fetches.
   */
  readonly datasetPath: string;
  readonly maxGridDistanceKm: number;
  /** From `selectCmemsTime` — the explicit instant that becomes `validAtUtc`. */
  readonly timeIso: string;
  readonly validAtMs: number;
  readonly deadline: OperationDeadline;
}

export interface CmemsFetchResolutionRequest {
  readonly productId: string;
  /** Every selector this product serves (BLKSEA PHY carries two) — one HTTP call for all. */
  readonly selectors: readonly { readonly key: string; readonly selector: CmemsDatasetSelector }[];
  readonly deadline: OperationDeadline;
}

export class CmemsClient {
  constructor(
    private readonly http: UpstreamHttpClient,
    private readonly options: CmemsClientOptions,
  ) {}

  /** One point × one variable × one instant — the unit CMEMS bills (quota weight 1). */
  async fetchPointValue(
    request: CmemsFetchValueRequest,
  ): Promise<UpstreamOutcome<CmemsPointValue>> {
    const url = buildCmemsGetFeatureInfoUrl({
      wmtsBaseUrl: this.options.wmtsBaseUrl,
      datasetPath: request.datasetPath,
      field: request.field,
      latitude: request.latitude,
      longitude: request.longitude,
      timeIso: request.timeIso,
    });

    return this.http.request<CmemsPointValue>({
      providerId: MARINE_PROVIDER.cmems,
      label: `cmems.${CMEMS_VARIABLE_IDS[request.field]}`,
      url,
      deadline: request.deadline,
      limits: this.options.limits,
      singleCallTimeoutMs: this.options.singleCallTimeoutMs,
      expectedContentType: 'application/json',
      maxResponseBytes: this.options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      parse: (body) =>
        parseCmemsGetFeatureInfo(body, {
          field: request.field,
          requestedLatitude: request.latitude,
          requestedLongitude: request.longitude,
          maxGridDistanceKm: request.maxGridDistanceKm,
          timeIso: request.timeIso,
          validAtMs: request.validAtMs,
        }),
    });
  }

  /** One product document → every selector it serves, resolved in a single call. */
  async fetchProductResolution(
    request: CmemsFetchResolutionRequest,
  ): Promise<UpstreamOutcome<CmemsProductResolution>> {
    return this.http.request<CmemsProductResolution>({
      providerId: MARINE_PROVIDER.cmems,
      label: `cmems.stac.${request.productId}`,
      url: buildCmemsProductStacUrl(this.options.stacBaseUrl, request.productId),
      deadline: request.deadline,
      limits: this.options.limits,
      singleCallTimeoutMs: this.options.singleCallTimeoutMs,
      expectedContentType: 'application/json',
      maxResponseBytes: this.options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      // Selector misses inside a well-formed document are PER-SELECTION results, not a parse
      // throw: one basin's rotation must not darken another's field. Only a document that is
      // not the promised shape at all throws (→ schema_error).
      parse: (body) => ({
        kind: 'ok',
        value: resolveCmemsProduct(parseCmemsProductStac(body), request.selectors),
      }),
    });
  }
}
