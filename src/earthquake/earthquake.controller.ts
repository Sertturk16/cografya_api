import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { PlateCodeParams } from '../common/dto/route-params.dto';
import { EarthquakeReadService } from './earthquake-read.service';
import { EarthquakeDataStatus } from './earthquake.types';
import { EarthquakeListQueryDto } from './dto/earthquake-list-query.dto';
import { EarthquakeListDto } from './dto/earthquake-list.dto';
import { EarthquakeMetaDto } from './dto/earthquake-meta.dto';

/** `Cache-Control` of the two list endpoints (SPEC §6.1, verbatim). */
const LIST_CACHE_CONTROL = 'public, max-age=60, s-maxage=120, stale-while-revalidate=600';

/**
 * `Cache-Control` of the meta endpoint (SPEC §6.1, verbatim).
 *
 * Longer than the lists because the payload is mostly constants; the freshness fields ride along
 * and are the reason it is not longer still.
 */
const META_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

/**
 * What a cold response may be cached for: nothing.
 *
 * An empty payload committed to a CDN republishes the cold window for the whole `s-maxage`, which
 * on the meta endpoint would be an hour of telling every reader we hold no data after we started
 * holding some.
 */
const COLD_CACHE_CONTROL = 'no-store';

/**
 * Public, read-only earthquake endpoints — the source for the `/deprem` hub and the province
 * page's earthquake section.
 *
 * **No auth guard, by design** (`ENGINEERING.md` §2, the `ProvinceController` precedent): public
 * content, no write endpoint, no role on this leg at all. The global `ThrottlerGuard` applies, and
 * no extra throttle is needed — these handlers read Postgres and make no external call, while the
 * SSG build uses the `INTERNAL_REQUEST_TOKEN` exemption.
 *
 * **No personal data of any kind** passes through here: coordinates, magnitudes, depths and
 * administrative names. The provider's `neighborhood` field is neither stored nor served.
 *
 * ## COLD BEHAVIOUR (SPEC §12, binding)
 * Every endpoint answers **200 in every state of the DATA** — cold, warm, provider down, flag off.
 * An empty store is `items: []` with `dataStatus: 'unavailable'` and `no-store`, never an error: an
 * empty store is a deploy-ordering fact, not an ingest health failure (the air-quality H-7 class).
 * The single 404 on this leg is a plate code that names no province.
 *
 * **The one state that is NOT a 200, stated here so it is findable from the code:** if Postgres
 * itself is unreachable the store call rejects and Nest answers **500**. SPEC §12 asks for a 503
 * there, and this repo has no exception filter to produce one; a global filter is cross-cutting
 * machinery that would change every endpoint, so it was deliberately ruled out of E3's range and
 * sits on Atlas's board (plan-e3.md S8). A consumer must therefore still have a 5xx branch.
 *
 * ## `EARTHQUAKE_ENABLED` does not gate these routes
 * The kill switch governs the INGEST half only; the routes stay registered and degrade honestly.
 * That is precisely why the go-live rider matters — the web `/deprem` page must not ship while the
 * flag is off (Atlas ruling Q5, the marine/air-quality class).
 *
 * ## Attribution rides EVERY response
 * TDVMS Yönetmeliği m.9/4 makes crediting AFAD mandatory (DEC 2026-07-30j), so the array is
 * populated on the cold path and at every `dataStatus`. Nothing served here may imply endorsement
 * (`CONVENTIONS.md` §7).
 */
@ApiTags('earthquakes')
@Controller('earthquakes')
export class EarthquakeController {
  constructor(private readonly readService: EarthquakeReadService) {}

  /**
   * ## `Cache-Control` is set BY HAND here, not with `@CacheControl`
   * The cold state must answer `no-store`, and the global `CacheControlInterceptor`'s tap runs
   * AFTER the handler — so a decorated value would overwrite the override. Setting it in the
   * handler keeps the SPEC string on the success path and still leaves 5xx responses header-free,
   * because a throw skips the assignment exactly as it skips the interceptor tap. The
   * air-quality `listProvinces` precedent, adopted for the same reason: a cache age is an
   * observation about the body, `Cache-Control` is a decision of the handler.
   */
  @Get()
  @ApiOperation({
    summary: 'Recent earthquakes in Türkiye and its surroundings, paginated (the /deprem hub).',
    description:
      'Returns the shared list envelope, newest first, tie-broken so a row cannot appear on two ' +
      'pages. Reads the local store only and NEVER waits for AFAD. The default window is the ' +
      'last 7 days at magnitude 2.5 and up; the window and threshold actually applied come back ' +
      'in meta.filter. On a cold store the response is 200 with an empty items array, ' +
      'meta.dataStatus "unavailable" and Cache-Control: no-store, which ISR/SSG must not commit. ' +
      'These are RECORDED earthquakes: nothing here predicts, forecasts or warns.',
  })
  @ApiOkResponse({ type: EarthquakeListDto })
  @ApiBadRequestResponse({
    description:
      'A query parameter is out of range, malformed, or not recognised — unknown parameters are ' +
      'rejected rather than ignored. Also returned when fromUtc is later than toUtc, when either ' +
      'omits its timezone, or when the window spans more than 366 days.',
  })
  async listEvents(
    @Query() query: EarthquakeListQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EarthquakeListDto> {
    const payload = await this.readService.listEvents(query);
    response.setHeader(
      'Cache-Control',
      cacheControlFor(payload.meta.dataStatus, LIST_CACHE_CONTROL),
    );
    return payload;
  }

  /** The leg's standing facts plus the store's freshness — one request per page render. */
  @Get('meta')
  @ApiOperation({
    summary: 'Defaults, scope and data freshness for the earthquake endpoints.',
    description:
      'Structural values only: the default magnitude floor, the scope buffer the stored rows were ' +
      'classified with, the window bounds, and how fresh the store is. The labels a reader sees ' +
      'belong to the web repo — this endpoint carries no interface copy and no i18n key. ' +
      'Served from the local store and constants; never calls AFAD.',
  })
  @ApiOkResponse({ type: EarthquakeMetaDto })
  async getMeta(@Res({ passthrough: true }) response: Response): Promise<EarthquakeMetaDto> {
    const payload = await this.readService.getMeta();
    response.setHeader('Cache-Control', cacheControlFor(payload.dataStatus, META_CACHE_CONTROL));
    return payload;
  }

  /**
   * One province's earthquake section.
   *
   * The 404 is deliberately NOT cacheable: a plate code that names no province is a client error,
   * and the `Cache-Control` assignment never runs on a throw.
   */
  @Get('provinces/:plateCode')
  @ApiOperation({
    summary: 'Recent earthquakes bound to one province.',
    description:
      'The same envelope as the hub, filtered to the events bound to this province. Read ' +
      'bindingKind on every item before writing a sentence about it: the provider files an event ' +
      'under the NEAREST Turkish province, so an event across the border arrives tagged with a ' +
      'Turkish province and rendering it as "an earthquake in <province>" is factually wrong. A ' +
      'plate code that names no province is a 404; a malformed one is a 400.',
  })
  @ApiParam({
    name: 'plateCode',
    example: '46',
    description: 'Two-digit zero-padded province plate code.',
  })
  @ApiOkResponse({ type: EarthquakeListDto })
  @ApiNotFoundResponse({ description: 'No province carries this plate code.' })
  @ApiBadRequestResponse({
    description:
      'plateCode is not exactly two digits, or a query parameter is out of range, malformed or ' +
      'not recognised.',
  })
  async listProvinceEvents(
    @Param() params: PlateCodeParams,
    @Query() query: EarthquakeListQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EarthquakeListDto> {
    const payload = await this.readService.listProvinceEvents(params.plateCode, query);
    response.setHeader(
      'Cache-Control',
      cacheControlFor(payload.meta.dataStatus, LIST_CACHE_CONTROL),
    );
    return payload;
  }
}

/** Cacheable while we hold something to serve; `no-store` while we do not. */
function cacheControlFor(status: EarthquakeDataStatus, warmValue: string): string {
  return status === EarthquakeDataStatus.Unavailable ? COLD_CACHE_CONTROL : warmValue;
}
