import type { EcmwfParam } from '../../marine/ecmwf/ecmwf.constants';
import type { SeaBasin } from '../../marine/marine.types';

/**
 * `data/marine/marine-ecmwf-probe.json` — the committed evidence that the ECMWF leg's arithmetic
 * was checked against a live cycle.
 *
 * ## It is evidence, NOT a runtime input
 * The M1 artifact feeds `--phase=load`, which seeds rows from it. This one feeds nothing. Nothing
 * in the running server reads this file, and that is deliberate: the support matrix it records is
 * a snapshot of one cycle, and the F2 spike already measured a cell whose parameters disagreed
 * about whether it was water. A runtime that trusted a frozen matrix would keep publishing a
 * `not_supported` after the model's mask moved. The runtime classifies from the cycle in front of
 * it (`src/marine/ecmwf/ecmwf-support.ts`); this file is what a reviewer reads to see that the
 * grid mapping, the decode path and the direction convention were exercised against real bytes.
 *
 * ## Why it is committed rather than printed
 * Same reason as the M1 and climate artifacts: a run that leaves nothing behind cannot be
 * reviewed, and a number nobody can re-read is a number nobody checked.
 */

/** One HTTP call the probe made, and what came back. */
export interface EcmwfProbeRequestRecord {
  /** `oper.index`, `wave.range`, `cycle.head`, … */
  label: string;
  url: string;
  method: 'GET' | 'HEAD';
  /** The `Range` header sent, or null for a whole-body request. */
  rangeHeader: string | null;
  httpStatus: number;
  contentType: string;
  bytes: number;
  durationMs: number;
  /** sha256 of the body, so a re-run can prove exactly what changed. */
  sha256: string;
  /**
   * True when this request belongs to a cycle the probe WALKED AWAY FROM.
   *
   * ECMWF publishes 7–9 h after the cycle hour, so the newest candidate is regularly not there
   * yet and the probe falls back to the previous 6-hourly slot. That 404 is the fallback working,
   * not a transport failure — it must not fail the transport gate (`g8`) and it must not be
   * counted in `totals`, which project what one cycle of the real ingest costs. It is still
   * RECORDED, because "which cycles were tried" is exactly what someone re-reading a run needs.
   *
   * Optional because the first committed artifact (2026-07-30 12z) predates the field and had no
   * abandoned candidate: absent means the same thing as `false`.
   */
  abandonedCandidate?: boolean;
}

/**
 * One decoded GRIB message's envelope, as OUR reader saw it.
 *
 * `packingLabel` is derived from `dataRepresentationTemplate` through a fixed table, NOT read
 * from the decoder — the decoder does not expose ecCodes' `packingType` string, and copying a
 * value we did not observe into a file called evidence would be dishonest. The template number is
 * the thing that was actually read; the label is a courtesy translation of it. The independent
 * ecCodes reading of the same template lives in the golden corpus
 * (`test/fixtures/ecmwf/eccodes-reference.json`).
 */
export interface EcmwfProbeMessageRecord {
  param: EcmwfParam;
  stream: string;
  /** Byte offset inside the provider's own GRIB file, from the `.index`. */
  offsetInFile: number;
  lengthBytes: number;
  dataRepresentationTemplate: number;
  packingLabel: string;
  bitsPerValue: number;
  columns: number;
  rows: number;
  numberOfDataPoints: number;
  numberOfEncodedValues: number;
  bitmapPresent: boolean;
  firstLatitude: number;
  firstLongitude: number;
  lastLatitude: number;
  lastLongitude: number;
  scanningMode: number;
  referenceTimeUtc: string;
  forecastHours: number;
  validTimeUtc: string;
  /** Values that decoded to a real number. Must equal `numberOfEncodedValues`. */
  finiteValues: number;
  decodeMs: number;
}

/** One reference point's placement and what the cycle held there. */
export interface EcmwfProbePointRecord {
  slugTr: string;
  slugEn: string;
  plateCode: string;
  provinceNameTr: string;
  seaBasin: SeaBasin;
  latitude: number;
  longitude: number;
  displayOrder: number;
  gridLatitude: number;
  gridLongitude: number;
  gridRow: number;
  gridColumn: number;
  gridIndex: number;
  distanceKm: number;
  thresholdKm: number;
  withinThreshold: boolean;
  /** Raw provider values at this cell, one per parameter. `null` is a masked or missing cell. */
  values: Record<EcmwfParam, number | null>;
  /**
   * What WE compute from `10u`/`10v` — recorded so the derivation is visible in the evidence
   * rather than only in a test. Never stored by the runtime: derivation happens at read time from
   * the raw components (SPEC §9.1).
   */
  derived: {
    windSpeed10m: number | null;
    windDirection10m: number | null;
  };
  /**
   * Per-parameter observation at THIS step only — `value` or `missing`.
   *
   * Deliberately not the cycle-level `ok`/`not_supported` verdict: one step is not enough
   * evidence for a claim about whether the model carries a field here at all, and recording a
   * one-sample verdict as if it were one would be exactly the overclaim the classification rules
   * exist to prevent.
   */
  observed: Record<EcmwfParam, 'value' | 'missing'>;
}

/** One assertion's verdict, recorded so a human can read the run without re-executing it. */
export interface EcmwfProbeAssertionResult {
  /** Stable id, e.g. `g1-grid-threshold`. */
  id: string;
  passed: boolean;
  detail: string;
}

/** The committed artifact. */
export interface MarineEcmwfProbeArtifact {
  /** ISO-8601 UTC instant the run COMPLETED (stamped after the gates, not before). */
  generatedAtUtc: string;
  userAgent: string;
  baseUrl: string;
  /** The 00/06/12/18 UTC cycle the evidence came from. */
  cycleUtc: string;
  /** Forecast step probed, hours. */
  stepHours: number;
  /** Steps the ingest will fetch per cycle, and the horizon they cover — context, not evidence. */
  plannedStepCount: number;
  plannedHorizonHours: number;
  decoder: {
    package: string;
    version: string;
    /** Node's platform/arch, which is what selects the native binary or the WASM fallback. */
    platform: string;
    arch: string;
  };
  /**
   * The provider's own statement of the wave-direction convention, quoted.
   *
   * Recorded in the artifact because a reversed arrow is the failure this whole leg is most
   * exposed to, and "we checked the docs once" is not evidence.
   */
  directionConvention: {
    source: string;
    quote: string;
  };
  requests: EcmwfProbeRequestRecord[];
  /** Covers the requests that produced the evidence — see {@link EcmwfProbeRequestRecord.abandonedCandidate}. */
  totals: {
    requestCount: number;
    /** Requests spent on cycle candidates that were walked away from. Optional for the same reason the flag is. */
    abandonedRequestCount?: number;
    downloadedBytes: number;
    downloadMs: number;
    decodeMs: number;
  };
  messages: EcmwfProbeMessageRecord[];
  points: EcmwfProbePointRecord[];
  assertions: EcmwfProbeAssertionResult[];
}
