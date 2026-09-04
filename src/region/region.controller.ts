import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CacheControl } from '../common/http-cache/cache-control.decorator';
import { RegionDetailDto } from './dto/region-detail.dto';
import { RegionListItemDto } from './dto/region-list-item.dto';
import { RegionService } from './region.service';

/**
 * Public, read-only geographic region endpoints.
 * Serves the seven geographic regions of Türkiye for the /v2/turkiye/bolge/[slug] routes.
 */
@ApiTags('regions')
@Controller('regions')
export class RegionController {
  constructor(private readonly regionService: RegionService) {}

  @Get()
  @CacheControl('public, max-age=300, stale-while-revalidate=86400')
  @ApiOperation({
    summary: 'List all seven geographic regions (lean payload for hub and comparative views).',
  })
  @ApiOkResponse({ type: RegionListItemDto, isArray: true })
  findAll(): Promise<RegionListItemDto[]> {
    return this.regionService.findAll();
  }

  @Get(':slug')
  @CacheControl('public, max-age=300, stale-while-revalidate=86400')
  @ApiOperation({
    summary: 'Get one geographic region by its canonical URL slug (full 15-section detail).',
  })
  @ApiParam({
    name: 'slug',
    example: 'marmara',
    description: 'URL slug of the region (e.g. marmara, ege, akdeniz).',
  })
  @ApiOkResponse({ type: RegionDetailDto })
  @ApiNotFoundResponse({ description: 'No region matches the given slug.' })
  findBySlug(@Param('slug') slug: string): Promise<RegionDetailDto> {
    return this.regionService.findBySlug(slug);
  }
}
