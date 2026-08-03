import { Controller, Get, Param, Res, UseInterceptors } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CacheControl } from '../common/http-cache/cache-control.decorator';
import { AIR_QUALITY_INDEX_SYSTEM } from './air-quality-index-system.catalogue';
import { AirQualityCacheAgeInterceptor } from './air-quality-cache-age.interceptor';
import { AirQualityReadService } from './air-quality-read.service';
import { AirQualityStatus } from './air-quality.types';
import { AirQualityAttributionDto } from './dto/air-quality-attribution.dto';
import { AirQualityIndexDto } from './dto/air-quality-index.dto';
import { AirQualityIndexSystemDto } from './dto/air-quality-index-system.dto';
import { AirQualityPollutantValueDto } from './dto/air-quality-pollutant-value.dto';
import { AirQualityProvincePlateParams } from './dto/air-quality-params.dto';
import { AirQualityProvinceDto } from './dto/air-quality-province.dto';
import { AirQualityProvinceListItemDto } from './dto/air-quality-province-list-item.dto';
import { AirQualitySeriesDto } from './dto/air-quality-series.dto';

/**
 * `Cache-Control` of the two province endpoints (SPEC §11.1, verbatim). Applied BY HAND because
 * the cold state must answer `no-store` instead — see the handlers.
 */
const VALUE_CACHE_CONTROL = 'public, max-age=600, s-maxage=1800, stale-while-revalidate=3600';

/**
 * Public, read-only air-quality endpoints.
 *
 * No auth guard: public content by design, like `ProvinceController` and `MarineController`.
 * The global `ThrottlerGuard` applies.
 *
 * ## Why `@ApiExtraModels` lists types no route returns directly
 * A1 was the CONTRACT PR: registering the province/series/attribution DTOs here put them into
 * `openapi/openapi.json` before the endpoints existed, so the web repo could codegen the complete
 * type set and build against a mock. A2b — here — adds the two paths, and the contract delta is
 * therefore ADDITIVE ONLY. The nested DTOs stay registered because several of them are still only
 * reachable through a `$ref` chain. Any change to a frozen DTO is a BREAKING contract change and
 * goes to Atlas.
 *
 * ## COLD-BEHAVIOR (SPEC §10, binding)
 * Every endpoint here answers **200 in every state** — cold, warm, provider down, run-age ceiling
 * breached. `index-system` serves an in-code constant; the two province endpoints serve honest
 * `unavailable` values out of the local store. **No endpoint in this module ever calls ADS on a
 * request path**, and the e2e proves it with a counting `fetch` spy. The single 404 is a plate
 * code that names no province.
 *
 * ## `AIR_QUALITY_ENABLED` does not gate these routes
 * The kill switch governs the INGEST half only. The endpoints stay registered and degrade
 * honestly, which is why the go-live rider matters: the web air-quality page must not ship while
 * the flag is off, exactly as `/deniz` must not ship while `MARINE_ENABLED` is off (Atlas ruling
 * Q5, the W2a class).
 */
@ApiTags('air-quality')
@ApiExtraModels(
  AirQualityIndexDto,
  AirQualityPollutantValueDto,
  AirQualitySeriesDto,
  AirQualityProvinceDto,
  AirQualityProvinceListItemDto,
  AirQualityAttributionDto,
)
@Controller('air-quality')
// Publishes `X-Air-Quality-Cache-Age` for any handler whose body carries one. Bound here rather
// than globally: only air-quality payloads have an air-quality cache age, and `index-system`
// attaches none (a constant has no cache behind it), so it passes through untouched.
@UseInterceptors(AirQualityCacheAgeInterceptor)
export class AirQualityController {
  constructor(private readonly readService: AirQualityReadService) {}

  /**
   * Cache-Control per SPEC §11.1: the payload changes only when the index methodology is
   * revised (a code change), so it is the most static surface this leg has — long shared
   * cache + a week of stale-while-revalidate.
   */
  @Get('index-system')
  @CacheControl('public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800')
  @ApiOperation({
    summary: 'Full machine-readable definition of the active air-quality index system.',
    description:
      'The published methodology behind every band/category this API serves: the EAQI-2024 ' +
      'band table (EEA/ETC HE 2024/17, Table 5.2), the (lo, hi] boundary rule as a token, ' +
      'per-pollutant averaging periods (all hourly) and the dominant-pollutant tie-break ' +
      'order. The web repo renders from THIS payload and hardcodes none of it. Served from ' +
      'an in-code constant: answers 200 cold or warm and never calls the upstream provider.',
  })
  @ApiOkResponse({ type: AirQualityIndexSystemDto })
  getIndexSystem(): AirQualityIndexSystemDto {
    return AIR_QUALITY_INDEX_SYSTEM;
  }

  /**
   * The 81-province hub payload.
   *
   * ## `Cache-Control` is set BY HAND here, not with `@CacheControl`
   * The cold state must answer `no-store` — an empty payload cached by a CDN would republish the
   * cold window for the whole `s-maxage` — and the global `CacheControlInterceptor`'s tap runs
   * AFTER this handler, so a decorated value would overwrite the override. Setting it in the
   * handler keeps the §11.1 string on the success path and still leaves 5xx responses
   * header-free, because a throw skips the assignment exactly as it skips the interceptor tap.
   * This is the merged M4b `getOverview` precedent, adopted over the A2 plan's "one interceptor
   * writes both headers" sketch: a cache age is an observation derived from the body, while
   * `Cache-Control` is a decision of the handler — two responsibilities, two mechanisms.
   *
   * The threshold is "the run REACHED at least one province" — `status !== unavailable`, so a
   * `no_data` item counts (Atlas ruling Q7 as restated, DEC 2026-08-03a §1; the reasoning lives
   * on `AirQualityReadService.hubHasData`). The stricter "all 81 must" was rejected: one skipped
   * corrupt row would then keep the entire hub uncacheable.
   */
  @Get('provinces')
  @ApiOperation({
    summary: 'Instant air-quality state of every province (the /hava hub payload).',
    description:
      'Plain array, bounded and small — one entry per province, in plate order, ALWAYS. On the ' +
      'cold path every entry carries status=unavailable and the response is Cache-Control: ' +
      'no-store, which ISR/SSG must not commit. This endpoint reads the local store only and ' +
      'NEVER waits for the provider. Band and category are TOKENS: the band table behind them ' +
      'is published at GET /api/air-quality/index-system and must not be hardcoded.',
  })
  @ApiOkResponse({ type: AirQualityProvinceListItemDto, isArray: true })
  async listProvinces(
    @Res({ passthrough: true }) response: Response,
  ): Promise<AirQualityProvinceListItemDto[]> {
    const items = await this.readService.listProvinces();
    response.setHeader(
      'Cache-Control',
      AirQualityReadService.hubHasData(items) ? VALUE_CACHE_CONTROL : 'no-store',
    );
    return items;
  }

  /** One province's full payload: the instant value plus the hourly analysis⊕forecast series. */
  @Get('provinces/:plateCode')
  @ApiOperation({
    summary: 'Full air-quality state and the hourly series for one province.',
    description:
      'Answers 200 in every state: with no usable run the payload carries ' +
      'current.status=unavailable, series=null, dataAvailable=false and Cache-Control: ' +
      'no-store. The series concatenates the provider ANALYSIS product (steps before ' +
      'analysisEndUtc) with the FORECAST product (from analysisEndUtc onward); both halves are ' +
      'model output on a ~0.1° grid, neither is a station reading. A plate code that names no ' +
      'province is a 404. This endpoint never waits for the provider.',
  })
  @ApiParam({
    name: 'plateCode',
    example: '06',
    description: 'Two-digit zero-padded province plate code.',
  })
  @ApiOkResponse({ type: AirQualityProvinceDto })
  @ApiNotFoundResponse({ description: 'No province carries this plate code.' })
  @ApiBadRequestResponse({ description: 'plateCode is not exactly two digits.' })
  async getProvince(
    @Param() params: AirQualityProvincePlateParams,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AirQualityProvinceDto> {
    const province = await this.readService.getProvince(params.plateCode);
    response.setHeader(
      'Cache-Control',
      province.current.status === AirQualityStatus.Unavailable ? 'no-store' : VALUE_CACHE_CONTROL,
    );
    return province;
  }
}
