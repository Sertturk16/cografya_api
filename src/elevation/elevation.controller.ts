import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ElevationEnabledGuard } from './elevation-enabled.guard';
import { ElevationProfileService } from './elevation-profile.service';
import { ElevationProfileQueryDto } from './dto/elevation-profile-query.dto';
import { ElevationProfileDto } from './dto/elevation-profile.dto';

/**
 * What a COMPLETE profile may be cached for.
 *
 * Long, because the answer cannot change: the tiles behind it are immutable (the bucket's own
 * `Last-Modified` is 2017-11-17) and the endpoints are quantised, so the same request is the same
 * answer for as long as the sampling formula stands.
 */
const PROFILE_CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

/**
 * What a PARTIAL or empty profile may be cached for: nothing.
 *
 * A CDN republishing an incomplete cross-section shows a student a shape that is missing a
 * mountain and presents it as the answer. `no-store` is the difference between "come back and it
 * will be complete" and "this is what the terrain looks like".
 */
const INCOMPLETE_CACHE_CONTROL = 'no-store';

/**
 * The rate limit for this route, tighter than the global 120/min.
 *
 * The global limit is sized for cheap Postgres reads. This route is the first public one that can
 * cost real upstream work — up to the per-request tile ceiling on a cold cache — so it carries its
 * own ceiling. 10 per minute is well above what drawing lines by hand produces and far below what
 * a script would.
 *
 * ## WHOSE ten per minute, stated rather than assumed (review #124, SEC124-I1; corrected SEC84-P1)
 * The `trust proxy` decision named here as undecided HAS LANDED: `DEC 2026-08-26o` rules a
 * bounded single hop (`TRUSTED_PROXY_HOPS`), and `TrustedClientThrottlerGuard.getTracker`
 * (`src/common/throttler/visitor-tracker.ts`) resolves the tracked identity from it — the PEER
 * identity (raw socket at `0`, the single trusted terminator's address at `1`), except for an
 * authenticated forwarder's well-formed `x-visitor-address`. `ENGINEERING.md` §3.1's former
 * `TODO(first-deploy)` list is gone; what remains open is narrower and stated where it can be
 * checked: the DEPLOY-PATH verification that the deployed terminator behaves as `DEC 2026-08-26o`
 * assumes (the only route to the api; it overwrites rather than appends `X-Forwarded-For`).
 *
 * So, until that verification has run: whether this ceiling is per-visitor or per-terminator-hop
 * depends on a deployment this repo cannot measure. AK-25 md.3 binds the web proxy route handler
 * to carry the real client IP forward, and the api side that reads it is `visitor-tracker.ts`'s
 * forwarded axis — but that axis needs the web-side change to land too (SEC84-P1 plan, landing
 * order: api → web forwarding → deploy-path verification).
 *
 * It is one of FOUR independent brakes and the weakest of them by design: the per-request tile
 * ceiling bounds one request structurally, the provider budget bounds every request in the process
 * together, and the two cache layers turn a repeat into zero upstream calls. See
 * `trusted-client.ts` for how this route sits against the throttle exemption.
 */
const PROFILE_THROTTLE_LIMIT = 10;
const PROFILE_THROTTLE_TTL_MS = 60_000;

/**
 * The public elevation-profile endpoint.
 *
 * **No auth guard, by design** (`ENGINEERING.md` §2, the `ProvinceController` precedent): the
 * calculator surfaces are a permanent "no account" class (DEC 2026-08-19a md.13). There is no
 * write endpoint here and no role on this leg at all.
 *
 * ## No personal data, on any branch
 * The only input is a pair of coordinates a user tapped on a map. No session, no location
 * permission, no identifier, and coordinates are never written to a log line. The web repo calls
 * this through a thin proxy route handler that deliberately does NOT forward the internal token
 * (Atlas ruling AK-25 md.3), so the proxy cannot lend its exemption to anonymous traffic. The
 * ruling's other condition — the handler carries the real client IP forward — is about the
 * throttle rather than about privacy, and what this service does with it is stated at
 * {@link PROFILE_THROTTLE_LIMIT}: the same two-axis statement that field's own docblock carries —
 * the `trust proxy` decision has landed (`DEC 2026-08-26o`, one bounded hop) and the open
 * first-deploy item is now the deploy-path verification. Gate: `test/throttle.e2e-spec.ts`
 * E-1/E-2/E-3a/E-3b.
 *
 * ## Fail-soft, never 5xx, for a provider fault
 * A provider outage comes back as `dataAvailable: false` with `no-store`, because degrading the
 * widget while the page survives is the rule this whole upstream layer is built on
 * (`ENGINEERING.md` §3.5). The states that are NOT 200: a coordinate outside the frame, an
 * unknown query parameter or a zero-length line (400), and the feature being disabled (404).
 */
@ApiTags('elevation')
@Controller('elevation')
export class ElevationController {
  constructor(private readonly profileService: ElevationProfileService) {}

  /**
   * ## `Cache-Control` is set BY HAND, not with `@CacheControl`
   * A partial or empty profile must answer `no-store`, and the global `CacheControlInterceptor`
   * runs AFTER the handler — a decorated value would overwrite the override. Setting it here keeps
   * the long value on the complete path and still leaves 5xx responses header-free, because a
   * throw skips this assignment exactly as it skips the interceptor tap (the marine `overview` and
   * earthquake precedent).
   */
  @Get('profile')
  @UseGuards(ElevationEnabledGuard)
  @Throttle({ default: { limit: PROFILE_THROTTLE_LIMIT, ttl: PROFILE_THROTTLE_TTL_MS } })
  @ApiOperation({
    summary: 'Elevation profile along a line inside the Türkiye frame.',
    description:
      'Samples the great circle between the two endpoints at a fixed, server-chosen number of ' +
      'points and returns two parallel arrays: distance along the line and whole-metre elevation. ' +
      'The client downloads no tiles. Endpoints are rounded to 3 decimals before anything else ' +
      'happens and echoed back as from/to, so the caller always knows which line was measured. ' +
      'A cold cache on a very long line may answer a PARTIAL profile — resolvedSampleCount below ' +
      'sampleCount, Cache-Control: no-store — which is a warming step rather than an error: the ' +
      'tiles it fetched stay resident, so the next request for the same line resolves more. ' +
      'A provider outage is 200 with dataAvailable: false, never a 5xx. Returns 404 while the ' +
      'feature is disabled. Every response carries the full attribution block, including on the ' +
      'cold path — the licence notices attach to the section, not to whether a value resolved.',
  })
  @ApiOkResponse({ type: ElevationProfileDto })
  @ApiBadRequestResponse({
    description:
      'A coordinate is outside the Türkiye frame, missing or malformed; a query parameter is not ' +
      'recognised (unknown parameters are rejected, not ignored); or the two endpoints collapse ' +
      'to the same point once rounded.',
  })
  @ApiNotFoundResponse({ description: 'The elevation feature is not enabled on this deployment.' })
  @ApiTooManyRequestsResponse({
    description:
      'The per-client rate limit for this route was exceeded. Tighter than the global limit ' +
      'because this route can reach an external provider.',
  })
  async getProfile(
    @Query() query: ElevationProfileQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ElevationProfileDto> {
    const { profile, cacheable } = await this.profileService.getProfile(query);
    response.setHeader(
      'Cache-Control',
      cacheable ? PROFILE_CACHE_CONTROL : INCOMPLETE_CACHE_CONTROL,
    );
    return profile;
  }
}
