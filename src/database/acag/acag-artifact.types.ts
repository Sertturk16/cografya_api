import type { AcagDecoderIdentity } from './acag-hdf5.adapter';

/**
 * The shapes of the two COMMITTED artifacts (`data/acag-pm25/`).
 *
 * The split mirrors the ERA5 line: a MANIFEST that records what the hand-run fetch actually did
 * (files, hashes, timings, decoder identity, machine-checked assertions), and a SERIES artifact
 * carrying the published values. The load phase reads both and writes only from the second.
 *
 * ## Why the cell geometry lives on the SERIES and not per year
 * The grid does not move between years — same product, same version, same axes — so a province's
 * cell index and centre coordinate are properties of the province, not of the year. Recording
 * them once makes "did the grid shift under us?" a single comparison instead of 27, and keeps the
 * artifact from carrying 2 187 copies of the same three numbers.
 */

/**
 * The two committed artifact file names.
 *
 * They live HERE, beside the shapes, rather than in `acag-fetch.ts`, so the offline `load` phase
 * can name the files it reads without importing the module that owns the network. The two-phase
 * rule is about what a phase CAN do, not only about what it does today.
 */
export const ACAG_MANIFEST_FILE_NAME = 'acag-manifest.json';
export const ACAG_SERIES_FILE_NAME = 'acag-province-pm25.json';

/** Schema version of both artifacts. Bumping it is a breaking change to the load phase. */
export const ACAG_ARTIFACT_SCHEMA_VERSION = 1;

/** One downloaded (or locally supplied) annual file. */
export interface AcagFileRecord {
  /** The data year, as published in the file name (`…202401-202412.nc` → 2024). */
  year: number;
  /** S3 object key, so the exact object can be re-fetched byte-for-byte. */
  objectKey: string;
  /** Full URL the fetch used (empty on `--from-dir`, where nothing was downloaded). */
  url: string;
  fileName: string;
  bytes: number;
  /** SHA-256 of the raw `.nc`, computed from the bytes on disk — the ledger's AÇIK 3 entry. */
  sha256: string;
  /**
   * The file's OWN `TIMECOVERAGE` attribute where the decoder can read it, else `null`.
   *
   * The ledger's AÇIK 2 requires the published year range to be verified against the FILE rather
   * than the provider's page (which contradicts itself). The file name carries the year too, and
   * the two are cross-checked; `null` means the attribute was unreadable, never that it was
   * assumed to match.
   */
  timeCoverageAttribute: string | null;
  downloadMs: number;
  decodeMs: number;
  /** Whether the raw file was deleted after extraction (peak-disk discipline). */
  rawDeleted: boolean;
}

/** The hyperslab window the run read, recorded so a reviewer can re-cut the same rectangle. */
export interface AcagWindowRecord {
  /** Full-array geometry of the source variable. */
  fullLatitudeLength: number;
  fullLongitudeLength: number;
  /** Window position in the full array. */
  rowOffset: number;
  columnOffset: number;
  rowCount: number;
  columnCount: number;
  /** Derived axis facts — step comes from the axis, never from a provider attribute. */
  latitudeStep: number;
  longitudeStep: number;
  latitudeFirst: number;
  latitudeLast: number;
  longitudeFirst: number;
  longitudeLast: number;
}

export interface AcagAssertionResult {
  id: string;
  passed: boolean;
  detail: string;
}

export interface AcagManifest {
  schemaVersion: typeof ACAG_ARTIFACT_SCHEMA_VERSION;
  generatedAtUtc: string;
  /** How the raw bytes were obtained: a real download, or local files already on disk. */
  sourceMode: 'download' | 'from-dir';
  userAgent: string;
  /** `V6.GL.03` — pinned by DEC 2026-08-19f; a mixed-version artifact is refused at load. */
  datasetVersion: string;
  datasetUrl: string;
  licenceName: string;
  licenceUrl: string;
  bucketBaseUrl: string;
  decoder: AcagDecoderIdentity;
  window: AcagWindowRecord;
  files: AcagFileRecord[];
  /**
   * SHA-256 of the series artifact as written, so the load phase can prove the file it is about
   * to publish is the one the fetch produced. A hand-edited series file satisfies every
   * structural invariant in this repo and is exactly the "plausible but wrong" class ENGINEERING
   * §5's fidelity rule names.
   */
  seriesSha256: string;
  assertions: AcagAssertionResult[];
}

/** One year's published value for one province. */
export interface AcagAnnualValue {
  year: number;
  /** Annual mean PM2.5, µg/m³. A raw number — formatting is the web repo's concern. */
  valueUgM3: number;
}

/**
 * One province's cell + its full series.
 *
 * `requestedLatitude`/`requestedLongitude` are the province-centre coordinates the extraction was
 * run against. They are stored so the load phase can prove they still equal the database's own
 * `provinces.latitude/longitude` — this line's fidelity rule (assertion `A-03`). Without it, a
 * seed correction to a province centre would leave a published value silently attached to the old
 * point, which no range or ordering invariant can detect.
 */
export interface AcagProvinceRecord {
  plateCode: string;
  requestedLatitude: number;
  requestedLongitude: number;
  /** Indices into the FULL array (window offset already added) — provenance, not arithmetic. */
  latitudeIndex: number;
  longitudeIndex: number;
  cellLatitude: number;
  cellLongitude: number;
  cellDistanceKm: number;
  values: AcagAnnualValue[];
}

export interface AcagSeriesArtifact {
  schemaVersion: typeof ACAG_ARTIFACT_SCHEMA_VERSION;
  datasetVersion: string;
  /** Fixed by the provider: "Annual and monthly mean PM₂.₅ [µg/m3]". */
  unit: string;
  /** Grid cell size in degrees, derived from the file's axes. */
  gridCellSizeDeg: number;
  /** Every year present, ascending — the closed expectation the load phase checks against. */
  years: number[];
  provinces: AcagProvinceRecord[];
}
