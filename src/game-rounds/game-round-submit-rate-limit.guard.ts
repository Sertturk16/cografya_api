import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { AUTHENTICATED_USER_REQUEST_KEY, type AuthenticatedUser } from '../auth/authenticated-user';
import { GAME_ROUNDS_ERROR_KEYS } from './game-rounds-error-keys';
import { GameRoundSubmitRateLimitService } from './game-round-submit-rate-limit.service';

type RequestWithAuthenticatedUser = Request &
  Partial<Record<typeof AUTHENTICATED_USER_REQUEST_KEY, AuthenticatedUser>>;

/**
 * Route-level guard on `POST /api/game-rounds` ONLY (UYELIK-09 fix-round-2, `SEC145-I1`/
 * `VAL145-I1`) — never registered on `GET /api/game-rounds`, which is a read and creates no row.
 *
 * **Must be chained AFTER `AccessTokenGuard`: `@UseGuards(AccessTokenGuard,
 * GameRoundSubmitRateLimitGuard)`, in that exact order.** `GuardsConsumer.tryActivate` runs
 * guards sequentially, in declaration order, awaiting each one before the next runs (measured
 * directly against the installed `@nestjs/core` source — `145-remedy-validation-SEC145-I1.json`,
 * REMEDY QUESTION 2) — so `AccessTokenGuard` has fully populated
 * `request[AUTHENTICATED_USER_REQUEST_KEY]` (or already thrown 401 and short-circuited the chain)
 * by the time this guard's `canActivate` runs. This is NOT true of the global `APP_GUARD`
 * throttler (`TrustedClientThrottlerGuard`), which is keyed on IP-derived identity precisely
 * because it runs with no authenticated user in scope at all — the reason a second, userId-keyed
 * guard is needed here rather than tightening that one (`SEC145-I1`'s own finding).
 *
 * No interaction with `@NoTrustedClientExemption()` (read only by `TrustedClientThrottlerGuard`,
 * a different, independent guard on a different axis) or with `GameRoundsNoStoreMiddleware`
 * (Express middleware, which runs before every guard regardless of how many are chained, so the
 * `Cache-Control: no-store` header this guard's own 429 needs is already applied — no separate
 * wiring here).
 */
@Injectable()
export class GameRoundSubmitRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimiter: GameRoundSubmitRateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuthenticatedUser>();
    const user = request[AUTHENTICATED_USER_REQUEST_KEY];
    if (!user) {
      // Unreachable when this guard is wired per its own docblock (chained after
      // AccessTokenGuard, which always populates this or throws first) — a fail-closed guard
      // against a future miswiring, mirroring `@CurrentUser()`'s own posture for the identical
      // situation rather than silently treating a missing user as "not yet rate-limited".
      throw new InternalServerErrorException(
        'GameRoundSubmitRateLimitGuard ran with no authenticatedUser — check guard order ' +
          '(AccessTokenGuard must run first).',
      );
    }

    const outcome = await this.rateLimiter.consume(user.id);
    if (!outcome.allowed) {
      throw new HttpException(
        GAME_ROUNDS_ERROR_KEYS.tooManySubmissions,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
