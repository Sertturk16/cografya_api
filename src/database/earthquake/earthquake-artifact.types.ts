/**
 * The shape of `data/earthquake/afad-probe.json` — the committed evidence of what AFAD's
 * `event/filter` endpoint actually returned on the day the leg was built.
 *
 * ## Why an artifact exists at all
 * The two-phase rule (`ENGINEERING.md` §5): the only thing allowed to touch the network is a
 * HAND-RUN probe, and what it produces is committed and reviewable. Everything else — the schema
 * test, CI, the reviewer — reads this file instead of the provider, so a build can never fail
 * because a public institution's endpoint is having a bad afternoon.
 *
 * ## What it is NOT
 * It is not a fixture the ingest reads, and it is not a fact source. No number in it is published
 * anywhere; the schema test asserts SHAPE against it (`CONVENTIONS.md` §2 keeps facts out of
 * assertions), and the sample rows exist so a human can see what the parser is being asked to
 * survive.
 */

export interface AfadProbeRequestRecord {
  /** What this call was measuring, in words. */
  readonly label: string;
  /** The exact URL, as sent. No credential exists on this endpoint — AFAD is anonymous. */
  readonly url: string;
  readonly requestedAtUtc: string;
  readonly httpStatus: number;
  readonly durationMs: number;
  /** Response headers worth keeping: caching posture, encoding, content type. */
  readonly headers: Readonly<Record<string, string | null>>;
  /** Decompressed body size in bytes. */
  readonly byteLength: number;
  /** SHA-256 of the decompressed body — the identity of the bytes this record describes. */
  readonly sha256: string;
  /** Row count when the body was a JSON array; `null` when it was not. */
  readonly recordCount: number | null;
  /** Every field name seen across the returned rows, sorted. */
  readonly fieldNames: readonly string[];
  /** Distinct `type` values seen, sorted — the magnitude-type vocabulary as it really arrives. */
  readonly magnitudeTypes: readonly string[];
  /** How many rows this leg's parser accepted / refused, and why they were refused. */
  readonly parsed: {
    readonly accepted: number;
    readonly rejected: number;
    readonly rejectionReasons: readonly string[];
  };
  /** At most two verbatim rows, as returned. Public seismic data; no personal data exists here. */
  readonly sampleRows: readonly unknown[];
}

export interface AfadProbeArtifact {
  readonly probeVersion: 1;
  readonly generatedAtUtc: string;
  /** The identifying User-Agent the probe sent — politeness is part of the evidence. */
  readonly userAgent: string;
  readonly nodeVersion: string;
  readonly baseUrl: string;
  /** Seconds waited between calls. Recorded so "polite by construction" is checkable, not claimed. */
  readonly spacingSeconds: number;
  readonly requests: readonly AfadProbeRequestRecord[];
}
