import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** The one value this middleware writes, and the header it writes it to. */
export const FAVORITES_NO_STORE_CACHE_CONTROL = 'no-store';

/**
 * `Cache-Control: no-store` on every response `FavoritesController`'s five routes produce — all
 * five return or persist per-user data behind auth (plan §5.7's personal-data flag: "which places
 * a specific user favorited" is a KVKK-adjacent personal-data surface), so a shared or
 * intermediary cache must never retain any of them.
 *
 * Registered as MIDDLEWARE, not a `@Header()` decorator, for the exact reason
 * `VideoProgressNoStoreMiddleware`/`AuthNoStoreMiddleware` are (`CODE136-I2`/`TA136-I1`, PR #136):
 * Nest awaits every guard's `canActivate` BEFORE it applies a route's `@Header` decorators, so a
 * guard-rejected response — this controller's own 401 from `AccessTokenGuard`, or a 429 from the
 * global `ThrottlerGuard` — would leave without the header under the decorator form. Middleware
 * runs BEFORE guards, so one registration covers the guard-rejected paths too.
 *
 * Deliberately its OWN class rather than a reuse of `VideoProgressNoStoreMiddleware`: that class's
 * docblock is written specifically about `VideoProgressController`'s registered `(path, method)`
 * pairs — this repo's established discipline (`VideoProgressNoStoreMiddleware`'s own docblock)
 * is that each controller gets its own copy rather than importing a docblock this route does not
 * honour. The mechanism is otherwise identical: `forRoutes(FavoritesController)` binds this one
 * exactly the way the sibling middleware binds its own controller, in
 * `FavoritesModule.configure()`.
 */
@Injectable()
export class FavoritesNoStoreMiddleware implements NestMiddleware {
  use(_request: Request, response: Response, next: NextFunction): void {
    response.setHeader('Cache-Control', FAVORITES_NO_STORE_CACHE_CONTROL);
    next();
  }
}
