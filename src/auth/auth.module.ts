import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessTokenGuard } from './access-token.guard';
import { AccessTokenService } from './access-token.service';
import { AuthController } from './auth.controller';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthSecretsProvider } from './auth-secrets.provider';
import { AuthRateLimit } from './entities/auth-rate-limit.entity';
import { EmailVerificationCode } from './entities/email-verification-code.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { Session } from './entities/session.entity';
import { User } from './entities/user.entity';
import { EmailVerificationService } from './email-verification.service';
import { MAILER_PORT } from './mail/mailer.port';
import { NoopMailerAdapter } from './mail/noop-mailer.adapter';
import { PasswordHasherService } from './password-hasher.service';
import { PasswordResetService } from './password-reset.service';
import { RegistrationService } from './registration.service';
import { SessionService } from './session.service';

/**
 * Authentication PRIMITIVES (UYELIK-02 PR-1) plus the nine ENDPOINTS, the access-token guard and
 * the four request-handling services (PR-2). `AuthController` is registered; the module has a
 * route now.
 *
 * **`JwtModule.register({})` carries no module-level secret on purpose** — see
 * `AccessTokenService`'s own docblock for why the secret is passed explicitly per
 * `sign`/`verify` call instead of through `JwtModule.registerAsync`'s factory injection.
 *
 * **`MAILER_PORT` resolves to `NoopMailerAdapter`, the only adapter this turn** —
 * `MAIL_TRANSPORT` (§11) has exactly one valid value (`'noop'`) until a real provider is
 * chosen; the factory shape (a `switch` keyed on the env value) is what a second transport
 * extends, not a class swap here.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Session,
      EmailVerificationCode,
      PasswordResetToken,
      AuthRateLimit,
    ]),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    PasswordHasherService,
    AuthSecretsProvider,
    AccessTokenService,
    AuthRateLimitService,
    { provide: MAILER_PORT, useClass: NoopMailerAdapter },
    AccessTokenGuard,
    RegistrationService,
    EmailVerificationService,
    SessionService,
    PasswordResetService,
  ],
  exports: [
    PasswordHasherService,
    AuthSecretsProvider,
    AccessTokenService,
    AuthRateLimitService,
    MAILER_PORT,
  ],
})
export class AuthModule {}
