import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { AccountStatus } from './account.types';
import { AccessTokenService, type AccessTokenPayload } from './access-token.service';
import { AUTH_ERROR_KEYS } from './auth-error-keys';
import { AuthUserLookupService } from './auth-user-lookup.service';
import { AUTHENTICATED_USER_REQUEST_KEY, type AuthenticatedUser } from './authenticated-user';

const BEARER_PREFIX = 'Bearer ';

type RequestWithAuthenticatedUser = Request &
  Partial<Record<typeof AUTHENTICATED_USER_REQUEST_KEY, AuthenticatedUser>>;

/**
 * D14's six steps, in this exact order — opt-in (`@UseGuards(AccessTokenGuard)`), never global
 * (D8). Every reject branch throws the SAME `errors.auth.unauthenticated` 401, so a caller can
 * never distinguish "no header" from "bad signature" from "account disabled" from "reused
 * token_version" by response shape.
 *
 * **Step 2 does not re-verify anything `AccessTokenService.verify` already does.** Signature,
 * algorithm, issuer, audience, expiry, the closed claim set and `typ === 'access'` are ALL that
 * service's job (§2.1) — this guard trusts its result completely rather than re-checking any of
 * it, because a second independent copy of the same rule is the exact class of bug two prior
 * reviews already paid for (D14's own note).
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly userLookup: AuthUserLookupService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuthenticatedUser>();

    // Step 1 — Authorization header present and exactly `Bearer <token>`. No other carrier
    // (cookie, query string, custom header) is ever accepted (D3).
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    }
    const token = header.slice(BEARER_PREFIX.length);
    if (token.length === 0) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    }

    // Step 2 — delegate entirely to AccessTokenService.verify (§2.1).
    let payload: AccessTokenPayload;
    try {
      payload = await this.accessTokens.verify(token);
    } catch {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    }

    // Step 3 — one indexed PK read, minimal columns (delegated to AuthUserLookupService so this
    // guard's cross-module dependency is a narrow-purpose service, never the raw Repository<User>).
    const user = await this.userLookup.findAuthProfile(payload.sub);
    if (!user) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    }

    // Step 4 — status must be ACTIVE. 401, never 403: a caller must not be able to read the
    // account's status off this response (roadmap §4's "doğrulanmamış hesap protected session
    // alamaz", the token-level half — login's 403 is the other half, §6.1).
    if (user.status !== AccountStatus.Active) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    }

    // Step 5 — token_version must match the claim exactly. This is what makes reuse detection
    // (§5.2.3) and password reset (§5.4.3) actually invalidate a live access token instead of
    // waiting out its 15-minute TTL.
    if (user.tokenVersion !== payload.sv) {
      throw new UnauthorizedException(AUTH_ERROR_KEYS.unauthenticated);
    }

    // Step 6 — attach ONLY the id. No other field ever reaches a handler through this path.
    request[AUTHENTICATED_USER_REQUEST_KEY] = { id: user.id };
    return true;
  }
}
