import { Controller, Get } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CacheControl } from '../common/http-cache/cache-control.decorator';
import { AIR_QUALITY_INDEX_SYSTEM } from './air-quality-index-system.catalogue';
import { AirQualityAttributionDto } from './dto/air-quality-attribution.dto';
import { AirQualityIndexDto } from './dto/air-quality-index.dto';
import { AirQualityIndexSystemDto } from './dto/air-quality-index-system.dto';
import { AirQualityPollutantValueDto } from './dto/air-quality-pollutant-value.dto';
import { AirQualityProvinceDto } from './dto/air-quality-province.dto';
import { AirQualityProvinceListItemDto } from './dto/air-quality-province-list-item.dto';
import { AirQualitySeriesDto } from './dto/air-quality-series.dto';

/**
 * Public, read-only air-quality endpoints.
 *
 * No auth guard: public content by design, like `ProvinceController` and `MarineController`.
 * The global `ThrottlerGuard` applies.
 *
 * ## Why `@ApiExtraModels` lists types no route returns yet (plan §3, decision D4)
 * A1 is the CONTRACT PR: registering the province/series/attribution DTOs here puts them into
 * `openapi/openapi.json` now, so the web repo can codegen the complete type set and build
 * against a mock while A2 lands the ingest and the province endpoints — A2's contract delta
 * is then paths only. The shapes are safe to freeze because they mirror MEASURED provider
 * reality (file variable names, units, `_FillValue`, grid geometry, run cadence). Any change
 * to a frozen DTO is a BREAKING contract change and goes to Atlas.
 *
 * The unimplemented endpoints are deliberately ABSENT rather than stubbed with 501: an
 * advertised path that cannot work is worse than an absent one (the marine M1 precedent).
 *
 * ## COLD-BEHAVIOR (SPEC §10, binding)
 * `GET /api/air-quality/index-system` answers 200 from an in-code constant in EVERY state —
 * cold, warm, provider down. No endpoint in this module ever calls ADS on a request path.
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
export class AirQualityController {
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
}
