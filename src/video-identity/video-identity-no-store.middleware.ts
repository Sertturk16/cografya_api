import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** The one value this middleware writes, and the header it writes it to. */
export const VIDEO_IDENTITY_NO_STORE_CACHE_CONTROL = 'no-store';

/**
 * `Cache-Control: no-store` on every response `VideoIdentityController`'s one route produces —
 * the response is gated on an `Authorization` header check, so a shared or intermediary cache must
 * never retain it (mirrors `VideoProgressNoStoreMiddleware`'s own reasoning, UYELIK-05).
 *
 * Registered as MIDDLEWARE, not a `@Header()` decorator, for the exact reason
 * `VideoProgressNoStoreMiddleware` is (`CODE136-I2`/`TA136-I1`): Nest awaits every guard's
 * `canActivate` BEFORE it applies a route's `@Header` decorators, so a guard-rejected response —
 * this controller's own 401 from `AccessTokenGuard`, or a 429 from the global `ThrottlerGuard` —
 * would leave without the header under the decorator form. Middleware runs BEFORE guards, so one
 * registration covers the guard-rejected paths too.
 *
 * Deliberately its OWN class rather than a reuse of `VideoProgressNoStoreMiddleware`: that class's
 * docblock is written specifically about `VideoProgressController`'s own registered routes and
 * carries its own gap-class analysis — none of that belongs to this controller, and importing the
 * class would import a docblock this route does not honour. The mechanism is otherwise identical.
 */
@Injectable()
export class VideoIdentityNoStoreMiddleware implements NestMiddleware {
  use(_request: Request, response: Response, next: NextFunction): void {
    response.setHeader('Cache-Control', VIDEO_IDENTITY_NO_STORE_CACHE_CONTROL);
    next();
  }
}
