import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AUTH_ERROR_KEYS } from '../auth/auth-error-keys';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { NoTrustedClientExemption } from '../common/throttler/throttler-metadata';
import { FavoriteTargetParams } from './dto/favorite-target-params.dto';
import { FavoriteDto, FavoriteEntityType } from './dto/favorite.dto';
import { FavoritesService } from './favorites.service';

/**
 * `/api/favorites…` — one caller's own province/country/region/continent favorites (UYELIK-07,
 * widened to four entity types by P1 PR-A, plan §5.1.2).
 *
 * All three routes: `@UseGuards(AccessTokenGuard)` + `@NoTrustedClientExemption()` — the
 * SEC136-I3 reasoning applies verbatim to all three, exactly as it did to the original five:
 * every one returns or persists per-user data behind auth, and the trusted-client throttle
 * exemption is scoped by HTTP method, not by auth presence, so none may be silently waved
 * through. No route-level `@Throttle` override, for the same reasoning `video_progress` already
 * recorded: the global ceiling (120/min per resolved identity) already applies once
 * `@NoTrustedClientExemption()` is present, each write touches only the caller's own row, is
 * idempotent, makes no external call, and has no fan-out cost.
 *
 * **Five routes become three** (plan §5.1.2): the former `provinces/:plateCode` and
 * `countries/:isoCode` route pairs collapse into one `:entityType/:entityId` pair now shared by
 * all four types, validated as a whole by {@link FavoriteTargetParams}.
 *
 * Every query in {@link FavoritesService} filters by the `userId` taken from `@CurrentUser()`,
 * never from a client-supplied field — no DTO's request shape carries a `userId` at all, so
 * there is no field a caller could even attempt to override (the cross-user-isolation invariant).
 */
@ApiTags('favorites')
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: "The caller's own favorited provinces, countries, regions and continents.",
    description:
      'A plain, unpaginated array — bounded at at most 81 provinces + ~199 countries + 7 regions ' +
      '+ 7 continents = 294 rows per user, ever, the same "bounded and small" shape ' +
      '`ENGINEERING.md` §2 already uses for the province/country lists themselves.',
  })
  @ApiOkResponse({ type: [FavoriteDto] })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  async listMine(@CurrentUser() user: AuthenticatedUser): Promise<FavoriteDto[]> {
    return this.favorites.listMine(user.id);
  }

  @Put(':entityType/:entityId')
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiParam({
    name: 'entityType',
    enum: FavoriteEntityType,
    example: FavoriteEntityType.Province,
  })
  @ApiParam({
    name: 'entityId',
    example: '34',
    description:
      'The published business key for entityType — provinces.plate_code, countries.iso_code, ' +
      'regions.slug, or a Continent enum label.',
  })
  @ApiOperation({
    summary: 'Idempotent add — favorite one province, country, region or continent.',
    description:
      "Always 200, never 201 — the resource's final state is identical whether this call " +
      "created or found the row, matching video_progress's idempotent-upsert convention. No " +
      'request body: the target comes entirely from the route params and the auth context.',
  })
  @ApiOkResponse({ type: FavoriteDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  @ApiNotFoundResponse({
    type: ApiErrorDto,
    description:
      'One of errors.favorites.{provinceNotFound,countryNotFound,regionNotFound,' +
      'continentNotFound}, matching the request entityType.',
  })
  async addTarget(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: FavoriteTargetParams,
  ): Promise<FavoriteDto> {
    return this.favorites.addTarget(user.id, params.entityType, params.entityId);
  }

  @Delete(':entityType/:entityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiParam({
    name: 'entityType',
    enum: FavoriteEntityType,
    example: FavoriteEntityType.Province,
  })
  @ApiParam({
    name: 'entityId',
    example: '34',
    description:
      'The published business key for entityType — provinces.plate_code, countries.iso_code, ' +
      'regions.slug, or a Continent enum label.',
  })
  @ApiOperation({
    summary: 'Idempotent remove — unfavorite one province, country, region or continent.',
    description:
      '204 unconditionally: whether the row was favorited and removed, was never favorited, or ' +
      'entityId is well-formed but names nothing real at all. No 404 branch on this route at ' +
      'all — "remove" never needs to distinguish those cases from the caller\'s point of view.',
  })
  @ApiNoContentResponse({
    description:
      'Removed, already absent, or entityId names nothing real — all answer identically.',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  async removeTarget(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: FavoriteTargetParams,
  ): Promise<void> {
    await this.favorites.removeTarget(user.id, params.entityType, params.entityId);
  }
}
