import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AccessTokenGuard } from './access-token.guard';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { AuthenticatedUser } from './authenticated-user';
import { CurrentUser } from './current-user.decorator';
import { AuthResultDto } from './dto/auth-result.dto';
import { LoginRequestDto } from './dto/login-request.dto';
import { LogoutRequestDto } from './dto/logout-request.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { RefreshRequestDto } from './dto/refresh-request.dto';
import { RegisterRequestDto } from './dto/register-request.dto';
import { ResendVerificationRequestDto } from './dto/resend-verification-request.dto';
import { SessionDto } from './dto/session.dto';
import { VerifyEmailRequestDto } from './dto/verify-email-request.dto';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { RegistrationService } from './registration.service';
import { SessionService } from './session.service';

/**
 * §9.1's IP-axis ceilings, in `@Throttle`'s `{ limit, ttl(ms) }` shape (D18). `export`ed —
 * unlike `elevation.controller.ts`'s module-private precedent — because
 * `test/auth-security.e2e-spec.ts` (E2E-T3) must IMPORT the ceiling it asserts against rather
 * than retype it (`CONVENTIONS.md` §2's structural-test rule, the `THROTTLE_LIMIT` precedent).
 * `src/auth/auth.constants.ts` deliberately does NOT carry these: that file is crypto/lifetime
 * constants, these are route ceilings.
 *
 * **These are per SOCKET, not per visitor** — `trust proxy` is unset (`ENGINEERING.md` §3.1,
 * `DEC 2026-08-15f` D2, a first-deploy item this plan does not open).
 */
export const AUTH_ROUTE_THROTTLES = {
  register: { limit: 10, ttl: 60 * 60 * 1000 },
  verifyEmail: { limit: 10, ttl: 10 * 60 * 1000 },
  verifyEmailResend: { limit: 10, ttl: 60 * 60 * 1000 },
  login: { limit: 30, ttl: 15 * 60 * 1000 },
  refresh: { limit: 60, ttl: 15 * 60 * 1000 },
  logout: { limit: 60, ttl: 15 * 60 * 1000 },
  passwordResetRequest: { limit: 10, ttl: 60 * 60 * 1000 },
  passwordResetConfirm: { limit: 10, ttl: 60 * 60 * 1000 },
} as const;

/**
 * The nine auth endpoints (§6.1).
 *
 * **D13 — `Cache-Control: no-store` is set with `@Header`, not `@CacheControl`, on EVERY
 * method.** `@CacheControl`'s own docblock (`src/common/http-cache/cache-control.decorator.ts:
 * 13-14`) names auth/mutating routes as exactly what it must NOT be used on, and its
 * interceptor sets the header only inside `next.handle().pipe(tap(...))` — the SUCCESS branch —
 * so a 400/401/403/429 response would carry no `Cache-Control` at all under that mechanism, and
 * E2E-N9's "every response, success and error alike" could not be satisfied. `@Header` sets the
 * header BEFORE the handler runs (`cache-control.decorator.ts`'s own comment: "sets the header
 * BEFORE the handler runs, so it also rides 5xx error responses"), which is exactly the property
 * this route class needs: `no-store` surviving an error path is the DESIRED behaviour here, the
 * mirror image of `@CacheControl`'s PR #23 concern (a caching intermediary must never be
 * ALLOWED to outlive a resolved outage — `no-store` is the opposite of allowing, so that concern
 * never fires for this value). `src/common/http-cache/**` is therefore untouched by this PR
 * (Y17): the decorator and interceptor are correct for what they were built for, and this class
 * simply does not use them.
 *
 * **Applied per-METHOD, not at class level (a measured correction to the plan's "sınıf
 * düzeyinde" text — flagged as a `CLAIMS_REQUIRING_VERIFICATION` candidate in the return).**
 * `@Header`'s installed implementation (`@nestjs/common`) destructures `descriptor.value`
 * unconditionally — `(target, key, descriptor) => { …descriptor.value…; return descriptor; }`
 * — so it compiles and runs only as a METHOD decorator; a class application passes no
 * `descriptor` and fails at the type level (measured: `tsc` refuses it). Nine identical
 * `@Header('Cache-Control', 'no-store')` lines below carry the exact same guarantee `@Header`
 * would have carried at class level — every response, success or error, from every one of the
 * nine routes.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly emailVerification: EmailVerificationService,
    private readonly sessions: SessionService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: AUTH_ROUTE_THROTTLES.register })
  @ApiOperation({
    summary: 'Register a new account.',
    description:
      'Always 202, body-less — the response never reveals whether the address already existed ' +
      '(§6.2 anti-enumeration). A verification e-posta is sent for a genuinely new address; a ' +
      'known UNVERIFIED address gets a fresh code (cooldown permitting); a known ACTIVE address ' +
      'gets an "account exists" notice; DISABLED/PENDING_DELETION sends nothing.',
  })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'DTO şekli, profil matrisi, parola veya ilçe↔il uyuşmazlığı.',
  })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: 'errors.auth.rateLimited — IP ekseni tavanı (route-level @Throttle) aşıldı.',
  })
  async register(@Body() dto: RegisterRequestDto): Promise<void> {
    await this.registration.register(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: AUTH_ROUTE_THROTTLES.verifyEmail })
  @ApiOperation({
    summary: 'Confirm a 6-digit e-posta doğrulama kodu and open a session.',
    description:
      'Correct code → 200 + a fresh token pair, exactly like login. Wrong/expired/consumed all ' +
      'answer the same 400.',
  })
  @ApiOkResponse({ type: AuthResultDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'errors.verify.codeInvalid — yanlış, süresi geçmiş ya da tüketilmiş kod.',
  })
  @ApiTooManyRequestsResponse({ type: ApiErrorDto })
  async verifyEmail(@Body() dto: VerifyEmailRequestDto): Promise<AuthResultDto> {
    return this.emailVerification.verify(dto.email, dto.code);
  }

  @Post('verify-email/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: AUTH_ROUTE_THROTTLES.verifyEmailResend })
  @ApiOperation({
    summary: 'Resend the verification code.',
    description:
      'Always 202, body-less, whatever the address is. A fresh code is minted only for a known ' +
      'UNVERIFIED address, and only if the cooldown/daily identity-axis limits allow it.',
  })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  async resendVerification(@Body() dto: ResendVerificationRequestDto): Promise<void> {
    await this.registration.resendVerification(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: AUTH_ROUTE_THROTTLES.login })
  @ApiOperation({
    summary: 'Log in with e-posta + parola.',
    description:
      'Unknown address and wrong password answer the SAME 401 (a real Argon2 verify runs even ' +
      'for an unknown address, to normalize timing). A correct password on an UNVERIFIED or ' +
      'disabled account answers 403 — reachable only by someone who already knows the password, ' +
      'so it is not enumeration.',
  })
  @ApiOkResponse({ type: AuthResultDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'errors.auth.invalidCredentials.' })
  @ApiForbiddenResponse({
    type: ApiErrorDto,
    description: 'errors.auth.emailNotVerified ya da errors.auth.accountDisabled.',
  })
  @ApiTooManyRequestsResponse({ type: ApiErrorDto, description: 'errors.auth.tooManyAttempts.' })
  async login(@Body() dto: LoginRequestDto): Promise<AuthResultDto> {
    return this.sessions.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: AUTH_ROUTE_THROTTLES.refresh })
  @ApiOperation({
    summary: 'Rotate a refresh token for a fresh access + refresh pair.',
    description:
      'Reused, expired, unknown or account-inactive tokens all answer the SAME 401 ' +
      '(errors.auth.sessionExpired). A reused token revokes its ENTIRE family and bumps the ' +
      "user's token_version, invalidating every live access token at once.",
  })
  @ApiOkResponse({ type: AuthResultDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto })
  async refresh(@Body() dto: RefreshRequestDto): Promise<AuthResultDto> {
    return this.sessions.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: AUTH_ROUTE_THROTTLES.logout })
  @ApiOperation({
    summary: 'Log out — revoke the presented refresh token’s whole family.',
    description: 'Always 204, even for a token this api does not recognise (indistinguishable).',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({ type: ApiErrorDto })
  async logout(@Body() dto: LogoutRequestDto): Promise<void> {
    await this.sessions.logout(dto.refreshToken);
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: AUTH_ROUTE_THROTTLES.passwordResetRequest })
  @ApiOperation({
    summary: 'Request a password-reset e-posta ("forgot password").',
    description: 'Always 202, body-less — a known and an unknown address are indistinguishable.',
  })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  async requestPasswordReset(@Body() dto: PasswordResetRequestDto): Promise<void> {
    await this.passwordReset.requestReset(dto.email);
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: AUTH_ROUTE_THROTTLES.passwordResetConfirm })
  @ApiOperation({
    summary: 'Confirm a password reset with the opaque token + a new password.',
    description:
      'Password-policy validation runs BEFORE the token is even read (the DTO decorator fires ' +
      'inside the global ValidationPipe, ahead of this handler), so a weak-password 400 never ' +
      'confirms or denies the token. Success revokes every live session and does NOT open a new ' +
      'one — the user logs in again.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description:
      'errors.register.weakPassword (checked first) ya da errors.password.resetTokenInvalid.',
  })
  async confirmPasswordReset(@Body() dto: PasswordResetConfirmDto): Promise<void> {
    await this.passwordReset.confirmReset(dto.resetToken, dto.password);
  }

  @Get('session')
  @UseGuards(AccessTokenGuard)
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'The current authenticated user — the minimum PII set (§7.3).',
    description: 'id, firstName, accountRole ONLY. No e-posta, telefon, soyad or education fields.',
  })
  @ApiOkResponse({ type: SessionDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'errors.auth.unauthenticated.' })
  async session(@CurrentUser() user: AuthenticatedUser): Promise<SessionDto> {
    return this.sessions.getCurrentSession(user.id);
  }
}
