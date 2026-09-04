import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';
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
import { AUTH_ERROR_KEYS } from './auth-error-keys';
import {
  NoTrustedClientExemption,
  ThrottlerErrorMessage,
} from '../common/throttler/throttler-metadata';
import { AuthenticatedUser } from './authenticated-user';
import { CurrentUser } from './current-user.decorator';
import { AuthResultDto } from './dto/auth-result.dto';
import { LoginRequestDto } from './dto/login-request.dto';
import { LogoutRequestDto } from './dto/logout-request.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { ProfileDto } from './dto/profile.dto';
import { RefreshRequestDto } from './dto/refresh-request.dto';
import { RegisterRequestDto } from './dto/register-request.dto';
import { ResendVerificationRequestDto } from './dto/resend-verification-request.dto';
import { SessionDto } from './dto/session.dto';
import { UpdateProfileRequestDto } from './dto/update-profile-request.dto';
import { VerifyEmailRequestDto } from './dto/verify-email-request.dto';
import { EmailVerificationService } from './email-verification.service';
import { PasswordResetService } from './password-reset.service';
import { ProfileService } from './profile.service';
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
 * **SEC84-P1 — the tracked identity is no longer simply "per socket".** It is the PEER identity —
 * the raw socket with `TRUSTED_PROXY_HOPS=0` (the default), or the address the single trusted L7
 * terminator supplied with `TRUSTED_PROXY_HOPS=1` (`DEC 2026-08-26o`) — EXCEPT for an
 * authenticated forwarder's well-formed `x-visitor-address`, which is tracked instead
 * (`src/common/throttler/visitor-tracker.ts`). Whether either axis actually yields a PER-VISITOR
 * ceiling on these routes still depends on two things that have NOT landed: the web forwarding
 * change (Vera, later) and the deployed ingress restriction's verification. Until both land, the
 * honest claim is "per resolved identity", not "per visitor". Gate:
 * `test/throttle.e2e-spec.ts` E-1/E-2/E-3a.
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
 * **D13, AMENDED — `Cache-Control: no-store` is written by `AuthNoStoreMiddleware`, not by nine
 * `@Header` decorators.** D13's original mechanism claimed to cover "every response, success or
 * error", and the PR #136 review measured that claim false: `@Header`'s metadata is applied by
 * `setHeaders`, which `router-execution-context.js` reaches only AFTER awaiting every guard, so a
 * guard that throws never gets there. `AccessTokenGuard`'s 401 on `GET /api/auth/session` and
 * `ThrottlerGuard`'s 429 on all nine routes were both leaving without the header (`CODE136-I2`,
 * `TA136-I1`). Middleware runs before guards, so one registration in `AuthModule.configure`
 * covers what nine decorators could not; the decorators are gone rather than kept beside it,
 * because two mechanisms for one guarantee is how the weaker one ends up being the one described.
 * `@CacheControl` remains the wrong tool for the original reason (its interceptor writes only on
 * the success branch) and `src/common/http-cache/**` is still untouched (Y17).
 *
 * **The amended guarantee, restated as a MECHANISM rather than a count — acceptance criterion
 * #15 as corrected (PR #136 round 4, `VAL136R3-NS1`: the count was wrong three rounds running).**
 * *Every response that reaches Nest's module-middleware stage on a `(path, method)` pair
 * `AuthController` registers carries `Cache-Control: no-store` — handler, pipe, guard, throttler
 * and exception filter alike. Nothing answered before that stage carries it (the responses
 * Express's body parser produces, and the preflight the `cors` package answers itself), and
 * nothing on an unregistered `(path, method)` pair under `/api/auth` carries it: Nest's 404 for
 * such a pair is produced without the middleware running, and 404 — unlike 400 — is
 * heuristically cacheable under RFC 9110 §15.1.* Every one of those classes is bounded rather
 * than waved away — the malformed-JSON 400's body carries neither token nor PII and 400 is
 * outside the heuristically cacheable set; the CORS preflight is bounded by RFC 9110 §9.3.7
 * itself ("Responses to the OPTIONS method are not cacheable"); the unregistered-route 404 is
 * the one genuinely uncovered case and is recorded as a follow-up rather than closed this round
 * (`FU-AUTH-NOSTORE-BINDING`, PR #136 round 4 §6.3, Q2) — `AuthNoStoreMiddleware`'s own docblock
 * carries the full argument, including why a global exception filter was rejected:
 * `Owner's Inbox/uyelik-ve-giris-yol-haritasi/UYELIK-02-plan.md` §6.3 and `DEC 2026-08-25h` R3
 * rule this api writes none (`ENGINEERING.md` §6 is the i18n content model, not this rule — the
 * earlier citation was wrong, `VAL136R3-NSP1`).
 *
 * `test/auth-security.e2e-spec.ts` pins every boundary from both sides — present on the covered
 * classes, absent on the body-parser 400 (N9b), absent on a CORS preflight (N9c), and absent on
 * the two unregistered-pair 404s (N9d/N9e) — so the day any of them moves, the suite says so.
 *
 * **`@ThrottlerErrorMessage(AUTH_ERROR_KEYS.rateLimited)` at class level** makes the published
 * 429 contract true (`CODE136-I1`/`SEC136-I4`). The key was declared in `auth-error-keys.ts` and
 * documented on `register`'s 429, but no code path produced it: the body was
 * `@nestjs/throttler`'s English prose. The marker is read by
 * `TrustedClientThrottlerGuard.getErrorMessage` and scoped to this controller — every other
 * route in the app keeps the framework default untouched.
 */
@ApiTags('auth')
@Controller('auth')
@ThrottlerErrorMessage(AUTH_ERROR_KEYS.rateLimited)
export class AuthController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly emailVerification: EmailVerificationService,
    private readonly sessions: SessionService,
    private readonly passwordReset: PasswordResetService,
    private readonly profile: ProfileService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: AUTH_ROUTE_THROTTLES.register })
  @ApiOperation({
    summary: 'Register a new account.',
    description:
      'Always 202, body-less — the response never reveals whether the address already existed ' +
      '(§6.2 anti-enumeration). An address with no account becomes a PENDING registration and ' +
      'receives a verification e-posta; the account itself is created only when that code is ' +
      'confirmed, so submitting the same address again never overwrites an earlier submission ' +
      'and never activates one. A known ACTIVE address gets an "account exists" notice instead; ' +
      'a disabled account sends nothing.',
  })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'DTO şekli, profil matrisi, şifre veya ilçe↔il uyuşmazlığı.',
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
  @Throttle({ default: AUTH_ROUTE_THROTTLES.verifyEmail })
  @ApiOperation({
    summary: 'Confirm a 6-digit e-posta doğrulama kodu and open a session.',
    description:
      'The correct code CREATES the account from the pending registration that code belongs to, ' +
      'then answers 200 + a fresh token pair, exactly like login. Wrong, expired, ' +
      'attempt-exhausted and already-used codes all answer the same 400.',
  })
  @ApiOkResponse({ type: AuthResultDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description:
      'errors.verify.codeInvalid — yanlış, süresi geçmiş, deneme hakkı tükenmiş ya da ' +
      'kullanılmış kod.',
  })
  @ApiTooManyRequestsResponse({ type: ApiErrorDto })
  async verifyEmail(@Body() dto: VerifyEmailRequestDto): Promise<AuthResultDto> {
    return this.emailVerification.verify(dto.email, dto.code);
  }

  @Post('verify-email/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: AUTH_ROUTE_THROTTLES.verifyEmailResend })
  @ApiOperation({
    summary: 'Resend the verification code.',
    description:
      'Always 202, body-less, whatever the address is. A fresh code is issued only for an ' +
      'address that has a pending registration, and only if the cooldown/daily identity-axis ' +
      'limits allow it. Codes already in flight stay valid — a resend ADDS one, it never ' +
      'cancels an earlier one.',
  })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  async resendVerification(@Body() dto: ResendVerificationRequestDto): Promise<void> {
    await this.registration.resendVerification(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH_ROUTE_THROTTLES.login })
  @ApiOperation({
    summary: 'Log in with e-posta + şifre.',
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
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description:
      'errors.auth.tooManyAttempts — kimlik ekseni tavanı (adres başına, SessionService içinden); ' +
      'errors.auth.rateLimited — IP ekseni tavanı (route-level @Throttle + sınıf düzeyli @ThrottlerErrorMessage).',
  })
  async login(@Body() dto: LoginRequestDto): Promise<AuthResultDto> {
    return this.sessions.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH_ROUTE_THROTTLES.refresh })
  @ApiOperation({
    summary: 'Rotate a refresh token for a fresh access + refresh pair.',
    description:
      'Reused, expired, unknown or account-inactive tokens all answer the SAME 401 ' +
      '(errors.auth.sessionExpired). One just-rotated token may recover exactly once within ' +
      '15 seconds when its prior response was lost; every other reuse revokes its ENTIRE family ' +
      "and bumps the user's token_version, invalidating every live access token at once. R5 in " +
      'auth-security.e2e-spec.ts pins this bounded exception.',
  })
  @ApiOkResponse({ type: AuthResultDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto })
  async refresh(@Body() dto: RefreshRequestDto): Promise<AuthResultDto> {
    return this.sessions.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
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
  // SEC136-I3: the repo's first authenticated, PII-returning GET must not fall inside the
  // trusted-client throttle exemption, which scopes itself by HTTP METHOD and would otherwise
  // wave it through. This route carries no `@Throttle` of its own by design (plan §9.1 assigns
  // it the global 120/min) — and adding one would NOT be a substitute: `shouldSkip` returning
  // true skips every named throttler at once, route ceiling included.
  @NoTrustedClientExemption()
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

  @Get('profile')
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Read the declared education profile of the authenticated caller.',
    description:
      'Returns the caller’s declared education profile fields and isComplete derivation ' +
      '(`plan-api.md` §5.3.1, §5.3.2).',
  })
  @ApiOkResponse({ type: ProfileDto })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'errors.auth.unauthenticated.' })
  async getProfile(@CurrentUser() user: AuthenticatedUser): Promise<ProfileDto> {
    return this.profile.getProfile(user.id);
  }

  @Put('profile')
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Replace the declared education profile of the authenticated caller (full replacement).',
    description:
      'Replaces the caller’s entire declared education profile (`plan-api.md` §5.3.1, §5.3.3). ' +
      'All five keys are required; explicit null clears a field. Idempotent.',
  })
  @ApiOkResponse({ type: ProfileDto })
  @ApiBadRequestResponse({
    type: ApiErrorDto,
    description: 'Missing required key, unknown property, or profile matrix violation.',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'errors.auth.unauthenticated.' })
  async replaceProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileRequestDto,
  ): Promise<ProfileDto> {
    return this.profile.replaceProfile(user.id, dto);
  }
}
