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
}

export interface AirQualityProbeJobRecord {
  label: 'production' | 'fixture';
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

export interface AirQualityProbeArtifact {
  generatedAtUtc: string;
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
  jobs: AirQualityProbeJobRecord[];
  requests: AirQualityProbeRequestRecord[];
  totals: { requestCount: number; downloadedBytes: number; wallClockMs: number };
  assertions: AirQualityProbeAssertionResult[];
}
