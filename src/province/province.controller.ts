import { Controller, Get, Header, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ProvinceDetailDto } from './dto/province-detail.dto';
import { ProvinceListItemDto } from './dto/province-list-item.dto';
import { ProvinceMapSummaryDto } from './dto/province-map-summary.dto';
import { ProvinceService } from './province.service';

/**
 * Public, read-only province endpoints (the source for the SSG il pages + hub).
 * No auth guard: this is public content by design (CONVENTIONS §5/§6). Writes
 * (admin CRUD) arrive in a later, guarded module.
 *
 * Cache-Control is set for CDN/browser caching of these hot, rarely-changing
 * reads; a Redis read-through cache is layered in later when traffic warrants.
 */
@ApiTags('provinces')
@Controller('provinces')
export class ProvinceController {
  constructor(private readonly provinceService: ProvinceService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
  @ApiOperation({ summary: 'List all provinces (lean payload for the il-hub + map).' })
  @ApiOkResponse({ type: ProvinceListItemDto, isArray: true })
  findAll(): Promise<ProvinceListItemDto[]> {
    return this.provinceService.findAll();
  }

  // ROUTE ORDER: this static path MUST stay declared BEFORE `@Get(':slug')` — Express
  // matches in declaration order, so a `:slug` route above would capture
  // `/provinces/map-summary` as slug="map-summary" and 404. Do not reorder.
  @Get('map-summary')
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
  @ApiOperation({
    summary: 'Bulk hover-card summary for all provinces (homepage SVG map, build-time embed).',
  })
  @ApiOkResponse({ type: ProvinceMapSummaryDto, isArray: true })
  findMapSummary(): Promise<ProvinceMapSummaryDto[]> {
    return this.provinceService.findMapSummary();
  }

  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
  @ApiOperation({ summary: 'Get one province by its TR or EN slug (full detail).' })
  @ApiParam({ name: 'slug', example: 'istanbul', description: 'TR or EN slug of the province.' })
  @ApiOkResponse({ type: ProvinceDetailDto })
  @ApiNotFoundResponse({ description: 'No province matches the given slug.' })
  findBySlug(@Param('slug') slug: string): Promise<ProvinceDetailDto> {
    return this.provinceService.findBySlug(slug);
  }
}
