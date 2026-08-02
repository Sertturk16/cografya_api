import { Column, Entity, PrimaryColumn, type ValueTransformer } from 'typeorm';
import type { AirQualityPollutant } from '../air-quality.types';
import type { AdsRequestBody } from '../cams/ads-jobs';

/**
 * Postgres `bigint` comes back from the driver as a string. Byte counts here top out around
 * 64 MiB per download and ~32 MiB per run, far inside `Number.MAX_SAFE_INTEGER`.
 */
const bigintTransformer: ValueTransformer = {
  to: (value: number | null | undefined): string | null =>
    value === null || value === undefined ? null : String(value),
  from: (value: string | null | undefined): number | null =>
    value === null || value === undefined ? null : Number(value),
};

/** Our own job vocabulary — one ladder, walked independently by each of the day's two jobs. */
export type AdsJobState =
  /** Created, nothing asked of the provider yet. */
  | 'pending'
  /** `costing` said the shape is affordable. */
  | 'costed'
  /** Written BEFORE the submit POST leaves. The state that makes re-submitting unnecessary. */
  | 'submitting'
  | 'submitted'
  | 'running'
  /** The provider says the result exists; we have not asked where yet. */
  | 'downloadable'
  /** `results` gave an href that passed every pre-download guard. */
  | 'ready'
  /** Decoded and written to Postgres in one transaction. */
  | 'stored'
  /** OUR refusal: `cost > limit`. Terminal — the provider itself answered HTTP 200. */
  | 'refused'
  /** The PROVIDER's terminal refusal, or a licence 403. Never retried. */
  | 'rejected'
  /** Transient failure; retried until `AIR_QUALITY_MAX_ATTEMPTS_PER_JOB` is spent. */
  | 'failed';

/** Which CAMS product a job asks for. Also the decoder's `expectedProduct`. */
export type AdsJobKind = 'forecast' | 'analysis';

/**
 * One ADS job, as stored inside `air_quality_runs.ads_requests`.
 *
 * The queue stamps live HERE rather than in their own columns (plan SAPMA 1): with two jobs a
 * day, a single `ads_queue_stamps` column cannot say which job it describes, and it would
 * contradict this array on every run. Same reasoning for `cleanupAt` (SAPMA 5) and `attempts`
 * (SAPMA 6) — both are per job, and a run-level counter would let a failing analysis spend the
 * forecast's retry budget.
 */
export interface AdsJobRecord {
  readonly kind: AdsJobKind;
  /** `YYYY-MM-DD`. The forecast asks for D; the analysis asks for D−1, always. */
  readonly requestDate: string;
  /** The body we submitted, kept as evidence of exactly what this run asked the provider for. */
  readonly requestBody: AdsRequestBody;
  readonly state: AdsJobState;
  readonly jobId: string | null;
  /** Attempts spent on THIS job against `AIR_QUALITY_MAX_ATTEMPTS_PER_JOB`. */
  readonly attempts: number;
  /** When WE wrote `submitting` — the lower bound of the reconciliation time window. */
  readonly submittedAt: string | null;
  /** The provider's own queue stamps, verbatim: the real queue-length evidence stream. */
  readonly adsCreated: string | null;
  readonly adsStarted: string | null;
  readonly adsFinished: string | null;
  /** When the politeness `DELETE` succeeded. */
  readonly cleanupAt: string | null;
  /**
   * The result asset, once `results` has answered AND every pre-download guard has passed
   * (https, allowlisted host, declared size under the ceiling, 32-hex checksum).
   *
   * Carried on the record so the download step needs no second `results` call: one ADS call per
   * tour is a rule, not an aspiration. It also means a process restart between the two steps
   * resumes at the download rather than re-asking the provider.
   */
  readonly result: {
    readonly href: string;
    readonly sizeBytes: number;
    readonly checksum: string;
  } | null;
  /** REDACTED before it is written (`redactAdsSecret`). */
  readonly lastError: string | null;
}

/**
 * Run-level rollup, DERIVED from the two jobs and written in the same transaction.
 *
 * `serviceable` and `degraded` both publish; the difference is whether the fixed-24-hours
 * promise was kept. Collapsing them would be cheaper by one string and would cost the only
 * signal that says "we published a shorter series ON PURPOSE and made noise about it".
 */
export type AirQualityRunState =
  /** No job has written rows yet. Not servable. */
  | 'pending'
  /** The forecast is stored; the analysis is not (yet). Servable, `analysisEndUtc` null. */
  | 'serviceable'
  /** Both products stored. The full promise. */
  | 'complete'
  /** Forecast stored, analysis terminally failed. Servable, LOUD, `analysisEndUtc` null. */
  | 'degraded'
  /** The FORECAST failed terminally. Not servable — the previous run keeps serving. */
  | 'abandoned';

/** How a run's last failure should be READ — the diagnosis, not the behaviour (plan §10-D3). */
export type AirQualityErrorClass =
  /** A pinned guard refused the provider's bytes: a provider-contract record. */
  | 'contract'
  /** The decode WRAPPER raised: our bug, not the provider's drift. Fix the decoder. */
  | 'decoder_bug'
  /** The provider or the network failed. */
  | 'upstream'
  /** WE refused: `cost > limit`, a byte ceiling, an off-allowlist host. */
  | 'refused';

/**
 * One CAMS model run and the ingest's progress through its TWO jobs.
 *
 * ## Why forecast values are persisted at all
 * Same economics as the marine ECMWF store: reproducing one run costs ~32 MiB of provider
 * downloads that are only available for ~1.5–2 days, and the Redis retention window is shorter
 * than the provider's daily cadence. Keeping the only copy in an evictable cache would make a
 * `FLUSHALL` a data-loss event. Growth is bounded by construction: 3 runs retained, ~1.2 MB.
 *
 * ## What is NOT here, and why
 * `first_step_utc` / `last_step_utc` / `first_step_valid_at` are absent (SAPMA 2): all three
 * derive from `run_utc ± analysis_hours/forecast_hours`, and the decoder already pins the
 * `hour === index` ladder they would restate. A second copy of one fact is this repo's known
 * drift class. `analysis_end_utc` is absent for the same reason — the contract field is
 * `analysis_hours > 0 ? run_utc : null`, computed at read time.
 */
@Entity('air_quality_runs')
export class AirQualityRun {
  /** The CAMS run base time (D 00:00 UTC). Natural key — one row per run. */
  @PrimaryColumn({ name: 'run_utc', type: 'timestamptz' })
  runUtc!: Date;

  @Column({ name: 'state', type: 'text' })
  state!: AirQualityRunState;

  /**
   * The horizon THIS run was ingested against (`AIR_QUALITY_FORECAST_HOURS` at ingest time).
   * Stored per run (SAPMA 3, the marine `forecastHours` precedent) so the
   * `length === forecast_hours + 1` invariant stays checkable per ROW after an operator
   * changes the env, instead of every historical row silently becoming "partial".
   */
  @Column({ name: 'forecast_hours', type: 'smallint' })
  forecastHours!: number;

  /**
   * Analysis steps stored for this run: `0` means "no analysis product", `24` means one full
   * day of history (SAPMA 7). The published series base (`run_utc − analysis_hours`) and the
   * contract's `analysisEndUtc` are both DERIVED from it, so the machine-readable "there is no
   * past half" state needs no second column.
   */
  @Column({ name: 'analysis_hours', type: 'smallint', default: 0 })
  analysisHours!: number;

  /** The day's jobs — forecast first, analysis second when enabled. */
  @Column({ name: 'ads_requests', type: 'jsonb' })
  adsRequests!: AdsJobRecord[];

  @Column({ name: 'dataset_id', type: 'text' })
  datasetId!: string;

  /** REDACTED before write. Never carries key material. */
  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  /** Separates "fix the decoder" from "record the provider's drift" (plan §10-D3). */
  @Column({ name: 'last_error_class', type: 'text', nullable: true })
  lastErrorClass!: AirQualityErrorClass | null;

  /** Bytes downloaded across BOTH jobs of this run. */
  @Column({
    name: 'bytes_downloaded',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  bytesDownloaded!: number | null;

  /** Two-layer format evidence, e.g. `zip(stored)+netcdf3-classic`. */
  @Column({ name: 'file_format', type: 'text', nullable: true })
  fileFormat!: string | null;

  /** Decoder identity that produced the stored values (`netcdf3-ts@4`). Evidence. */
  @Column({ name: 'decoder_version', type: 'text', nullable: true })
  decoderVersion!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  /** Set when the FORECAST rows landed — the moment this run became servable. */
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}

/** The jsonb payload of the series rows: raw µg/m³ per pollutant, index-aligned to the hours. */
export type AirQualityStoredConcentrations = Record<AirQualityPollutant, (number | null)[]>;

/** The jsonb payload of `support`: the structural `ok` / `not_supported` verdict per pollutant. */
export type AirQualityStoredSupport = Record<AirQualityPollutant, 'ok' | 'not_supported'>;
