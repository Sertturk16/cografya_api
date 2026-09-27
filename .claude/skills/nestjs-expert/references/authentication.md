# Authentication & Guards

## JWT Strategy

```typescript
// access-token.service.ts
@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly secrets: AuthSecretsProvider,
  ) {}

  mint(userId: string, tokenVersion: number): Promise<string> {
    return this.jwtService.signAsync(
      { sv: tokenVersion, typ: 'access' as const },
      {
        secret: this.secrets.getJwtSecret(),
        algorithm: 'HS256',
        issuer: AUTH_TOKEN_ISSUER,
        audience: AUTH_TOKEN_AUDIENCE,
        subject: userId,
        jwtid: randomUUID(),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );
  }

  async verify(token: string): Promise<AccessTokenPayload> {
    let decoded: Record<string, unknown>;
    try {
      decoded = await this.jwtService.verifyAsync<Record<string, unknown>>(token, {
        secret: this.secrets.getJwtSecret(),
        algorithms: ['HS256'],
        issuer: AUTH_TOKEN_ISSUER,
        audience: AUTH_TOKEN_AUDIENCE,
      });
    } catch {
      throw new AccessTokenVerificationError();
    }
    // ...then exact claim set, typ === 'access', sub a UUID v4, sv a non-negative integer
    return decoded as unknown as AccessTokenPayload;
  }
}
```

## JWT Auth Guard

```typescript
// access-token.guard.ts
import {
  createParamDecorator,
  Injectable,
  SetMetadata,
  InternalServerErrorException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AccountStatus } from './account.types';
import { AccessTokenService, type AccessTokenPayload } from './access-token.service';
import { AUTH_ERROR_KEYS } from './auth-error-keys';
import { AuthUserLookupService } from './auth-user-lookup.service';
import { AUTHENTICATED_USER_REQUEST_KEY, type AuthenticatedUser } from './authenticated-user';

type RequestWithUser = Request &
  Partial<Record<typeof AUTHENTICATED_USER_REQUEST_KEY, AuthenticatedUser>>;

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
    private readonly userLookup: AuthUserLookupService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.get<boolean>('isPublic', context.getHandler());
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.accessTokens.verify(header.slice('Bearer '.length));
    } catch {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    }

    const user = await this.userLookup.findAuthProfile(payload.sub);
    if (!user || user.status !== AccountStatus.Active || user.tokenVersion !== payload.sv) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    }
    request[AUTHENTICATED_USER_REQUEST_KEY] = { id: user.id };
    return true;
  }
}

// Public decorator
export const Public = () => SetMetadata('isPublic', true);

// CurrentUser decorator
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request[AUTHENTICATED_USER_REQUEST_KEY];
    if (!user) throw new InternalServerErrorException('@CurrentUser() without AccessTokenGuard');
    return user;
  },
);
```

## Roles Guard

```typescript
// roles.decorator.ts
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

// roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[] | undefined>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: { role: string } }>();
    return user !== undefined && roles.includes(user.role);
  }
}

// Usage
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles('admin')
@Get('admin')
adminEndpoint() {}
```

## Auth Service

```typescript
@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    private readonly accessTokens: AccessTokenService,
    private readonly passwordHasher: PasswordHasherService,
  ) {}

  async login(email: string, password: string): Promise<AuthResultDto> {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash') // select: false on the column
      .where('user.email = :email', { email })
      .getOne();
    if (!user) {
      await this.passwordHasher.verify(SYNTHETIC_TIMING_HASH, password).catch(() => false);
      throw new UnauthorizedException(AUTH_ERROR_KEYS.invalidCredentials);
    }
    if (!(await this.passwordHasher.verify(user.passwordHash, password))) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.invalidCredentials);
    }
    if (user.status === AccountStatus.Unverified) {
      throw new ForbiddenException(AUTH_ERROR_KEYS.emailNotVerified);
    }
    if (user.status !== AccountStatus.Active) {
      throw new ForbiddenException(AUTH_ERROR_KEYS.accountDisabled);
    }
    return this.issueSession(user.id, user.tokenVersion);
  }

  async issueSession(userId: string, tokenVersion: number): Promise<AuthResultDto> {
    const refreshToken = mintOpaqueToken(); // opaque; only its digest is stored
    await this.sessions.insert({
      userId,
      tokenHash: sha256(refreshToken),
      // ...familyId, issuedAt, expiresAt
    });
    return {
      accessToken: await this.accessTokens.mint(userId, tokenVersion),
      accessTokenExpiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken,
      refreshTokenExpiresInSeconds: REFRESH_TOKEN_TTL_SECONDS,
    };
  }
}

@Injectable()
export class RegistrationService {
  constructor(private readonly passwordHasher: PasswordHasherService) {}

  async register(dto: RegisterRequestDto): Promise<void> {
    const passwordHash = await this.passwordHasher.hash(dto.password); // Argon2id
    await this.storePendingRegistration(dto, passwordHash); // then mails a verification code
  }
}
```

## Auth Module Setup

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session]),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthSecretsProvider,
    AccessTokenService,
    PasswordHasherService,
    SessionService,
    RegistrationService,
    AccessTokenGuard,
    AuthUserLookupService,
  ],
  exports: [AccessTokenService, AccessTokenGuard, AuthUserLookupService],
})
export class AuthModule {}
```

## Global Guard, Controller-Level Auth

```typescript
// app.module.ts
@Module({
  providers: [
    { provide: APP_GUARD, useClass: TrustedClientThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: CacheControlInterceptor },
  ],
})
export class AppModule {}

// any controller whose routes are all guarded
@UseGuards(AccessTokenGuard)
@NoTrustedClientExemption()
@ApiBearerAuth('access-token')
@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  listMine(@CurrentUser() user: AuthenticatedUser): Promise<NoteDto[]> {
    return this.notesService.listMine(user.id);
  }
}
```

**Problem:** Using Express middleware for authentication instead of Guards, losing NestJS benefits.

**Solution:** Use Guards for authentication, `@CacheControl(...)` (global `CacheControlInterceptor`) for public-read headers, and middleware only for the module's `*-no-store.middleware.ts`.

## Metadata Decorator and Interceptor

```typescript
// cache-control.decorator.ts
export const CACHE_CONTROL_METADATA = 'cache-control-header';
export const CacheControl = (value: string): MethodDecorator & ClassDecorator =>
  SetMetadata(CACHE_CONTROL_METADATA, value);

// cache-control.interceptor.ts
@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const value = this.reflector.getAllAndOverride<string | undefined>(CACHE_CONTROL_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (value === undefined) return next.handle();
    return next.handle().pipe(
      tap(() => {
        context.switchToHttp().getResponse<Response>().setHeader('Cache-Control', value);
      }),
    );
  }
}

// Usage
@CacheControl('public, max-age=300')
@Get()
findAll() {}
```

## Quick Reference

| Component | Purpose |
|-----------|---------|
| `AccessTokenService` | Validate JWT tokens |
| `AccessTokenGuard` | Protect routes |
| `RolesGuard` | Role-based access |
| `@Public()` | Skip auth |
| `@Roles('admin')` | Require role |
| `@UseGuards()` | Apply guard |
| `@CurrentUser()` | Read the authenticated caller's id |
| `CacheControlInterceptor` | Read route metadata |
| `@CacheControl('...')` | Set route metadata |
