import type { MarineLayerId, SeaBasin } from '../../marine/marine.types';

/**
 * The provider vocabulary of the M1 probe artifact — **frozen, historical, and deliberately NOT
 * the live `MarineSource` enum**.
 *
 * ## Why these two had to be separated
 * `marine-points-probe.json` is the record of a run that happened on 2026-07-30 and queried
 * Copernicus Marine and Open-Meteo. M3a replaces `open-meteo` with `ecmwf` in the live contract
 * (DEC 2026-07-31), and while the artifact imported that enum the two were the same string by
 * coincidence of timing. Rewriting the artifact to say `ecmwf` would be falsifying a measurement:
 * that run never spoke to ECMWF. Leaving it importing an enum that no longer contains
 * `open-meteo` would simply not compile.
 *
 * So the artifact gets its own closed set, fixed at what was actually measured. This is a
 * DECOUPLING, not a generalisation: nothing is added, and the live enum stays the single
 * authority for what the API may publish today.
 *
 * `layerId` deliberately keeps reading the live `MarineLayerId`, and the asymmetry is on purpose.
 * A source changed because the PROVIDER changed, and history must keep naming the provider it
 * queried. A layer id changing would mean the published layer vocabulary moved — and then the
 * artifact genuinely is stale and should be re-probed rather than quietly kept readable.
 */
export const MARINE_ARTIFACT_SOURCE = {
  cmems: 'cmems',
  openMeteo: 'open-meteo',
} as const;

export type MarineArtifactSource =
  (typeof MARINE_ARTIFACT_SOURCE)[keyof typeof MARINE_ARTIFACT_SOURCE];

/**
 * The committed artifact `--phase=probe` writes and `--phase=load` reads.
 *
 * ## Why the two-phase split, again, for a different provider
 * Same discipline as `db:import:era5`, for the same reason: `probe` is the ONLY phase that
 * touches the network, is run BY HAND, and produces a reviewable file; `load` is offline,
 * deterministic, idempotent, and is the only phase CI or a deploy may run. A build that can
 * fail because Copernicus is down is not a build.
 *
 * ## Why it matters MORE here than it did for climate
 * A wrongly-placed point does not crash anything. It binds the wrong province to the wrong sea
 * and publishes a plausible number, with every test green — which is precisely the failure
 * class DEC 2026-07-19's MAPPING leg exists for. The artifact is the evidence that each
 * coordinate was checked against a live provider response, and `load` re-derives every verdict
 * from that evidence rather than trusting the recorded one (a file cannot corroborate itself).
 *
 * Single file, unlike climate's normals+manifest pair: there is nothing to cross-check ACROSS
 * files here, because the evidence and the payload are the same 30 rows. What corroborates the
 * payload is the raw provider response recorded beside it, plus the `assertions` re-run.
 */

/** One CMEMS `GetFeatureInfo` call and everything the response said. */
export interface CmemsProbeResult {
  /** The full request URL, verbatim — the audit trail for the tile/pixel arithmetic. */
  requestUrl: string;
  httpStatus: number;
  /**
   * Response `content-type`. Recorded because the provider's ERROR path is
   * `text/xml` OWS `ExceptionReport` + HTTP 400, not JSON — so the content type must be checked
   * BEFORE the body is parsed, and the artifact must show that it was.
   */
  contentType: string;
  /** sha256 of the raw response body, so a re-run can prove exactly what changed. */
  responseSha256: string;
  /** `PRODUCT/dataset` we ASKED for. */
  requestedDatasetId: string;
  requestedVariableId: string;
  /** `PRODUCT/dataset` the provider ECHOED. A mismatch means we queried something else. */
  datasetId: string | null;
  variableId: string | null;
  value: number | null;
  /** The provider's raw unit string, untouched (`m` / `degree` / `degrees_C`) — the evidence. */
  units: string | null;
  /** The model grid-cell centre the provider snapped to. */
  gridLatitude: number | null;
  gridLongitude: number | null;
  /** Requested coordinate → grid centre, km. In-cell offset; see the threshold docs. */
  distanceKm: number | null;
}

/** One Open-Meteo batched request, recorded once for the whole run. */
export interface OpenMeteoRequestRecord {
  label: 'forecast' | 'marine';
  requestUrl: string;
  httpStatus: number;
  contentType: string;
  responseSha256: string;
  /** How many coordinates the single call covered — the batching claim, made checkable. */
  pointCount: number;
}

/** One point's slice of the batched Open-Meteo responses (first time step). */
export interface OpenMeteoProbeResult {
  /** Grid centre of the MARINE call (wave + SST). */
  gridLatitude: number | null;
  gridLongitude: number | null;
  distanceKm: number | null;
  /**
   * Grid centre of the FORECAST call (wind) — a different endpoint, on a different grid.
   *
   * Recorded separately because wind is a published layer whose ONLY source is this call: if the
   * artifact carried just the marine grid centre, there would be no evidence at all of where the
   * wind value was actually read from, and no threshold guarding it. The two really do differ —
   * they are different models — so collapsing them would be a guess dressed as a record.
   */
  windGridLatitude: number | null;
  windGridLongitude: number | null;
  windDistanceKm: number | null;
  /** The instant the sampled values belong to (`hourly.time[0]`), ISO-8601 UTC. */
  validAtUtc: string | null;
  windSpeed10m: number | null;
  windDirection10m: number | null;
  waveHeight: number | null;
  waveDirection: number | null;
  seaSurfaceTemperature: number | null;
  /** Raw provider unit strings, verbatim — the evidence for the unit normalisation. */
  units: Record<string, string>;
}

/**
 * Whether a (point, layer, source) triple is served at all.
 *
 * `supported: false` is what the RUNTIME reads to decide `status: 'not_supported'` and to skip
 * the call entirely (SPEC-ADDENDUM §2.2). It is a permanent product fact — CMEMS has no wave
 * field in the Marmara — not a transient outage, which is why it is recorded here rather than
 * discovered live every hour.
 */
export interface LayerSupportEntry {
  layerId: MarineLayerId;
  /** Historical vocabulary — see {@link MarineArtifactSource}, NOT the live `MarineSource`. */
  source: MarineArtifactSource;
  supported: boolean;
  reason: string;
}

/** One assertion's verdict, recorded so a human can read the run without re-executing it. */
export interface ProbeAssertionResult {
  /** Stable id, e.g. `a1-sst-present`. */
  id: string;
  passed: boolean;
  detail: string;
}

/** One candidate point, its raw provider evidence, and the verdicts derived from it. */
export interface MarineProbeEntry {
  slugTr: string;
  slugEn: string;
  nameTr: string;
  nameEn: string;
  coastLabelTr: string;
  coastLabelEn: string;
  plateCode: string;
  /**
   * The province's TR name as this candidate declares it — the MAPPING audit trail
   * (DEC 2026-07-19). `load` checks it against the seeded province row, so a plate code typed
   * one digit off fails by NAME instead of silently attaching a sea to the wrong province.
   */
  provinceNameTr: string;
  seaBasin: SeaBasin;
  latitude: number;
  longitude: number;
  displayOrder: number;
  probedAtUtc: string;

  cmems: {
    seaSurfaceTemperature: CmemsProbeResult;
    /** `null` means NOT QUERIED because the basin has no CMEMS wave field (Marmara). */
    waveHeight: CmemsProbeResult | null;
    waveDirection: CmemsProbeResult | null;
    /** Marmara only: the Black Sea wave layer, which must answer `null` here. */
    crossCheck: CmemsProbeResult | null;
  };
  openMeteo: OpenMeteoProbeResult;
  support: LayerSupportEntry[];
  assertions: ProbeAssertionResult[];
}

/** `marine-points-probe.json` — the single committed artifact. */
export interface MarinePointsProbeArtifact {
  /** ISO-8601 UTC instant the probe run COMPLETED (stamped after the gates, not before). */
  generatedAtUtc: string;
  /** The user agent the run identified itself with. */
  userAgent: string;
  cmems: {
    endpoint: string;
    tileMatrixSet: string;
    /**
     * WMTS zoom used for every point query.
     *
     * SPEC v1 §3.1 measured the trap: the SAME coordinate returned `null` at zoom 6 and
     * 24.65 °C at zoom 8, because at low zoom the pixel covers enough ground to land on land.
     * The rule is zoom ≥ 10; this run uses a higher one still, so that even the 500 m Marmara
     * grid is finer than nothing — at zoom 12 a pixel is ~27 m at 40° N, comfortably inside a
     * 500 m cell.
     */
    zoom: number;
    /**
     * `null` — the probe sends NO explicit `time`, so the provider's default step is used.
     *
     * Deliberate and recorded rather than silent. What the probe asks is "does this coordinate
     * sit on a WET cell of the right dataset", and a land mask does not move with time; sending
     * an explicit time would only add a horizon-validity failure mode. The RUNTIME rule is the
     * opposite and stays binding (SPEC-ADDENDUM §7.1): every runtime CMEMS call must send an
     * explicit `time`, because a value whose instant we do not know must never be published as
     * "now".
     */
    timeParam: null;
  };
  openMeteo: {
    forecastEndpoint: string;
    marineEndpoint: string;
    /** Always `ms`: requested explicitly, never trusting the provider default of km/h. */
    windSpeedUnit: 'ms';
    requests: OpenMeteoRequestRecord[];
  };
  entries: MarineProbeEntry[];
}
