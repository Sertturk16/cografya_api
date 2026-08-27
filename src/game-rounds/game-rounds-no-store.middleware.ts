import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** The one value this middleware writes, and the header it writes it to. */
export const GAME_ROUNDS_NO_STORE_CACHE_CONTROL = 'no-store';

/**
 * `Cache-Control: no-store` on every response `GameRoundsController`'s two routes produce — both
 * return or persist per-user data behind auth (plan §5.8's personal-data flag: "which game modes
 * a specific user played, when, and how they scored" is a KVKK-adjacent personal-data surface),
 * so a shared or intermediary cache must never retain either of them.
 *
 * Registered as MIDDLEWARE, not a `@Header()` decorator, for the exact reason
 * `FavoritesNoStoreMiddleware`/`VideoProgressNoStoreMiddleware` are: Nest awaits every guard's
 * `canActivate` BEFORE it applies a route's `@Header` decorators, so a guard-rejected response
 * (this controller's own 401 from `AccessTokenGuard`, or a 429 from the global
 * `ThrottlerGuard`) would leave without the header under the decorator form. Middleware runs
 * BEFORE guards, so one registration covers the guard-rejected paths too.
 *
 * Deliberately its OWN class rather than a reuse of a sibling middleware — this repo's
 * established discipline (`FavoritesNoStoreMiddleware`'s own docblock): each controller gets its
 * own copy because its docblock is written specifically about that controller's own registered
 * `(path, method)` pairs.
 */
@Injectable()
export class GameRoundsNoStoreMiddleware implements NestMiddleware {
  use(_request: Request, response: Response, next: NextFunction): void {
    response.setHeader('Cache-Control', GAME_ROUNDS_NO_STORE_CACHE_CONTROL);
    next();
  }
}
