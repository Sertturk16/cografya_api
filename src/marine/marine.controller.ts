import { Controller, Get, Param, Res, UseGuards, UseInterceptors } from '@nestjs/common';
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
import { MarineCacheAgeInterceptor } from './marine-cache-age.interceptor';
import { MarineConditionsDto } from './dto/marine-conditions.dto';
import { MarineLayerDto } from './dto/marine-layer.dto';
import { MarineOverviewDto } from './dto/marine-overview.dto';
import { MarineOverviewPointDto } from './dto/marine-overview-point.dto';
import { MarinePointListItemDto } from './dto/marine-point-list-item.dto';
import { MarinePointSlugParams, MarineProvincePlateParams } from './dto/marine-params.dto';
import { MarineProvinceConditionsDto } from './dto/marine-province-conditions.dto';
import { MarineSeriesDto } from './dto/marine-series.dto';
import { MarineValueDto } from './dto/marine-value.dto';
import { MarineEnabledGuard } from './marine-enabled.guard';
import { MarineService } from './marine.service';
import { MarineValuesService } from './marine-values.service';

/**
 * `Cache-Control` of the three value endpoints (SPEC-ADDENDUM §7.8, verbatim). The overview
 * applies it BY HAND because its `dataAvailable:false` state must answer `no-store` instead —
 * see the handler.
 */
const VALUE_CACHE_CONTROL = 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600';

/**
 * Public, read-only marine endpoints.
 *
 * No auth guard: public content by design, like `ProvinceController`. Writes, if they ever
 * exist here, arrive in a separate guarded module.
 *
 * ## Why `@ApiExtraModels` lists types no route returns yet
 * The full marine contract is FROZEN in this PR (SPEC-ADDENDUM §8.2). Registering the
 * value/series/overview/conditions/attribution DTOs here puts them into
 * `openapi/openapi.json` now, so the web repo can codegen the complete type set and build
 * against a mock while M2–M4 implement the runtime — instead of waiting for M4 and then
 * discovering the shape.
 *
 * Freezing early is safe here specifically because these shapes were derived from MEASURED
 * provider responses (raw unit strings, the absent time field, grid-centre snapping, the XML
 * error path), which is where late reshaping normally comes from. The standing condition: any
 * change to a frozen DTO before M5 is a BREAKING contract change and goes to Atlas, even
 * though nothing is deployed.
 *
 * The unimplemented ENDPOINTS are deliberately absent rather than stubbed with 501: an
 * advertised path that cannot work is worse than an absent one, and a mock server generated
 * from this spec would happily serve it.
 */
@ApiTags('marine')
@ApiExtraModels(
  MarineValueDto,
  MarineSeriesDto,
  MarineOverviewPointDto,
  MarineOverviewDto,
  MarineConditionsDto,
  MarineProvinceConditionsDto,
)
@Controller('marine')
// Publishes `X-Marine-Cache-Age` for any handler whose body carries one (SPEC-ADDENDUM §6.1/B7).
// Bound here rather than globally: only marine payloads have a marine cache age. The two M1
// endpoints attach none — they are a Postgres read and a constant, with no cache behind them —
// so today this is a pass-through, and the M3/M4 value endpoints are what will populate it.
@UseInterceptors(MarineCacheAgeInterceptor)
export class MarineController {
  constructor(
    private readonly marineService: MarineService,
    private readonly marineValuesService: MarineValuesService,
  ) {}

  /**
   * Cache-Control per SPEC-ADDENDUM §7.8. The point list is the most static thing this feature
   * has — it changes only when a probe run re-lands the artifact — hence a long `s-maxage` and
   * a week of `stale-while-revalidate`.
   */
  @Get('points')
  @CacheControl('public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800')
  @ApiOperation({
    summary: 'List every marine reference point (lean payload for the /deniz hub + map).',
    description:
      'Plain array, bounded and small. Points are OFFSHORE coordinates deliberately outside ' +
      'straits and narrow gulfs, where regional models measurably disagree; the three ' +
      'two-sea provinces (İstanbul, Çanakkale, Balıkesir) each return two entries.',
  })
  @ApiOkResponse({ type: MarinePointListItemDto, isArray: true })
  findAllPoints(): Promise<MarinePointListItemDto[]> {
    return this.marineService.findAllPoints();
  }

  /**
   * Since M3b the catalogue carries TIME-DERIVED fields (horizonEndUtc & co. move four times a
   * day and null out at the 24 h cycle-age ceiling), so the M1-era 6 h `s-maxage` + 24 h
   * `stale-while-revalidate` would let a CDN keep publishing pre-stall values long after the
   * ceiling suppressed them at the origin (review #76 CR-5). 30 min shared + 1 h SWR bounds the
   * CDN's worst case to 1.5 h — a rounding error against the 24 h ceiling — while the origin
   * cost stays a single-row Postgres read plus a constant.
   */
  @Get('layers')
  @CacheControl('public, max-age=300, s-maxage=1800, stale-while-revalidate=3600')
  @ApiOperation({
    summary: 'Layer catalogue — units, direction conventions, calm thresholds, colour ramps.',
    description:
      'The machine-readable authority for how a value may be rendered. In particular ' +
      'directionConvention states, per layer, whether a degree means the direction the flow ' +
      'comes FROM or heads TOWARDS — the providers use both, inside the same API. Both ' +
      'arrow-unlock preconditions are met for the wind layers (the field is published and the ' +
      'wind-convention regression suite runs on CI). For the two ECMWF-PRIMARY layers ' +
      '(wind_speed_10m, wind_direction_10m), horizonEndUtc / updateFrequency / ' +
      'catalogueUpdatedAtUtc are resolved from the newest ingested model cycle — a local ' +
      'database read; this endpoint NEVER calls a provider. They are null while no cycle has ' +
      'been ingested yet or the newest one breached the 24 h cycle-age ceiling. The three ' +
      'CMEMS-primary layers resolve the same fields from the stored STAC catalogue ' +
      'resolutions the warmup tour maintains — also a local cache read, never a provider ' +
      'call; they are null while no resolution is stored yet (cold cache) or not every ' +
      'serving product is resolved (a partial horizon minimum could overstate the horizon).',
  })
  @ApiOkResponse({ type: MarineLayerDto, isArray: true })
  findAllLayers(): Promise<MarineLayerDto[]> {
    return this.marineService.findAllLayers();
  }

  /**
   * The `/deniz` hub payload — CMEMS values by cache PEEK only, ECMWF from the local store.
   * ZERO upstream calls on every branch, cold included (the locked COLD-BEHAVIOR row; e2e
   * counts the calls).
   *
   * ## `Cache-Control` is set by hand here, not with `@CacheControl`
   * The `dataAvailable:false` state must answer `no-store` (an empty payload cached by a CDN
   * would republish the cold window for `s-maxage`), and the global `CacheControlInterceptor`'s
   * tap runs AFTER this handler — a decorated value would overwrite the override. Setting it in
   * the handler keeps the §7.8 value on the success path and still leaves 5xx responses
   * header-free, because a throw skips the assignment exactly as it skips the interceptor tap.
   */
  @Get('overview')
  @UseGuards(MarineEnabledGuard)
  @ApiOperation({
    summary: 'Instant marine values for every reference point (the /deniz hub payload).',
    description:
      'CMEMS-sourced fields are answered from cache only — this endpoint NEVER waits for a ' +
      'provider. dataAvailable=false (cold cache) responses carry Cache-Control: no-store and ' +
      'MUST NOT be committed by ISR/SSG. Returns 404 while the marine feature is disabled.',
  })
  @ApiOkResponse({ type: MarineOverviewDto })
  @ApiNotFoundResponse({ description: 'The marine feature is not enabled on this deployment.' })
  async getOverview(@Res({ passthrough: true }) response: Response): Promise<MarineOverviewDto> {
    const overview = await this.marineValuesService.getOverview();
    response.setHeader('Cache-Control', overview.dataAvailable ? VALUE_CACHE_CONTROL : 'no-store');
    return overview;
  }

  /** One point's full payload: instant values + the 5-day series. */
  @Get('points/:slug/conditions')
  @UseGuards(MarineEnabledGuard)
  @CacheControl(VALUE_CACHE_CONTROL)
  @ApiOperation({
    summary: 'Instant values and the 5-day series for one marine reference point.',
    description:
      'The slug may be the TR or the EN one (both are routing keys). A cold cache may refresh ' +
      'this point’s own CMEMS values inline under one bounded deadline; a provider ' +
      'failure degrades the affected fields to unavailable, never the response.',
  })
  @ApiParam({ name: 'slug', example: 'istanbul-marmara-aciklari', description: 'TR or EN slug.' })
  @ApiOkResponse({ type: MarineConditionsDto })
  @ApiNotFoundResponse({
    description: 'No marine point matches the slug, or the marine feature is disabled.',
  })
  @ApiBadRequestResponse({ description: 'The slug is not a well-formed kebab-case identifier.' })
  getConditions(@Param() params: MarinePointSlugParams): Promise<MarineConditionsDto> {
    return this.marineValuesService.getConditions(params.slug);
  }

  /** Every marine point of one province — the /turkiye/{il} "Deniz Durumu" payload. */
  @Get('provinces/:plateCode/conditions')
  @UseGuards(MarineEnabledGuard)
  @CacheControl(VALUE_CACHE_CONTROL)
  @ApiOperation({
    summary: 'Marine conditions of every reference point published under one province.',
    description:
      'Two entries for the two-sea provinces (İstanbul, Çanakkale, Balıkesir); the entries ' +
      'legitimately disagree and each carries its own per-field statuses — one point’s ' +
      'outage never suppresses or fills the other. An inland province is a 404.',
  })
  @ApiParam({ name: 'plateCode', example: '34', description: 'Plaka kodu, zero-padded.' })
  @ApiOkResponse({ type: MarineProvinceConditionsDto })
  @ApiNotFoundResponse({
    description:
      'The province has no marine reference point (inland), or the marine feature is disabled.',
  })
  @ApiBadRequestResponse({ description: 'plateCode is not exactly two digits.' })
  getProvinceConditions(
    @Param() params: MarineProvincePlateParams,
  ): Promise<MarineProvinceConditionsDto> {
    return this.marineValuesService.getProvinceConditions(params.plateCode);
  }
}
