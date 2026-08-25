import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessTokenGuard } from './access-token.guard';
import { AccessTokenService } from './access-token.service';
import { AuthNoStoreMiddleware } from './auth-no-store.middleware';
import { AuthController } from './auth.controller';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthSecretsProvider } from './auth-secrets.provider';
import { AuthRateLimit } from './entities/auth-rate-limit.entity';
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
 * **Registration no longer writes a `users` row** (`SEC136-C1`): an unconfirmed registration is a
 * `pending_registrations` candidate and the account is materialized in `verify`'s transaction.
 * That entity is registered in `data-source-options.ts` rather than in `forFeature` below — see
 * the comment at the import.
 *
 * **`MAILER_PORT` resolves to `NoopMailerAdapter`, the only adapter this turn** —
 * `MAIL_TRANSPORT` (§11) has exactly one valid value (`'noop'`) until a real provider is
 * chosen; the factory shape (a `switch` keyed on the env value) is what a second transport
 * extends, not a class swap here.
 */
@Module({
  imports: [
    // `PendingRegistration` is deliberately NOT here: no class injects its repository — every
    // write to it runs inside a transaction and goes through `manager.getRepository(...)` — so a
    // `forFeature` entry would register a provider nothing resolves. The entity is registered
    // where entities belong, in `data-source-options.ts`'s explicit list.
    TypeOrmModule.forFeature([User, Session, PasswordResetToken, AuthRateLimit]),
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
export class AuthModule implements NestModule {
  /**
   * `Cache-Control: no-store` on every response that reaches Nest's module-middleware stage on a
   * `(path, method)` pair `AuthController` registers.
   *
   * Registered as MIDDLEWARE rather than as nine `@Header` decorators because middleware runs
   * before guards, and it was the guard-rejected 401/429 responses that were measurably leaving
   * without the header (`CODE136-I2`, `TA136-I1`). `forRoutes(AuthController)` binds it PER
   * (path, method) pair that controller registers — no other route's caching behaviour changes,
   * and neither does a pair this controller does NOT register: Nest's own 404 for such a pair
   * (e.g. `GET /api/auth/login`, or the bare `GET`/`POST /api/auth`) is produced without this
   * middleware running, which is the one measured gap this binding leaves — 404, unlike 400, is
   * heuristically cacheable under RFC 9110 §15.1. The one-line fix (`forRoutes({ path:
   * 'auth{/*splat}', method: RequestMethod.ALL })`) is measured and recorded as a follow-up
   * (`FU-AUTH-NOSTORE-BINDING`, PR #136 round 4 §6.3, Q2) rather than landed this round.
   * `AuthNoStoreMiddleware`'s own docblock carries the full mechanism and every class it cannot
   * reach, stated once so it never needs to be counted again (`VAL136R3-NS1`).
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthNoStoreMiddleware).forRoutes(AuthController);
  }
}
