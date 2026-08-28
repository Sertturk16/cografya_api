import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** The one value this middleware writes, and the header it writes it to. */
export const MEASUREMENTS_NO_STORE_CACHE_CONTROL = 'no-store';

/**
 * `Cache-Control: no-store` on every response `MeasurementsController`'s five routes produce —
 * all five return or persist per-user geometry/coordinate data behind auth (plan §5.11's
 * personal-data flag: "which measurements a specific user has drawn and saved" is a
 * KVKK-adjacent personal-data surface), so a shared or intermediary cache must never retain any
 * of them.
 *
 * Registered as MIDDLEWARE, not a `@Header()` decorator, for the exact reason
 * `FavoritesNoStoreMiddleware`/`GameRoundsNoStoreMiddleware` are: Nest awaits every guard's
 * `canActivate` BEFORE it applies a route's `@Header` decorators, so a guard-rejected response
 * (this controller's own 401 from `AccessTokenGuard`) would leave without the header under the
 * decorator form. Middleware runs BEFORE guards, so one registration covers the guard-rejected
 * paths too.
 *
 * Deliberately its OWN class rather than a reuse of a sibling middleware — this repo's
 * established discipline is that each controller gets its own copy rather than importing a
 * docblock this route does not honour. The mechanism is otherwise identical:
 * `forRoutes(MeasurementsController)` binds this one exactly the way the sibling middleware binds
 * its own controller, in `MeasurementsModule.configure()`.
 */
@Injectable()
export class MeasurementsNoStoreMiddleware implements NestMiddleware {
  use(_request: Request, response: Response, next: NextFunction): void {
    response.setHeader('Cache-Control', MEASUREMENTS_NO_STORE_CACHE_CONTROL);
    next();
  }
}
