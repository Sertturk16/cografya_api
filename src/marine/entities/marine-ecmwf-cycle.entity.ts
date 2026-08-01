import { Column, Entity, PrimaryColumn, type ValueTransformer } from 'typeorm';

/**
 * Postgres `bigint` comes back from the driver as a string. Byte counts here top out around
 * 320 MB (the cycle cap), far inside `Number.MAX_SAFE_INTEGER`, so a plain number is honest.
 */
const bigintTransformer: ValueTransformer = {
  to: (value: number | null | undefined): string | null =>
    value === null || value === undefined ? null : String(value),
  from: (value: string | null | undefined): number | null =>
    value === null || value === undefined ? null : Number(value),
};

/**
 * One ECMWF model run (cycle) and the ingest's progress through it — yeni-M3 SPEC §9.1.
 *
 * ## Why forecast VALUES are now in Postgres when SPEC v1 §5.1 said "never"
 * That rule was written for the POINT-QUERY providers, where a stored value is a cache of a
 * cheap call. ECMWF is the opposite economics: reproducing this table's content costs a ~130 MB
 * re-download, a cycle accumulates over ~4 warmup tours (~1 h), and Redis retention is capped at
 * `max(ok TTL, staleMax)` — shorter than the provider's own 6-hourly cadence. Keeping the ONLY
 * copy of a slowly-assembled dataset in an evictable cache would make `FLUSHALL` a data-loss
 * event (SPEC §9.1, Tartış & Karar: "önbelleği depo yerine koymak"). Growth is bounded by
 * design: at most 3 cycles are retained (~120 KB total), pruned in the same tour that completes
 * a newer one.
 *
 * ## What this row is: the resumable-progress ledger, and evidence
 * `steps_done` is what lets a tour pick up a half-ingested cycle instead of re-downloading it,
 * and what makes re-ingesting an already-done step a no-op (idempotent progress, SPEC §4.2).
 * `packing_type` / `decoder_version` are EVIDENCE columns: a silent decoder or packing change
 * across cycles is exactly the class of drift DEC 2026-07-31d requires us to notice, and these
 * two columns are where the 48 h shadow run reads it from.
 */
@Entity('marine_ecmwf_cycles')
export class MarineEcmwfCycle {
  /** The model run this row describes: 00/06/12/18 UTC. Natural key — one row per cycle. */
  @PrimaryColumn({ name: 'cycle_utc', type: 'timestamptz' })
  cycleUtc!: Date;

  /**
   * Forecast steps fully ingested, in HOURS (0, 3, …). A step is listed only when BOTH streams'
   * parameters were decoded and every point row was written — a half-written step is absent,
   * never "mostly there".
   */
  @Column({ name: 'steps_done', type: 'smallint', array: true, default: '{}' })
  stepsDone!: number[];

  /** Step spacing, hours — 3 across the whole owner-ruled 120 h horizon. */
  @Column({ name: 'step_hours', type: 'smallint' })
  stepHours!: number;

  /**
   * The horizon THIS cycle was ingested against (env `ECMWF_FORECAST_HOURS` at ingest time).
   * Stored per cycle so completeness (`steps_done` covers 0…horizon) stays decidable even after
   * an operator changes the env, instead of every historical row silently becoming "partial".
   */
  @Column({ name: 'forecast_hours', type: 'smallint' })
  forecastHours!: number;

  /** Total bytes downloaded for this cycle so far — what the cycle byte cap is enforced against. */
  @Column({ name: 'bytes_downloaded', type: 'bigint', transformer: bigintTransformer })
  bytesDownloaded!: number;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  /** Set when `steps_done` covers the full horizon; null while the cycle is partial. */
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  /** GRIB packing observed on this cycle's messages (`grid_ccsds`, template 5.42). Evidence. */
  @Column({ name: 'packing_type', type: 'text' })
  packingType!: string;

  /** Decoder package version that produced the stored values. Evidence. */
  @Column({ name: 'decoder_version', type: 'text' })
  decoderVersion!: string;
}
