import type { ClimateNormals, ClimateSource } from '../../province/province.types';
import type { MgmRawMetricRow, MgmRawRecordCell, MgmValueAnomaly } from './mgm-parser';

/**
 * The two committed artifacts that the `fetch` phase writes and the `load` phase reads.
 *
 * **Why two files instead of one.** They are written together but they are read for
 * different reasons: `climate-normals.json` is the data we publish, `climate-manifest.json`
 * is the provenance and the raw source strings. Keeping them separate means the load phase
 * can CROSS-CHECK one against the other (same provinces, same periods, same values re-printed
 * from the raw cells) rather than trusting a single self-consistent blob. A file cannot
 * corroborate itself.
 *
 * **Why the phase split at all** (PLAN.md §1): `fetch` touches the network and is run by
 * hand, roughly yearly; `load` is offline, deterministic and idempotent, and is the only
 * phase CI ever sees. Nothing in CI can depend on MGM being up.
 *
 * Both files, plus the per-province table fragments, are committed and reviewed like any
 * other data PR (~0.5 MB). The full 29 MB of raw HTML is NOT committed — the fragments plus
 * a sha256 per page are the audit trail.
 */

/** One province's published series. */
export interface ClimateNormalsEntry {
  /** Zero-padded plaka code — the join key against `provinces.plate_code`. */
  plateCode: string;
  normals: ClimateNormals;
}

/** `climate-normals.json` — the ONLY input to the load phase's writes. */
export interface ClimateNormalsArtifact {
  /** ISO-8601 UTC instant the fetch run completed. */
  generatedAtUtc: string;
  source: ClimateSource;
  entries: ClimateNormalsEntry[];
}

/** One province's provenance record + the raw cell strings, verbatim. */
export interface ClimateManifestEntry {
  plateCode: string;
  /** MGM's URL key, e.g. `ICEL`. */
  mgmKey: string;
  /** The province name MGM itself printed for that key — the audit trail for the mapping. */
  mgmNameTr: string;
  url: string;
  /** ISO-8601 UTC instant this page was fetched. */
  fetchedAtUtc: string;
  httpStatus: number;
  /** sha256 of the full response body, so a future re-run can prove what changed. */
  pageSha256: string;
  /** The measurement period as parsed from THIS page (it differs per province — trap T2). */
  periodStartYear: number;
  periodEndYear: number;
  /** Raw, untouched source strings — the evidence the round-trip assertion checks against. */
  rawMetricRows: MgmRawMetricRow[];
  rawRecordCells: MgmRawRecordCell[];
}

/**
 * A source value we refused to publish because it is physically impossible.
 *
 * This is NOT an error channel — it is a provenance record. MGM occasionally publishes a value
 * that cannot exist (the 2026-07-18 harvest found exactly one across 81 provinces: Osmaniye's
 * `En Yüksek Kar` printed as `-1 cm` against a real date). The field is nulled, the rest of the
 * province's record is kept, and the discrepancy is written down here so that "we show no snow
 * record for Osmaniye" has a documented cause instead of looking like OUR bug.
 *
 * Lives in the MANIFEST rather than the normals artifact on purpose: it is evidence about the
 * source, and it carries the raw cell string, which is the manifest's whole job.
 */
export interface ClimateAnomaly {
  plateCode: string;
  /** MGM's own row/column heading, so the anomaly can be found on the page by eye. */
  sourceLabel: string;
  /**
   * The stored field that was nulled — the closed set of fields the parser is capable of
   * refusing, not a free-form string.
   *
   * The narrowing is a hint, not a guarantee: this object comes back through `JSON.parse`, so
   * its type is an assertion about a file. The enforcement is `assertDecimalRoundTrip`, which
   * re-verifies every declaration against the raw source cell it names before honouring it.
   */
  field: MgmValueAnomaly['field'];
  /** 1-12 for a monthly cell, `null` for a records-table cell. */
  month: number | null;
  /** MGM's cell text, verbatim and untouched — the evidence. */
  rawCell: string;
  reason: string;
}

/**
 * A province the run deliberately did NOT publish, because refusing an impossible source value
 * left its all-or-nothing core pair incomplete (PLAN §1).
 *
 * This is a supported outcome, not a crash. The alternative — which is what the code did before
 * — was that nulling a negative `precipitationMm` immediately tripped the core-pair veto and
 * aborted the whole ~70-minute, 81-province run, so a mechanism whose stated purpose is "the
 * value is dropped, the rest of the province is kept" instead cost us every province.
 *
 * Recording it here rather than simply omitting the province is the point: an absent province is
 * invisible, and the load phase's coverage check exists precisely to refuse silent gaps. A
 * DECLARED gap is auditable — the load phase clears that province's series on purpose and says
 * so, instead of leaving whatever was in the database from last year.
 */
export interface ClimateUnpublishableProvince {
  plateCode: string;
  /** `findUnpublishableReason`'s verdict, verbatim. */
  reason: string;
}

/** `climate-manifest.json` — provenance + raw strings. Never written to the database. */
export interface ClimateManifestArtifact {
  generatedAtUtc: string;
  source: ClimateSource;
  /** The user agent the fetch run identified itself with. */
  userAgent: string;
  /**
   * Impossible source values that were nulled. Expected to be EMPTY or very short; the fetch
   * phase aborts past a small threshold, because a pile of these means MGM's data broke rather
   * than that one cell is wrong.
   */
  anomalies: ClimateAnomaly[];
  /**
   * Provinces excluded from `climate-normals.json` on purpose. **Optional**, because artifacts
   * committed before this field existed do not carry it and re-writing them by hand would
   * falsify a provenance record to satisfy a schema. Absent and empty mean the same thing, and
   * every reader must treat them the same way.
   */
  unpublishable?: ClimateUnpublishableProvince[];
  entries: ClimateManifestEntry[];
}
