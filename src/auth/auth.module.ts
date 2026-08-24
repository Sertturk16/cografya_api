import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessTokenService } from './access-token.service';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthSecretsProvider } from './auth-secrets.provider';
import { AuthRateLimit } from './entities/auth-rate-limit.entity';
import { EmailVerificationCode } from './entities/email-verification-code.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { Session } from './entities/session.entity';
import { User } from './entities/user.entity';
import { MAILER_PORT } from './mail/mailer.port';
import { NoopMailerAdapter } from './mail/noop-mailer.adapter';
import { PasswordHasherService } from './password-hasher.service';

/**
 * Endpoint-free authentication PRIMITIVES (UYELIK-02 PR-1): schema, crypto and rate-limit
 * machinery only. Registration/session/reset controllers, DTOs and the access-token guard
 * are PR-2's — this module has no controller and no route.
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
  providers: [
    PasswordHasherService,
    AuthSecretsProvider,
    AccessTokenService,
    AuthRateLimitService,
    { provide: MAILER_PORT, useClass: NoopMailerAdapter },
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
