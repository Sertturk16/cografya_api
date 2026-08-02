import type { AirQualityPollutant, AirQualityStatus } from '../../air-quality/air-quality.types';
import type { CamsAxisSummary } from '../../air-quality/cams/cams-decode';

/**
 * Shape of `data/air-quality/air-quality-probe.json` — the committed evidence of one hand-run
 * probe against the real ADS queue (SPEC §7.5).
 *
 * The artifact is EVIDENCE and the structural reference of tests, never a runtime input, and
 * never a source of asserted FACTS: tests check structure/invariants over it (81 rows, all
 * within threshold, no key material), not that a particular province had a particular
 * concentration.
 *
 * No field may ever carry the ADS key: the request bodies recorded here are the JSON bodies
 * (key travels in a header), `lastError`-style fields pass through redaction, and the probe's
 * final assertion scans the serialised artifact for the key before writing.
 */

export interface AirQualityProbeRequestRecord {
  label: string;
  method: 'GET' | 'POST' | 'DELETE';
  /** Key-free by construction (the ADS key travels only in the PRIVATE-TOKEN header). */
  url: string;
  httpStatus: number;
  bytes: number;
  durationMs: number;
  /**
   * The response's `content-type` header verbatim, or `null` when the response carried none
   * (A2a measurements Ö-A2-1 and Ö-A2-2).
   *
   * The probe's `call()` has always READ this header; it simply never persisted it, so two
   * facts the A2 ingest must be coded against were unmeasured: what a `DELETE /jobs/{id}`
   * actually answers (a 204 with no header would make the shared client's content-type guard
   * raise `schema_error` on a SUCCESSFUL cleanup), and what the object store declares on the
   * download (the result body says `application/zip`, the HTTP header was never checked — and
   * the client's `expectedContentType` list is built from it).
   */
  contentType: string | null;
}

/** Which CAMS product a probe job asked for — the `@4` decoder's `expectedProduct`. */
export type AirQualityProbeJobLabel = 'production' | 'analysis' | 'fixture';

export interface AirQualityProbeJobRecord {
  label: AirQualityProbeJobLabel;
  /** `FORECAST` for the production/fixture jobs, `ANALYSIS` for the D−1 archive read. */
  product: 'FORECAST' | 'ANALYSIS';
  /** The run day THIS job requested, `YYYY-MM-DD`. The analysis job is deliberately D−1. */
  requestDate: string;
  /** The exact JSON body submitted (never contains the key). */
  requestBody: unknown;
  costing: { cost: number; limit: number };
  jobId: string;
  /** ADS's own queue stamps, verbatim — the real queue-length evidence stream. */
  adsStamps: { created: string | null; started: string | null; finished: string | null };
  queueSeconds: number | null;
  runSeconds: number | null;
  resultHost: string;
  declaredSizeBytes: number;
  downloadedBytes: number;
  checksumMd5: string;
  checksumVerified: boolean;
  downloadMs: number;
  decodeMs: number;
  /** Two-layer format evidence: ZIP method + entry name + inner magic class. */
  zipMethod: number;
  entryName: string;
  innerFormat: string;
  deleted: boolean;
}

export interface AirQualityProbeProvinceRecord {
  plateCode: string;
  requestedLatitude: number;
  requestedLongitude: number;
  gridLatitude: number | null;
  gridLongitude: number | null;
  distanceKm: number | null;
  thresholdKm: number | null;
  withinThreshold: boolean;
  outsideDomain: boolean;
  support: Record<AirQualityPollutant, AirQualityStatus.Ok | AirQualityStatus.NotSupported>;
  /** First-step raw value per pollutant — the value/null matrix sample (SPEC §7.5). */
  firstStepValues: Record<AirQualityPollutant, number | null>;
  /** How many of the run's steps were null per pollutant (0 expected today, measured). */
  nullStepCounts: Record<AirQualityPollutant, number>;
}

export interface AirQualityProbeAssertionResult {
  id: string;
  passed: boolean;
  detail: string;
}

/**
 * Ö-A2-3: what `GET /jobs` (the list) and `GET /jobs/{id}` actually return.
 *
 * The A2 ingest reconciles a job stuck in `submitting` against this list instead of ever
 * re-submitting (a submit is NOT idempotent), so the strictness of that reconciliation depends
 * on whether a job record can be tied back to OUR request body. KEYS ARE RECORDED, NEVER
 * VALUES: the answer needed is structural, and a verbatim provider body is exactly the place a
 * key echo or an unrelated job's metadata could ride into a committed artifact.
 */
export interface AirQualityJobsListProbe {
  httpStatus: number;
  contentType: string | null;
  /** Top-level keys of the list body (e.g. `jobs`, `metadata`). */
  bodyKeys: string[];
  /** Where the array of jobs was found, or `null` when the body is not a list at all. */
  jobsArrayKey: string | null;
  jobCount: number | null;
  /** Keys of ONE job entry — the answer to "is the request body echoed back?". */
  entryKeys: string[];
  /** Whether the entry carries our own submitted inputs under any of the plausible keys. */
  entryEchoesRequestInputs: boolean;
  /** Whether the job we had just submitted appears in the list at all. */
  containsSubmittedJob: boolean;
  /** The same question for the single-job endpoint (`GET /jobs/{id}`). */
  detailKeys: string[];
  detailEchoesRequestInputs: boolean;
}

/**
 * Ö-A2-5 + R11: the analysis product's own evidence, or `null` when no analysis archive was
 * read (an offline `--from-file` re-run whose raw directory holds only the forecast archive).
 */
export interface AirQualityProbeAnalysisRecord {
  /** `YYYY-MM-DD` — must be exactly one day before the forecast job's run date. */
  requestDate: string;
  /** Steps decoded from the analysis file. 24 is the shape the request asks for. */
  timeStepCount: number;
  /** The `time` values as decoded — the measured ladder is 0…23 (`hour === index`). */
  timeHours: number[];
  longitudeAxis: CamsAxisSummary;
  latitudeAxis: CamsAxisSummary;
  /**
   * Whether the analysis grid is bit-identical to the forecast grid, cell by cell, for all 81
   * provinces. This is the measurement the ingest's grid-identity guard exists to keep true:
   * two products read from DIFFERENT cells merge into one series without erroring anywhere.
   */
  gridIdenticalToForecast: boolean;
  /** Provinces whose analysis cell differs from their forecast cell (expected: empty). */
  gridMismatchPlateCodes: string[];
}

export interface AirQualityProbeArtifact {
  generatedAtUtc: string;
  /**
   * `ads-probe` — the archives came from a live, hand-run ADS pass; `from-file` — they were
   * re-decoded OFFLINE from a raw directory a previous pass wrote (the ERA5 `--from-file`
   * precedent). The distinction is load-bearing: an offline artifact records no queue stamps,
   * no checksums and no cleanup, and the assertion set says so instead of passing vacuously.
   */
  sourceMode: 'ads-probe' | 'from-file';
  userAgent: string;
  baseUrl: string;
  datasetId: string;
  /** Run day requested (`YYYY-MM-DD`) — validAtUtc derivation base. */
  runDate: string;
  /** The `area` parameter exactly as sent: [N, W, S, E]. */
  areaSent: readonly number[];
  decoderVersion: string;
  /** Axis directions/steps as decoded — the longitude-convention evidence. */
  longitudeAxis: CamsAxisSummary;
  latitudeAxis: CamsAxisSummary;
  timeStepCount: number;
  /** Verbatim from the file: the three-way-mapping and unit/fill evidence. */
  fileVariableNames: Partial<Record<AirQualityPollutant, string>>;
  units: Partial<Record<AirQualityPollutant, string>>;
  /** First code point of the canonical unit as decoded (expected 0x00B5). */
  unitFirstCodePoint: number | null;
  fillValues: Partial<Record<AirQualityPollutant, number>>;
  provinces: AirQualityProbeProvinceRecord[];
  /** The analysis product's evidence (Ö-A2-5), or null when no analysis archive was read. */
  analysis: AirQualityProbeAnalysisRecord | null;
  /** The `GET /jobs` reconciliation measurement (Ö-A2-3), or null on an offline re-run. */
  jobsListProbe: AirQualityJobsListProbe | null;
  jobs: AirQualityProbeJobRecord[];
  requests: AirQualityProbeRequestRecord[];
  totals: { requestCount: number; downloadedBytes: number; wallClockMs: number };
  assertions: AirQualityProbeAssertionResult[];
}
