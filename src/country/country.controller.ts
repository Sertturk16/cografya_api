import { Controller, Get, Header, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CountryDetailDto } from './dto/country-detail.dto';
import { CountryListItemDto } from './dto/country-list-item.dto';
import { CountryMapSummaryDto } from './dto/country-map-summary.dto';
import { CountryService } from './country.service';

/**
 * Public, read-only country endpoints (the source for the SSG /dunya pages + hub).
 * No auth guard: this is public content by design (CLAUDE §2, same posture as
 * `ProvinceController`). Writes (admin CRUD) arrive in a later, guarded module.
 *
 * Cache-Control is set for CDN/browser caching of these hot, rarely-changing reads; a
 * Redis read-through cache is layered in later when traffic warrants.
 */
@ApiTags('countries')
@Controller('countries')
export class CountryController {
  constructor(private readonly countryService: CountryService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
  @ApiOperation({ summary: 'List all countries (lean payload for the /dunya hub + map).' })
  @ApiOkResponse({ type: CountryListItemDto, isArray: true })
  findAll(): Promise<CountryListItemDto[]> {
    return this.countryService.findAll();
  }

  // ROUTE ORDER: this static path MUST stay declared BEFORE `@Get(':slug')` — Express
  // matches in declaration order, so a `:slug` route above would capture
  // `/countries/map-summary` as slug="map-summary" and 404. Do not reorder.
  @Get('map-summary')
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
  @ApiOperation({
    summary: 'Bulk hover-card summary for all countries (world SVG map, build-time embed).',
  })
  @ApiOkResponse({ type: CountryMapSummaryDto, isArray: true })
  findMapSummary(): Promise<CountryMapSummaryDto[]> {
    return this.countryService.findMapSummary();
  }

  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
  @ApiOperation({ summary: 'Get one country by its TR or EN slug (full detail).' })
  @ApiParam({ name: 'slug', example: 'turkiye', description: 'TR or EN slug of the country.' })
  @ApiOkResponse({ type: CountryDetailDto })
  @ApiNotFoundResponse({ description: 'No country matches the given slug.' })
  findBySlug(@Param('slug') slug: string): Promise<CountryDetailDto> {
    return this.countryService.findBySlug(slug);
  }
}
