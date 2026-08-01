import type { Era5AxisSummary } from './era5-decode';
import type { Era5DecoderIdentity } from './hdf5/jsfive.adapter';

/**
 * Shapes of the two committed artifacts under `data/era5-land/` — the reviewable evidence of one
 * hand-run `--phase=fetch` (SPEC §3.3).
 *
 * ## What these files ARE
 * `era5-manifest.json` answers "which byte of which file did this number come from": the axes, the
 * 81 cell assignments (with the A-1 fallback flag, cell and KILOMETRES), the readable global
 * attributes, the exact request body, the checksums, the decoder identity and the run-time
 * assertion results — plus, on a LIVE run only, the CDS job ids and queue stamps (see
 * {@link Era5Manifest.sourceMode}: an offline `--from-file` regeneration carries `jobs: []`,
 * because claiming ids it never issued would be a lie). `rawFile.md5` is always OUR digest of the
 * bytes; the provider's own `file:checksum` lives in `jobs[].declaredChecksumMd5`, where it was
 * compared before the job was deleted. `era5-province-series.json` carries the 81 × 360 × 2 CONVERTED but
 * NOT-YET-AVERAGED values, so PR-2's 30-year mean stays auditable OFFLINE — anybody can recompute
 * the published normal from a committed file without touching CDS.
 *
 * ## What they are NOT
 * They are never a runtime input, and they are never a source of asserted FACTS. The tests over
 * them check STRUCTURE and INVARIANTS (81 rows, 360 months, no gaps, fallback set = the expected
 * five, distances under the ceiling, no key material) — never that a given province had a given
 * temperature. Facts are recorded; structure is asserted.
 *
 * ## Why the raw `.nc` is not here
 * The production file is 19 801 767 B. It stays OUT of git (mandatory `--raw-dir`, plus a
 * `.gitignore` belt) and is identified forever by the SHA-256 + size + provider MD5 recorded in
 * the manifest.
 */

/** One HTTP call made during the run — key-free by construction (the key lives in a header). */
export interface Era5RequestRecord {
  label: string;
  method: 'GET' | 'POST' | 'DELETE';
  url: string;
  httpStatus: number;
  bytes: number;
  durationMs: number;
}

export interface Era5JobRecord {
  label: 'production' | 'fixture';
  /** The exact JSON body submitted. */
  requestBody: unknown;
  costing: { cost: number; limit: number };
  jobId: string;
  /** CDS's own queue stamps, verbatim — the real queue-length evidence stream. */
  cdsStamps: { created: string | null; started: string | null; finished: string | null };
  queueSeconds: number | null;
  runSeconds: number | null;
  resultHost: string;
  declaredSizeBytes: number;
  downloadedBytes: number;
  /** The provider's `file:checksum` (MD5) and ours, plus our own SHA-256 of the same bytes. */
  declaredChecksumMd5: string;
  computedChecksumMd5: string;
  checksumVerified: boolean;
  sha256: string;
  downloadMs: number;
  decodeMs: number;
  /** `true` only when `DELETE /jobs/{id}` was called AFTER the download verified. */
  deleted: boolean;
}

/** One province's grid-cell assignment under the A-1 ruling. */
export interface Era5ProvinceCellRecord {
  plateCode: string;
  requestedLatitude: number;
  requestedLongitude: number;
  latIndex: number;
  lonIndex: number;
  cellLatitude: number;
  cellLongitude: number;
  /** A-1 record 1 of 3: did the declared nearest-land-cell fallback fire? */
  fallbackUsed: boolean;
  /** A-1 record 3 of 3: great-circle km from the administrative point to the cell used. */
  fallbackDistanceKm: number;
  /**
   * Axes on which the administrative point sat EXACTLY on a cell boundary, so the cell was picked
   * by the declared lower-index tie-break rather than by being nearer. Measured: only 44 Malatya,
   * on both axes. Recorded so the choice is declared rather than decided by floating-point noise.
   */
  halfStepTieAxes: readonly ('latitude' | 'longitude')[];
  /** 30-year mean of the monthly means — recorded evidence, asserted only by magnitude class. */
  annualMeanTempC: number;
  /** 30-year mean of the annual precipitation totals, mm. */
  annualTotalPrecipitationMm: number;
}

export interface Era5AssertionResult {
  id: string;
  passed: boolean;
  detail: string;
}

export interface Era5Manifest {
  schemaVersion: 1;
  generatedAtUtc: string;
  userAgent: string;
  baseUrl: string;
  datasetId: string;
  datasetUrl: string;
  doi: string;
  licence: string;
  /** The verbatim CC-BY-4.0 attribution the provider requires (carried into provenance/UI). */
  requiredAttribution: string;
  /**
   * How THIS artifact was produced.
   *
   * `cds-fetch` — a live run: the `jobs` block below carries the CDS job ids, queue stamps and the
   * provider's own checksum, and the download was verified against it before the job was deleted.
   * `from-file` — a deterministic offline re-run over a raw file already on disk (`--from-file`).
   * It has NO jobs by construction, and claiming any would be a lie; the integrity chain is
   * carried instead by `rawFile.sha256`/`rawFile.md5`, which were verified against the provider's
   * `file:checksum` when those bytes were originally downloaded.
   */
  sourceMode: 'cds-fetch' | 'from-file';
  /** The `area` parameter exactly as sent: [N, W, S, E]. */
  areaSent: readonly number[];
  /** The exact production request body — reproducibility, and key-free by construction. */
  productionRequestBody: unknown;
  decoder: Era5DecoderIdentity;
  /**
   * Raw file identity: the 18.88 MiB `.nc` that is deliberately NOT committed. Both digests are
   * OURS, computed over the bytes we hold. On a live run the provider's own MD5 is recorded
   * separately in `jobs[].declaredChecksumMd5` and `computedChecksumMd5` proves they matched.
   */
  rawFile: { name: string; sizeBytes: number; sha256: string; md5: string };
  axes: { latitude: Era5AxisSummary; longitude: Era5AxisSummary };
  months: { count: number; firstIso: string; lastIso: string };
  expver: { distinctValues: readonly string[]; count: number };
  /**
   * Root-group attributes verbatim. These ARE readable (compact storage) and carry the load:
   * `history` holds `stream=moda`, which is the actual evidence for the `tp` multiplier.
   */
  globalAttributes: Readonly<Record<string, string>>;
  /**
   * The declared tie-break convention for a coordinate landing exactly on a cell boundary, plus
   * the provinces it applied to. Without this, which of two equidistant cells wins is decided by
   * floating-point noise in the derived step — a silent shift (Atlas ruling, 2026-08-02).
   */
  halfStepTieBreak: { rule: string; plateCodes: readonly string[] };
  variables: readonly {
    requestName: string;
    fileName: string;
    /**
     * `null` means UNREADABLE, not absent — see {@link Era5Manifest.unitsAttributeNote}. Never
     * infer "the file has no units" from this field.
     */
    unitsAttribute: string | null;
    conversion: string;
  }[];
  /** Why every `unitsAttribute` above is `null`, stated so nobody misreads it as "absent". */
  unitsAttributeNote: string;
  mask: {
    maskedCells: number;
    totalCells: number;
    maskedRatio: number;
    /** Whether every inspected cell kept its NaN state across all months. */
    timeInvariant: boolean;
  };
  provinces: readonly Era5ProvinceCellRecord[];
  /** Plate codes whose fallback fired — compared against the expected closed set of five. */
  fallbackPlateCodes: readonly string[];
  jobs: readonly Era5JobRecord[];
  requests: readonly Era5RequestRecord[];
  totals: { requestCount: number; downloadedBytes: number; wallClockMs: number };
  assertions: readonly Era5AssertionResult[];
}

/** One province's converted-but-unaveraged series. */
export interface Era5ProvinceSeries {
  plateCode: string;
  /** 360 monthly means in °C, in `valid_time` order. Unrounded. */
  tempMeanC: readonly number[];
  /** 360 monthly totals in mm, in `valid_time` order. Unrounded. */
  precipitationMm: readonly number[];
}

export interface Era5SeriesArtifact {
  schemaVersion: 1;
  generatedAtUtc: string;
  /** Ties the series file to the manifest that explains it. */
  rawFileSha256: string;
  firstYear: number;
  lastYear: number;
  monthCount: number;
  /** `YYYY-MM` for every index — so a reader never has to infer the calendar. */
  monthLabels: readonly string[];
  provinces: readonly Era5ProvinceSeries[];
}
