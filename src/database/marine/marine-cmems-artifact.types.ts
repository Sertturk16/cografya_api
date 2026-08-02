import type { SeaBasin } from '../../marine/marine.types';

/**
 * The `data/marine/marine-cmems-probe.json` artifact — the committed evidence of one hand-run
 * `pnpm db:import:marine-cmems --phase=probe` (marine M4a acceptance criteria: support matrix,
 * 30/30 snap distances, resolved dataset ids, the 6-row dataset-level licence record with the
 * verbatim commercial-use quote (DEC 2026-07-30k), DOIs, the 400-XML fixture, and real
 * single-call timings).
 *
 * Like the M1/M3 artifacts this is EVIDENCE, not runtime input: the runtime resolves dataset
 * ids from STAC on its own (yeni-M3 §7.2 precedent), and `marine-cmems-assertions.spec.ts`
 * re-verifies the committed file offline on every CI run.
 */

/** One STAC selector's resolution inside a product record. */
export interface CmemsProbeSelectionRecord {
  readonly selectorKey: string;
  readonly acceptedVariableTokens: readonly string[];
  readonly gridToken: string;
  /** `null` = fail-closed (the reason says why) — never a "nearest similar" set. */
  readonly datasetId: string | null;
  readonly failReason: string | null;
}

/** One product STAC document fetch + everything resolved from it. */
export interface CmemsProbeStacProductRecord {
  readonly productId: string;
  readonly requestUrl: string;
  readonly httpStatus: number;
  readonly contentType: string;
  readonly responseSha256: string;
  readonly elapsedMs: number;
  /** STAC `license` field, verbatim (`proprietary` = Copernicus Marine Service Licence). */
  readonly license: string;
  readonly doi: string | null;
  readonly temporalExtent: { readonly startUtc: string | null; readonly endUtc: string | null };
  readonly updateFrequency: string | null;
  readonly admpUpdatedUtc: string | null;
  readonly itemCount: number;
  readonly selections: readonly CmemsProbeSelectionRecord[];
}

/**
 * One row of the DEC 2026-07-30k dataset-level licence record (6 rows: 5 datasets + the
 * Marmara-wave negative evidence).
 */
export interface CmemsLicenceRecord {
  readonly row: number;
  /** What the dataset serves, e.g. `BLKSEA 2.5 km hourly thetao`. */
  readonly datasetLabel: string;
  readonly productId: string | null;
  /** The id resolved in THIS run; `null` only on the negative row. */
  readonly resolvedDatasetId: string | null;
  readonly doi: string | null;
  readonly stacLicenseField: string | null;
  readonly licencePageUrl: string;
  readonly licencePageTitle: string;
  /**
   * The verbatim quote from the licence document that permits commercial use — checked as a
   * SUBSTRING of the fetched licence page text by the probe (quoteVerified below). The
   * platform is COMMERCIAL (DEC 2026-07-30k); an unverifiable quote HALTS the build (risk R5).
   */
  readonly verbatimCommercialUseQuote: string;
  readonly quoteVerified: boolean;
  /** The attribution obligation, verbatim from the licence (§2.4(a)). */
  readonly attributionRequirement: string;
  /** Negative row only: what proves the absence. */
  readonly negativeEvidence: string | null;
}

/** The licence-page fetch and the machine verification of every quote. */
export interface CmemsLicenceEvidence {
  readonly pageUrl: string;
  readonly httpStatus: number;
  readonly pageSha256: string;
  readonly retrievedAtUtc: string;
  readonly records: readonly CmemsLicenceRecord[];
}

/** One GetFeatureInfo call and everything the response said (M1's record shape + timing). */
export interface CmemsProbeCallRecord {
  readonly requestUrl: string;
  readonly httpStatus: number;
  readonly contentType: string;
  readonly responseSha256: string;
  readonly elapsedMs: number;
  /** Echoed by the provider — must start with the resolved `PRODUCT/dataset` path. */
  readonly datasetId: string | null;
  readonly variableId: string | null;
  readonly value: number | null;
  readonly rawUnits: string | null;
  readonly normalizedUnit: string | null;
  readonly gridLatitude: number | null;
  readonly gridLongitude: number | null;
  readonly distanceKm: number | null;
  /** The basin ceiling this call was judged against (SPEC-ADDENDUM §4.5(b)). */
  readonly maxGridDistanceKm: number;
  /** `no_data` when the provider answered null (land mask); `error` on any refusal. */
  readonly verdict: 'ok' | 'no_data' | 'error';
  readonly errorDetail: string | null;
}

/** One reference point's sweep: SST always; the wave pair only where CMEMS supports it. */
export interface CmemsProbeEntry {
  readonly slugTr: string;
  readonly seaBasin: SeaBasin;
  readonly latitude: number;
  readonly longitude: number;
  readonly probedAtUtc: string;
  readonly seaSurfaceTemperature: CmemsProbeCallRecord;
  /** `null` = NOT QUERIED because the basin has no CMEMS wave field (Marmara). */
  readonly waveHeight: CmemsProbeCallRecord | null;
  readonly waveDirection: CmemsProbeCallRecord | null;
}

/** The deliberately out-of-extent call that records the 400-XML contract. */
export interface CmemsXmlErrorFixtureRecord {
  readonly requestUrl: string;
  readonly requestedTimeIso: string;
  readonly httpStatus: number;
  readonly contentType: string;
  readonly bodySha256: string;
  /** Repo-relative path of the committed body (`test/fixtures/cmems/…`). */
  readonly fixturePath: string;
  readonly firstBytes: string;
}

/** Aggregate single-call timings — the PR body's evidence (plan acceptance M4a-2). */
export interface CmemsProbeTimings {
  readonly callCount: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly totalMs: number;
}

export interface CmemsProbeAssertionResult {
  readonly id: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface MarineCmemsProbeArtifact {
  readonly generatedAtUtc: string;
  readonly userAgent: string;
  readonly wmts: {
    readonly endpoint: string;
    readonly tileMatrixSet: string;
    readonly zoom: number;
    /** ONE explicit instant for the whole sweep — every value's `validAtUtc`. */
    readonly timeIso: string;
  };
  readonly stacEndpoint: string;
  readonly stacProducts: readonly CmemsProbeStacProductRecord[];
  readonly licence: CmemsLicenceEvidence;
  readonly entries: readonly CmemsProbeEntry[];
  readonly xmlErrorFixture: CmemsXmlErrorFixtureRecord;
  readonly timings: CmemsProbeTimings;
  readonly assertions: readonly CmemsProbeAssertionResult[];
}
