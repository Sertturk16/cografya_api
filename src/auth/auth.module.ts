import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessTokenGuard } from './access-token.guard';
import { AccessTokenService } from './access-token.service';
import { AuthNoStoreMiddleware } from './auth-no-store.middleware';
import { AuthController } from './auth.controller';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthSecretsProvider } from './auth-secrets.provider';
import { AuthUserLookupService } from './auth-user-lookup.service';
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
import { ProfileService } from './profile.service';

/**
 * `Repository<User>` as its OWN dynamic module — internal wiring only, never exported. Every
 * provider in THIS module that needs `Repository<User>` (`AuthUserLookupService`,
 * `RegistrationService`, `SessionService`, `PasswordResetService`) resolves it by importing this
 * module the ordinary way; a `TypeOrmModule.forFeature` provider is only visible to modules that
 * import the SAME dynamic-module instance that declared it, which is why this exists as a named
 * constant rather than an inline `imports` entry repeated per consumer.
 *
 * **Deliberately NOT in `exports` (PR #141 round-1 review IMPORTANT finding, corrected from an
 * earlier draft that did export it).** `AccessTokenGuard` is the only thing an importer outside
 * this module ever needs, and as of UYELIK-05 it depends on `AuthUserLookupService` — a
 * narrow-purpose service exposing exactly one restricted read — rather than on this repository
 * directly. Exporting `UserRepositoryModule` too would hand every future importer of `AuthModule`
 * the full `Repository<User>` (every column, every write method), which is exactly the widened DI
 * surface that finding named.
 */
const UserRepositoryModule = TypeOrmModule.forFeature([User]);

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
    UserRepositoryModule,
    // `PendingRegistration` is deliberately NOT here: no class injects its repository — every
    // write to it runs inside a transaction and goes through `manager.getRepository(...)` — so a
    // `forFeature` entry would register a provider nothing resolves. The entity is registered
    // where entities belong, in `data-source-options.ts`'s explicit list.
    TypeOrmModule.forFeature([Session, PasswordResetToken, AuthRateLimit]),
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
    AuthUserLookupService,
    RegistrationService,
    EmailVerificationService,
    SessionService,
    PasswordResetService,
    ProfileService,
  ],
  exports: [
    PasswordHasherService,
    AuthSecretsProvider,
    AccessTokenService,
    AuthRateLimitService,
    MAILER_PORT,
    // UYELIK-05: the first consumer outside this module (VideoProgressModule) reuses the SAME
    // guard instance rather than redeclaring `AccessTokenGuard` as a second provider. Both of ITS
    // dependencies must be reachable from the importer's own resolution path — `AccessTokenService`
    // is already exported above, and `AuthUserLookupService` is exported here for the same reason
    // (NestJS instantiates a fresh `AccessTokenGuard` scoped to the CONSUMING module for
    // `@UseGuards()`, so its constructor deps must resolve from that module's own scope). Only
    // `AuthUserLookupService` — one narrow, restricted-column read method — crosses the boundary;
    // `UserRepositoryModule`/`Repository<User>` deliberately does not (PR #141 round-1 review
    // IMPORTANT finding — an earlier draft exported the raw repository instead and was corrected).
    AccessTokenGuard,
    AuthUserLookupService,
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
