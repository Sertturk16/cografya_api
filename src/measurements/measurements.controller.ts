import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
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
import { CreateMeasurementRequestDto } from './dto/create-measurement-request.dto';
import { MeasurementDto } from './dto/measurement.dto';
import { MeasurementParams } from './dto/measurement-params.dto';
import { UpdateMeasurementTitleRequestDto } from './dto/update-measurement-title-request.dto';
import { MEASUREMENTS_ERROR_KEYS } from './measurements-error-keys';
import { MeasurementsService } from './measurements.service';

/**
 * `/api/measurements…` — one caller's own saved map measurements (UYELIK-11, plan §5.10).
 *
 * All five routes: `@UseGuards(AccessTokenGuard)` + `@NoTrustedClientExemption()` +
 * `@ApiBearerAuth('access-token')` — the same SEC136-I3 reasoning every sibling controller states
 * verbatim: each write touches only the caller's own row, each is idempotent or unconditionally
 * idempotent, none makes an external call or has fan-out cost, so the global throttle ceiling
 * (already applied once `@NoTrustedClientExemption()` is present) is sufficient. No second,
 * `game-rounds`-style rate-limit guard on `POST` — plan §5.3 states why that class of risk does
 * not apply here: this resource carries a hard total-count quota, so unbounded growth via
 * multi-IP fan-out cannot occur regardless of request rate.
 *
 * Every query in {@link MeasurementsService} filters by the `userId` taken from `@CurrentUser()`,
 * never from a client-supplied field — no DTO's request shape carries a `userId` at all, so there
 * is no field a caller could even attempt to override (the cross-user-isolation invariant).
 */
@ApiTags('measurements')
@Controller('measurements')
export class MeasurementsController {
  constructor(private readonly measurements: MeasurementsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Idempotent create — save a measurement, quota-gated.',
    description:
      "Always 200, never 201 — the resource's final state is identical whether this call " +
      "created or found the row, matching this repo's established idempotent-write convention. " +
      'Resubmitting the same clientMeasurementId for the same caller returns the ORIGINAL ' +
      'recorded values, even if the resubmitted body differs.',
  })
  @ApiOkResponse({ type: MeasurementDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: MEASUREMENTS_ERROR_KEYS.invalidShape })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: MEASUREMENTS_ERROR_KEYS.quotaExceeded })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateMeasurementRequestDto,
  ): Promise<MeasurementDto> {
    return this.measurements.create(user.id, body);
  }

  @Get()
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: "The caller's own saved measurements.",
    description:
      'A plain, unpaginated array — the quota hard-caps the corpus at MEASUREMENTS_PER_USER_MAX ' +
      'rows per user, ever, the same "bounded and small" shape `ENGINEERING.md` §2 already uses ' +
      'for `favorites`. Ordered most-recently-saved first.',
  })
  @ApiOkResponse({ type: [MeasurementDto] })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  async listMine(@CurrentUser() user: AuthenticatedUser): Promise<MeasurementDto[]> {
    return this.measurements.listMine(user.id);
  }

  @Get(':id')
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiParam({ name: 'id', format: 'uuid', description: 'measurements.id.' })
  @ApiOperation({
    summary: "One of the caller's own saved measurements.",
    description:
      'One undifferentiated 404 whether id names no row at all or the row belongs to another ' +
      "user — nothing about another user's row is ever observable.",
  })
  @ApiOkResponse({ type: MeasurementDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: MEASUREMENTS_ERROR_KEYS.notFound })
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: MeasurementParams,
  ): Promise<MeasurementDto> {
    return this.measurements.getOne(user.id, params.id);
  }

  @Patch(':id')
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiParam({ name: 'id', format: 'uuid', description: 'measurements.id.' })
  @ApiOperation({
    summary: "Rename (or clear) a saved measurement's title. Geometry is immutable.",
    description:
      'Only `title` is mutable — send a bounded string or explicit null; omitting `title` ' +
      'entirely 400s. `type`/`points`/`clientMeasurementId` are never touched by this route.',
  })
  @ApiOkResponse({ type: MeasurementDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'A missing or over-length title, or a malformed request body / id.',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: MEASUREMENTS_ERROR_KEYS.notFound })
  async updateTitle(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: MeasurementParams,
    @Body() body: UpdateMeasurementTitleRequestDto,
  ): Promise<MeasurementDto> {
    return this.measurements.updateTitle(user.id, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiParam({ name: 'id', format: 'uuid', description: 'measurements.id.' })
  @ApiOperation({
    summary: 'Unconditionally idempotent delete.',
    description:
      '204 unconditionally: whether the row existed and was removed, never existed, or belongs ' +
      'to another caller — "remove" never needs to distinguish those cases, and this can never ' +
      "reveal another user's row's existence.",
  })
  @ApiNoContentResponse({
    description: "Deleted, already absent, or another caller's id — all answer identically.",
  })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: MeasurementParams,
  ): Promise<void> {
    await this.measurements.remove(user.id, params.id);
  }
}
