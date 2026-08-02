import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { CachedRead } from '../upstream/cache/upstream-cache.service';
import { OperationDeadline } from '../upstream/operation-deadline';
import type { EcmwfCompiledSeries } from './ecmwf/ecmwf-series-compile';
import { EcmwfSeriesReader, type EcmwfPointSeriesRead } from './ecmwf/ecmwf-series.reader';
import type { CmemsPointValue } from './cmems/cmems-response';
import { cmemsWaveSupport } from './cmems/cmems-routing';
import { CmemsValueReader } from './cmems/cmems-value.reader';
import {
  overviewDataAvailable,
  resolveSst,
  resolveWavePair,
  resolveWindPair,
  seriesSourceDiffersFromInstant,
  type MarineInstantValue,
} from './cmems/cmems-merge';
import type { MarineConditionsDto } from './dto/marine-conditions.dto';
import type { MarineOverviewDto } from './dto/marine-overview.dto';
import type { MarineOverviewPointDto } from './dto/marine-overview-point.dto';
import type { MarineProvinceConditionsDto } from './dto/marine-province-conditions.dto';
import type { MarineSeriesDto } from './dto/marine-series.dto';
import { MarinePoint } from './entities/marine-point.entity';
import { buildMarineAttributions } from './marine-attribution-catalogue';
import { withCacheAge } from './marine-cache-age.interceptor';
import { newestOkFetchedAt, oldestOkCacheAge } from './marine-read-reducers';
import { toMarinePointListItem } from './marine-point.mapper';
import { MARINE_UPSTREAM_CONFIG, type MarineUpstreamConfig } from './marine-upstream.config';
import { MarineSource } from './marine.types';

const logger = new Logger('MarineValues');

/** One point's resolved fields plus every cache read that contributed to them. */
interface ResolvedPoint {
  readonly point: MarinePoint;
  readonly fields: {
    readonly seaSurfaceTemperature: MarineInstantValue;
    readonly waveHeight: MarineInstantValue;
    readonly waveDirection: MarineInstantValue;
    readonly windSpeed10m: MarineInstantValue;
    readonly windDirection10m: MarineInstantValue;
  };
  readonly ecmwf: CachedRead<EcmwfPointSeriesRead>;
  readonly reads: readonly CachedRead<unknown>[];
}

/**
 * The three marine VALUE endpoints (M4b): the runtime behind the contract M1 froze.
 *
 * ## The cold rule, in one sentence (plan §4.1)
 * The batch endpoint (`overview`) never waits for upstream under any circumstance; the
 * single-point endpoints may refresh ONLY their own point's ≤3 CMEMS keys (≤6 for a two-sea
 * province), all under ONE shared `OperationDeadline`; the full sweep belongs to the warmup
 * tour alone.
 *
 * ## Best-effort-per-field on a cold single-point read (review #81 M5 — documented decision)
 * `CMEMS_SINGLE_CALL_TIMEOUT_MS` (6 000) equals `MARINE_UPSTREAM_DEADLINE_MS` (6 000), so one
 * pathological cold-TLS call CAN consume the whole shared budget and leave the point's other
 * CMEMS fields answering `unavailable`. That is the chosen trade-off, not an accident: raising
 * the operation deadline would make the worst-case page wait longer for every visitor, while
 * the degraded state (a) is field-honest, (b) lasts at most one warmup interval, and (c) is
 * bounded to the measured-rare cold-TLS case — the three keys are fired in parallel, so the
 * budget is shared by wall clock, not consumed serially.
 */
@Injectable()
export class MarineValuesService {
  constructor(
    @InjectRepository(MarinePoint)
    private readonly marinePointRepository: Repository<MarinePoint>,
    private readonly ecmwfReader: EcmwfSeriesReader,
    private readonly cmemsReader: CmemsValueReader,
    @Inject(MARINE_UPSTREAM_CONFIG)
    private readonly config: MarineUpstreamConfig,
  ) {}

  /**
   * `GET /api/marine/overview` — every point's instant values, CMEMS side by PEEK only.
   *
   * The ECMWF side goes through `readSeries`, whose refresh is a Postgres compile and can
   * never reach the network (its e2e counts the calls); the CMEMS side uses `peek`, which
   * cannot refresh by construction (U-1). So this endpoint makes ZERO upstream calls on every
   * branch, cold included — the locked COLD-BEHAVIOR row.
   *
   * `attributions` carries BOTH licence rows from M5 on, cold responses included — see
   * `buildMarineAttributions`.
   */
  async getOverview(): Promise<MarineOverviewDto> {
    const points = await this.marinePointRepository.find({ order: { displayOrder: 'ASC' } });
    if (points.length === 0) {
      this.refuseEmptyImport('overview');
    }

    const nowMs = Date.now();
    const resolved = await Promise.all(
      points.map((point) => this.resolvePoint(point, nowMs, null)),
    );

    const overviewPoints: MarineOverviewPointDto[] = resolved.map((entry) => ({
      point: toMarinePointListItem(entry.point),
      ...entry.fields,
    }));

    const allReads = resolved.flatMap((entry) => entry.reads);
    const dataAvailable = overviewDataAvailable(
      resolved.map((entry) => Object.values(entry.fields)),
    );

    const dto: MarineOverviewDto = {
      points: overviewPoints,
      // DATA-derived, not the wall clock (delta d5): the moment the freshest contributing
      // value entered the cache. A per-request `now()` would change the body on every request
      // and defeat the weak ETag the ISR revalidation depends on (`marine-cache-age.interceptor`
      // promises body fields change only when the data does). Cold fallback: the wall clock —
      // that response is `no-store`, so its instability caches nowhere.
      generatedAtUtc: newestOkFetchedAt(allReads) ?? new Date(nowMs).toISOString(),
      dataAvailable,
      attributions: buildMarineAttributions(ecmwfDataYear(resolved)),
    };
    return withCacheAge(dto, oldestOkCacheAge(allReads));
  }

  /** `GET /api/marine/points/{slug}/conditions` — one point, instant values + the 5-day series. */
  async getConditions(slug: string): Promise<MarineConditionsDto> {
    const point = await this.marinePointRepository.findOne({
      // TR OR EN — both unique-indexed; the web's localized routing sends either.
      where: [{ slugTr: slug }, { slugEn: slug }],
    });
    if (point === null) {
      await this.refuseWhenImportNeverRan(`conditions:${slug}`);
      throw new NotFoundException();
    }

    const deadline = new OperationDeadline(this.config.requestDeadlineMs);
    const resolved = await this.resolvePoint(point, Date.now(), deadline);
    const dto = this.toConditionsDto(resolved);
    return withCacheAge(dto, oldestOkCacheAge(resolved.reads));
  }

  /** `GET /api/marine/provinces/{plateCode}/conditions` — 1–2 points, ONE shared deadline. */
  async getProvinceConditions(plateCode: string): Promise<MarineProvinceConditionsDto> {
    const points = await this.marinePointRepository.find({
      where: { provincePlateCode: plateCode },
      order: { displayOrder: 'ASC' },
    });
    if (points.length === 0) {
      await this.refuseWhenImportNeverRan(`provinces:${plateCode}`);
      // A well-formed plate with no marine point is an INLAND province: an honest 404 (§7.9),
      // exactly like an unknown slug — the resource "sea conditions of Ankara" does not exist.
      throw new NotFoundException();
    }

    // ONE deadline across both points (İstanbul: ≤6 CMEMS keys) — §6.4's whole purpose.
    const deadline = new OperationDeadline(this.config.requestDeadlineMs);
    const nowMs = Date.now();
    const resolved = await Promise.all(
      points.map((point) => this.resolvePoint(point, nowMs, deadline)),
    );

    const dto: MarineProvinceConditionsDto = {
      plateCode,
      // Each point resolved independently: the two-sea provinces' rows legitimately disagree
      // and are never averaged, suppressed together, or filled from each other.
      marinePoints: resolved.map((entry) => this.toConditionsDto(entry)),
      attributions: buildMarineAttributions(ecmwfDataYear(resolved)),
    };
    return withCacheAge(dto, oldestOkCacheAge(resolved.flatMap((entry) => entry.reads)));
  }

  /**
   * Resolve one point's five fields. `deadline === null` selects the PEEK path (overview);
   * a real deadline selects the inline read-through path (conditions/provinces).
   */
  private async resolvePoint(
    point: MarinePoint,
    nowMs: number,
    deadline: OperationDeadline | null,
  ): Promise<ResolvedPoint> {
    const support = cmemsWaveSupport(point.seaBasin);

    // ECMWF first argument-wise but awaited together: the reads are independent, and the CMEMS
    // trio shares the caller's single deadline by wall clock rather than serially.
    const [ecmwf, sstRead, heightRead, directionRead] = await Promise.all([
      this.ecmwfReader.readSeries(point, deadline ?? undefined),
      deadline === null
        ? this.cmemsReader.peekValue(point, 'seaSurfaceTemperature')
        : this.cmemsReader.readValue(point, 'seaSurfaceTemperature', deadline),
      this.readWaveHalf(point, 'waveHeight', support, deadline),
      this.readWaveHalf(point, 'waveDirection', support, deadline),
    ]);

    const wave = resolveWavePair({
      cmemsSupport: support,
      cmemsHeight: heightRead,
      cmemsDirection: directionRead,
      ecmwf,
      nowMs,
    });
    const wind = resolveWindPair(ecmwf, nowMs);

    const reads: CachedRead<unknown>[] = [ecmwf, sstRead];
    if (heightRead !== null) reads.push(heightRead);
    if (directionRead !== null) reads.push(directionRead);

    return {
      point,
      fields: {
        seaSurfaceTemperature: resolveSst(sstRead),
        waveHeight: wave.waveHeight,
        waveDirection: wave.waveDirection,
        windSpeed10m: wind.windSpeed10m,
        windDirection10m: wind.windDirection10m,
      },
      ecmwf,
      reads,
    };
  }

  /** A wave half: `null` (no read, NO CALL) where CMEMS does not carry waves — the Marmara. */
  private readWaveHalf(
    point: MarinePoint,
    field: 'waveHeight' | 'waveDirection',
    support: 'supported' | 'not_supported',
    deadline: OperationDeadline | null,
  ): Promise<CachedRead<CmemsPointValue> | null> {
    if (support === 'not_supported') return Promise.resolve(null);
    return deadline === null
      ? this.cmemsReader.peekValue(point, field)
      : this.cmemsReader.readValue(point, field, deadline);
  }

  private toConditionsDto(resolved: ResolvedPoint): MarineConditionsDto {
    const series = resolved.ecmwf.value === null ? null : toSeriesDto(resolved.ecmwf.value.series);
    return {
      point: toMarinePointListItem(resolved.point),
      ...resolved.fields,
      series,
      seriesSourceDiffersFromInstant: seriesSourceDiffersFromInstant(
        series === null ? null : MarineSource.Ecmwf,
        Object.values(resolved.fields),
      ),
    };
  }

  /**
   * An empty `marine_points` table is a BROKEN DEPLOYMENT, not an outage — the import never
   * ran. Same reasoning (and same loud log) as `MarineService.findAllPoints`: a 200 here would
   * publish an empty, indexable /deniz surface. Checked only on the miss path, so the healthy
   * case pays nothing.
   */
  private async refuseWhenImportNeverRan(context: string): Promise<void> {
    const total = await this.marinePointRepository.count();
    if (total === 0) this.refuseEmptyImport(context);
  }

  private refuseEmptyImport(context: string): never {
    logger.error(
      `marine_points is EMPTY (${context}) — the import never ran on this database. Run ` +
        '`pnpm db:import:marine-points --phase=load`. Refusing to serve: a broken deploy must ' +
        'not publish (and get indexed as) an empty marine surface.',
    );
    throw new InternalServerErrorException();
  }
}

/**
 * The `[year]` ECMWF's required copyright line states, taken from THIS response's own data.
 *
 * ## Why the response's own reading and not `/layers`' catalogue cycle (M5 plan §4, ruling S3)
 * NOVA §5 fixes the semantics: the year is the year the DATA belongs to, i.e. the model run's
 * year, not the wall clock's. Every resolved point already holds its ECMWF read, so the answer
 * costs ZERO extra queries — deriving it from the layer catalogue instead would add a Postgres
 * round trip to two hot public endpoints for a value that is identical 364 days out of 365.
 *
 * The accepted cost, documented rather than hidden: for a few hours around a New Year boundary
 * `/overview` and `/layers` can state different years, because they read different cycles. Both
 * are legally sound — each states the year of a run that really was published — so the
 * divergence is cosmetic, and the alternative (one shared query on every request) buys nothing.
 *
 * `null` when this response publishes no ECMWF reading at all: `buildEcmwfRequiredNotice` then
 * OMITS the copyright line rather than inventing a year.
 *
 * Only `kind === 'ok'` reads count, matching `marine-read-reducers`: a negative entry describes
 * a failure, not a published cycle, and its year would attribute data we are not serving.
 */
function ecmwfDataYear(resolved: readonly ResolvedPoint[]): number | null {
  let newestRunMs: number | null = null;
  for (const entry of resolved) {
    if (entry.ecmwf.kind !== 'ok' || entry.ecmwf.value === null) continue;
    const runMs = Date.parse(entry.ecmwf.value.series.modelRunAtUtc);
    if (Number.isNaN(runMs)) continue;
    if (newestRunMs === null || runMs > newestRunMs) newestRunMs = runMs;
  }
  return newestRunMs === null ? null : new Date(newestRunMs).getUTCFullYear();
}

/** `EcmwfCompiledSeries` → the frozen series contract (drop the read-side-only members). */
function toSeriesDto(series: EcmwfCompiledSeries): MarineSeriesDto {
  return {
    stepHours: series.stepHours,
    timesUtc: series.timesUtc,
    seaSurfaceTemperature: series.seaSurfaceTemperature,
    waveHeight: series.waveHeight,
    waveDirection: series.waveDirection,
    windSpeed10m: series.windSpeed10m,
    windDirection10m: series.windDirection10m,
    source: series.source,
    modelRunAtUtc: series.modelRunAtUtc,
    horizonEndUtc: series.horizonEndUtc,
  };
}
