import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** The one value this middleware writes, and the header it writes it to. */
export const VIDEO_PROGRESS_NO_STORE_CACHE_CONTROL = 'no-store';

/**
 * `Cache-Control: no-store` on every response `VideoProgressController`'s two routes produce —
 * both return or persist per-user data behind auth (plan §5.7's personal-data flag), so a shared
 * or intermediary cache must never retain either one.
 *
 * Registered as MIDDLEWARE, not a `@Header()` decorator, for the exact reason
 * `AuthNoStoreMiddleware` is (`CODE136-I2`/`TA136-I1`, PR #136): Nest awaits every guard's
 * `canActivate` BEFORE it applies a route's `@Header` decorators, so a guard-rejected response —
 * this controller's own 401 from `AccessTokenGuard`, or a 429 from the global `ThrottlerGuard` —
 * would leave without the header under the decorator form. Middleware runs BEFORE guards, so one
 * registration covers the guard-rejected paths too.
 *
 * Deliberately its OWN class rather than a reuse of `AuthNoStoreMiddleware`: that class's docblock
 * is written specifically about `AuthController`'s registered `(path, method)` pairs and carries
 * its own three measured gap classes (a body-parser response, a CORS preflight, an unregistered
 * route under `/api/auth`) — none of that analysis belongs to this controller, and importing the
 * class would import a docblock this route does not honour. The mechanism is otherwise identical:
 * `forRoutes(VideoProgressController)` binds this one exactly the way `forRoutes(AuthController)`
 * binds the other, in `VideoProgressModule.configure()`, so it carries the analogous, narrower gap
 * — a response answered before Nest's module-middleware stage (this controller's own
 * unregistered-route 404 under `/api/video-progress`) is not covered, and is not a live concern for
 * the same RFC 9110 §15.1 reasoning `AuthNoStoreMiddleware`'s docblock states in full.
 */
@Injectable()
export class VideoProgressNoStoreMiddleware implements NestMiddleware {
  use(_request: Request, response: Response, next: NextFunction): void {
    response.setHeader('Cache-Control', VIDEO_PROGRESS_NO_STORE_CACHE_CONTROL);
    next();
  }
}
