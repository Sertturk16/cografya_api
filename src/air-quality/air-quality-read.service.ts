import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { CachedRead } from '../upstream/cache/upstream-cache.service';
import { OperationDeadline } from '../upstream/operation-deadline';
import { Province } from '../province/entities/province.entity';
import { AirQualityFreshness, AirQualityStatus } from './air-quality.types';
import { buildCamsAttribution } from './air-quality-attribution.constant';
import { withAirQualityCacheAge } from './air-quality-cache-age.interceptor';
import {
  buildIndexDto,
  buildSeriesDto,
  selectStepIndex,
  unavailableIndexDto,
  type CompiledProvinceSeries,
  type CompiledRun,
  type IndexProvenance,
  type NormalisationTally,
} from './air-quality-compile';
import { AIR_QUALITY_READ_DEADLINE_MS, AirQualitySeriesReader } from './air-quality-series.reader';
import type { AirQualityProvinceDto } from './dto/air-quality-province.dto';
import type { AirQualityProvinceListItemDto } from './dto/air-quality-province-list-item.dto';

/** Everything one request needs about the run it is publishing from. */
interface ResolvedRun {
  readonly read: CachedRead<CompiledRun>;
  readonly compiled: CompiledRun | null;
  readonly stepIndex: number | null;
  readonly byPlateCode: Map<string, CompiledProvinceSeries>;
  readonly provenance: IndexProvenance;
  /**
   * What `X-Air-Quality-Cache-Age` may state — `null` unless this read actually published data.
   *
   * Resolved ONCE here rather than at each call site (review #84 I1): a negative cache entry and a
   * suppressed run both carry a real `cacheAgeSeconds` describing the ENTRY, not any published
   * value, so an all-`unavailable` body could ship a plausible "data is 4 minutes old" header.
   * Marine ruled the identical class out at review #82 I5 (`marine-read-reducers.ts` — only
   * `kind === 'ok'` reads count); air-quality carries the guard from here on.
   */
  readonly cacheAgeSeconds: number | null;
}

/**
 * The cache layer's provider-neutral freshness label → this leg's published enum.
 *
 * The two vocabularies are deliberately separate types (`air-quality.types.ts` explains why the
 * status/freshness enums are copies rather than shared imports), so the translation is explicit
 * here instead of being a cast that would survive either side widening.
 */
function toAirQualityFreshness(freshness: 'fresh' | 'stale' | null): AirQualityFreshness | null {
  if (freshness === 'fresh') return AirQualityFreshness.Fresh;
  if (freshness === 'stale') return AirQualityFreshness.Stale;
  return null;
}

/**
 * The two public air-quality read endpoints (A2b).
 *
 * ## Province IDENTITY comes from Postgres, values come from the cache
 * The cached payload holds only the compiled run: merged arrays and their time axis. Slugs, names
 * and coordinates are read from `provinces` on every request and joined by plate code. That is
 * deliberate — a seed correction (a renamed slug, a fixed coordinate) takes effect immediately
 * instead of living on inside a cached payload for the retention window.
 *
 * ## Both endpoints answer 200 in EVERY state (SPEC §10, binding)
 * Cold, provider down, run-age ceiling breached, every row corrupt: the endpoints still answer,
 * with `status: unavailable` and `series: null`. A page that teaches geography must render and
 * say honestly that it has no number, rather than 404 or 500. The one exception is a plate code
 * that names no province — that resource genuinely does not exist, so it is a 404.
 *
 * ## Zero upstream calls, on every branch
 * The reader's refresh closure reads Postgres and nothing else. There is no code path from here to
 * an HTTP client; the e2e proves it with a counting `fetch` spy.
 */
@Injectable()
export class AirQualityReadService {
  constructor(
    @InjectRepository(Province)
    private readonly provinceRepository: Repository<Province>,
    private readonly reader: AirQualitySeriesReader,
  ) {}

  /**
   * `GET /api/air-quality/provinces` — the lean 81-province hub payload.
   *
   * Every province in the table is listed in plate order, whatever the run state: on the cold path
   * all of them carry `status: unavailable`. Suppressing provinces the run does not cover would
   * make the hub's row count depend on ingest health, and the hub is a navigation surface first.
   *
   * A plain typed array — no envelope, no pagination: a bounded, fixed, fully cacheable set
   * (ENGINEERING §2, and the shape A1 froze).
   */
  async listProvinces(): Promise<AirQualityProvinceListItemDto[]> {
    const [provinces, resolved] = await Promise.all([
      this.provinceRepository.find({
        select: { plateCode: true, slugTr: true, slugEn: true },
        order: { plateCode: 'ASC' },
      }),
      this.resolveRun(),
    ]);

    // ONE tally for the whole request — reported once below, so 81 provinces cannot become 81
    // log lines (review #84 I2).
    const tally: NormalisationTally = { count: 0 };
    const items: AirQualityProvinceListItemDto[] = provinces.map((province) => {
      const series = resolved.byPlateCode.get(province.plateCode);
      if (resolved.compiled === null || resolved.stepIndex === null || series === undefined) {
        return {
          plateCode: province.plateCode,
          slugTr: province.slugTr,
          slugEn: province.slugEn,
          band: null,
          category: null,
          dominantPollutant: null,
          status: AirQualityStatus.Unavailable,
          validAtUtc: null,
        };
      }
      const index = buildIndexDto({
        compiled: resolved.compiled,
        province: series,
        stepIndex: resolved.stepIndex,
        provenance: resolved.provenance,
        tally,
      });
      return {
        plateCode: province.plateCode,
        slugTr: province.slugTr,
        slugEn: province.slugEn,
        band: index.band,
        category: index.category,
        dominantPollutant: index.dominantPollutant,
        status: index.status,
        validAtUtc: index.validAtUtc,
      };
    });

    this.reportNormalisation(resolved, tally);
    // The array is the response body, so the symbol-keyed cache age rides on the array object.
    return withAirQualityCacheAge(items, resolved.cacheAgeSeconds);
  }

  /** `GET /api/air-quality/provinces/{plateCode}` — the full payload plus the hourly series. */
  async getProvince(plateCode: string): Promise<AirQualityProvinceDto> {
    const province = await this.provinceRepository.findOne({ where: { plateCode } });
    // A well-formed plate naming no province is a 404: the resource does not exist. (A malformed
    // one never reaches here — the `ValidationPipe` answers 400.)
    if (province === null) throw new NotFoundException();
    // Atlas ruling Q3: a province with no reference point is EXCLUDED from the detail endpoint
    // rather than served with fabricated coordinates. The DTO's `latitude`/`longitude` are
    // non-nullable, and publishing 0/0 — or any invented pair — would be a data-honesty breach on
    // a public page. It stays in the hub, where the lean DTO carries no coordinates at all.
    if (province.latitude === null || province.longitude === null) throw new NotFoundException();

    const resolved = await this.resolveRun();
    const series = resolved.byPlateCode.get(plateCode);
    const compiled = resolved.compiled;
    const stepIndex = resolved.stepIndex;
    // One guard for the whole publishable branch: no run, no step, or this province's row was
    // skipped by the shape guard — all three degrade the SAME honest way, and the other 80
    // provinces are unaffected.
    const publishable = compiled !== null && stepIndex !== null && series !== undefined;
    const tally: NormalisationTally = { count: 0 };

    const dto: AirQualityProvinceDto = {
      plateCode: province.plateCode,
      slugTr: province.slugTr,
      slugEn: province.slugEn,
      nameTr: province.nameTr,
      latitude: province.latitude,
      longitude: province.longitude,
      current: publishable
        ? buildIndexDto({
            compiled,
            province: series,
            stepIndex,
            provenance: resolved.provenance,
            tally,
          })
        : unavailableIndexDto(),
      series: publishable ? buildSeriesDto(compiled, series, tally) : null,
      // Always present, cold included: the licence notice attaches to the published section, not
      // to whether a value resolved (M5 / DEC 2026-08-02g §3). Cold uses the current UTC year
      // (plan Q8) — a response with no Copernicus material in it cannot misdescribe one.
      attribution: buildCamsAttribution(
        resolved.compiled === null
          ? new Date().getUTCFullYear()
          : new Date(resolved.compiled.runUtc).getUTCFullYear(),
      ),
      dataAvailable: publishable,
    };
    this.reportNormalisation(resolved, tally);
    return withAirQualityCacheAge(dto, resolved.cacheAgeSeconds);
  }

  /**
   * Hand one request's post-cache R2 tally to the reader, which owns the counter and the throttle.
   *
   * A no-op on the overwhelmingly common path (`count === 0`), and impossible to reach with no run
   * — with `compiled === null` nothing was built, so nothing could be substituted.
   */
  private reportNormalisation(resolved: ResolvedRun, tally: NormalisationTally): void {
    if (tally.count === 0 || resolved.compiled === null) return;
    this.reader.reportPostCacheNormalisation(tally.count, resolved.compiled.runUtc);
  }

  /**
   * `true` when a payload carries at least one publishable value — the `Cache-Control` switch.
   *
   * Atlas ruling Q7: `no-store` when NO item carries a value, the warm string as soon as one does.
   * The stricter reading ("every province must be present") was rejected — a single skipped
   * corrupt row would then stop the whole hub from being cached.
   */
  static hubHasData(items: readonly AirQualityProvinceListItemDto[]): boolean {
    return items.some((item) => item.status !== AirQualityStatus.Unavailable);
  }

  /** One cache read + the per-request step selection, shared by both endpoints. */
  private async resolveRun(): Promise<ResolvedRun> {
    const read = await this.reader.readRun(new OperationDeadline(AIR_QUALITY_READ_DEADLINE_MS));
    const compiled = read.value;
    // A stale-but-served entry is still `ok` (that is what the header is FOR); a negative,
    // suppressed or unusable read is not.
    const cacheAgeSeconds = read.kind === 'ok' ? read.cacheAgeSeconds : null;
    if (compiled === null) {
      return {
        read,
        compiled: null,
        stepIndex: null,
        byPlateCode: new Map(),
        provenance: { freshness: null, fetchedAtUtc: null, staleSinceUtc: null },
        cacheAgeSeconds,
      };
    }
    return {
      read,
      compiled,
      cacheAgeSeconds,
      // Selected HERE, after the cache, per request — never cached with the run. Caching the
      // chosen step would freeze the published instant for a whole TTL while the `validAt`
      // ceiling stayed blind to it.
      stepIndex: selectStepIndex(compiled.timesUtc, Date.now()),
      byPlateCode: new Map(compiled.provinces.map((province) => [province.plateCode, province])),
      provenance: {
        freshness: toAirQualityFreshness(read.freshness),
        fetchedAtUtc: read.fetchedAtUtc,
        staleSinceUtc: read.staleSinceUtc,
      },
    };
  }
}
