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
import { PlateCodeParams } from '../common/dto/route-params.dto';
import { NoTrustedClientExemption } from '../common/throttler/throttler-metadata';
import { FavoriteCountryParams } from './dto/favorite-country-params.dto';
import { FavoriteDto } from './dto/favorite.dto';
import { FAVORITES_ERROR_KEYS } from './favorites-error-keys';
import { FavoritesService } from './favorites.service';

/**
 * `/api/favorites…` — one caller's own province/country favorites (UYELIK-07, plan §5.6).
 *
 * All five routes: `@UseGuards(AccessTokenGuard)` + `@NoTrustedClientExemption()` — the
 * SEC136-I3 reasoning applies verbatim to all five, exactly as it does to `video-progress`'s two:
 * every one returns or persists per-user data behind auth, and the trusted-client throttle
 * exemption is scoped by HTTP method, not by auth presence, so none may be silently waved
 * through. No route-level `@Throttle` override, for the same reasoning `video_progress` already
 * recorded: the global ceiling (120/min per resolved identity) already applies once
 * `@NoTrustedClientExemption()` is present, each write touches only the caller's own row, is
 * idempotent, makes no external call, and has no fan-out cost.
 *
 * Every query in {@link FavoritesService} filters by the `userId` taken from `@CurrentUser()`,
 * never from a client-supplied field — no DTO's request shape carries a `userId` at all, so
 * there is no field a caller could even attempt to override (the cross-user-isolation invariant,
 * sharpened for the delete surface — this is the repo's first `@Delete()` route).
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
    summary: "The caller's own favorited provinces and countries.",
    description:
      'A plain, unpaginated array — bounded at at most 81 provinces + ~199 countries = 280 rows ' +
      'per user, ever, the same "bounded and small" shape `ENGINEERING.md` §2 already uses for ' +
      'the province/country lists themselves.',
  })
  @ApiOkResponse({ type: [FavoriteDto] })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  async listMine(@CurrentUser() user: AuthenticatedUser): Promise<FavoriteDto[]> {
    return this.favorites.listMine(user.id);
  }

  @Put('provinces/:plateCode')
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiParam({
    name: 'plateCode',
    example: '34',
    description: 'Two-digit zero-padded province plate code.',
  })
  @ApiOperation({
    summary: 'Idempotent add — favorite one province.',
    description:
      "Always 200, never 201 — the resource's final state is identical whether this call " +
      "created or found the row, matching video_progress's idempotent-upsert convention. No " +
      'request body: the target comes entirely from the route param and the auth context.',
  })
  @ApiOkResponse({ type: FavoriteDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: FAVORITES_ERROR_KEYS.provinceNotFound })
  async addProvince(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PlateCodeParams,
  ): Promise<FavoriteDto> {
    return this.favorites.addProvince(user.id, params.plateCode);
  }

  @Delete('provinces/:plateCode')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiParam({
    name: 'plateCode',
    example: '34',
    description: 'Two-digit zero-padded province plate code.',
  })
  @ApiOperation({
    summary: 'Idempotent remove — unfavorite one province.',
    description:
      '204 unconditionally: whether the row was favorited and removed, was never favorited, or ' +
      'plateCode is well-formed but names no real province at all. No 404 branch on this route ' +
      'at all — "remove" never needs to distinguish those cases from the caller\'s point of view.',
  })
  @ApiNoContentResponse({
    description:
      'Removed, already absent, or plateCode names no province — all answer identically.',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  async removeProvince(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PlateCodeParams,
  ): Promise<void> {
    await this.favorites.removeProvince(user.id, params.plateCode);
  }

  @Put('countries/:isoCode')
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiParam({ name: 'isoCode', example: 'TR', description: 'ISO 3166-1 alpha-2 country code.' })
  @ApiOperation({
    summary: 'Idempotent add — favorite one country.',
    description: 'Mirrors the province add route exactly, substituting isoCode/countryNotFound.',
  })
  @ApiOkResponse({ type: FavoriteDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: FAVORITES_ERROR_KEYS.countryNotFound })
  async addCountry(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: FavoriteCountryParams,
  ): Promise<FavoriteDto> {
    return this.favorites.addCountry(user.id, params.isoCode);
  }

  @Delete('countries/:isoCode')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiParam({ name: 'isoCode', example: 'TR', description: 'ISO 3166-1 alpha-2 country code.' })
  @ApiOperation({
    summary: 'Idempotent remove — unfavorite one country.',
    description: 'Mirrors the province remove route exactly, substituting isoCode.',
  })
  @ApiNoContentResponse({
    description: 'Removed, already absent, or isoCode names no country — all answer identically.',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  async removeCountry(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: FavoriteCountryParams,
  ): Promise<void> {
    await this.favorites.removeCountry(user.id, params.isoCode);
  }
}
