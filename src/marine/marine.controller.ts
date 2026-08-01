import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CacheControl } from '../common/http-cache/cache-control.decorator';
import { MarineCacheAgeInterceptor } from './marine-cache-age.interceptor';
import { MarineConditionsDto } from './dto/marine-conditions.dto';
import { MarineLayerDto } from './dto/marine-layer.dto';
import { MarineOverviewDto } from './dto/marine-overview.dto';
import { MarineOverviewPointDto } from './dto/marine-overview-point.dto';
import { MarinePointListItemDto } from './dto/marine-point-list-item.dto';
import { MarineProvinceConditionsDto } from './dto/marine-province-conditions.dto';
import { MarineSeriesDto } from './dto/marine-series.dto';
import { MarineValueDto } from './dto/marine-value.dto';
import { MarineService } from './marine.service';

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
  constructor(private readonly marineService: MarineService) {}

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
      'been ingested yet or the newest one breached the 24 h cycle-age ceiling. The ' +
      'CMEMS-primary layers keep null until M4 resolves the CMEMS catalogue.',
  })
  @ApiOkResponse({ type: MarineLayerDto, isArray: true })
  findAllLayers(): Promise<MarineLayerDto[]> {
    return this.marineService.findAllLayers();
  }
}
