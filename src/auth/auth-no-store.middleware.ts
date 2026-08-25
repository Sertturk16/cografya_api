import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** The one value this middleware writes, and the header it writes it to. */
export const NO_STORE_CACHE_CONTROL = 'no-store';

/**
 * Writes `Cache-Control: no-store` on EVERY response leaving `AuthController`, whatever produced
 * it — handler, pipe, guard or the throttler.
 *
 * ## Why this is a middleware and not the nine `@Header` decorators it replaces (D13, amended)
 * D13 chose `@Header('Cache-Control', 'no-store')` per method and its docblock claimed that
 * carried the guarantee for "every response, success or error". The PR #136 review measured that
 * claim false against the installed framework: `router-execution-context.js` awaits
 * `fnCanActivate` (every guard) BEFORE it calls `setHeaders`, so a guard that throws leaves the
 * header unwritten. Two whole response classes were affected — `AccessTokenGuard`'s 401 on
 * `GET /api/auth/session`, and `ThrottlerGuard`'s 429 on all nine routes (`CODE136-I2`,
 * `TA136-I1`).
 *
 * Middleware runs BEFORE guards in Nest's request lifecycle, so one registration covers what nine
 * decorators could not. The decorators are gone rather than kept alongside it: two mechanisms for
 * one guarantee is how a docblock ends up describing the weaker of the two.
 *
 * **Rejected alternative — a global exception filter.** It would also catch the body-parser class
 * below, and it was rejected anyway: `ENGINEERING.md` §6 and plan §6.3 rule that this api writes
 * no global exception filter, and piercing a settled design rule to place one header is out of
 * proportion to what that header buys here. The RFC bound is the reason it is out of proportion —
 * see below.
 *
 * ## The TWO classes this cannot cover, stated exactly rather than papered over
 * **Class 1 — a malformed JSON body.** Rejected by Express's body parser, which
 * `NestApplication.init()` registers (`registerParserMiddleware()`) BEFORE it applies any module
 * middleware (`registerModules()`). That 400 therefore leaves without this header, and no
 * arrangement of module middleware can change it while `src/main.ts` — the only place the parser
 * could be reconfigured — is frozen.
 *
 * **Class 2 — a CORS preflight `OPTIONS` request (PR #136 round 3, `CODE136R2-I4`).** Two
 * INDEPENDENT causes, both measured against the installed framework rather than assumed:
 *  1. `cors@2.8.6` (`lib/index.js`) answers a preflight itself — `res.statusCode =
 *     optionsSuccessStatus; res.setHeader('Content-Length', '0'); res.end()` — and never calls
 *     `next()` (`preflightContinue` defaults to `false`, and `buildCorsOptions` sets neither
 *     option). `ExpressAdapter.enableCors` registers this at the APPLICATION level via `app.use`,
 *     ahead of any module middleware.
 *  2. Independently of (1): `@nestjs/core`'s `MiddlewareModule.registerHandler` binds each route's
 *     middleware to that route's OWN declared HTTP method and calls `next()` — skipping the
 *     middleware entirely — whenever the incoming request's method does not match. Every
 *     `AuthController` handler is `POST` or `GET`; an `OPTIONS` request never matches any of them,
 *     so this middleware would never run for it even if (1) did not already end the response
 *     first.
 *
 * Both classes are responses that leave BEFORE any module middleware runs, for reasons this
 * middleware — or any module middleware — is structurally unable to change.
 *
 * The residual exposure is bounded and stated at the boundary it actually holds, not argued away.
 * The malformed-JSON 400's body carries neither token nor PII, and RFC 9110 §15.1 / RFC 9111 §3
 * already put 400 (like 401 and 429) outside the heuristically cacheable set for a compliant
 * intermediary — a real leak needs a non-conforming one. A CORS preflight 204's body is EMPTY —
 * there is nothing in it to cache — and this application sends no `Access-Control-Max-Age`, so
 * nothing here invites an intermediary to retain the response at all. So the guarantee this class
 * offers is deliberately stated as *"every response this application produces for an auth
 * route"*, not *"every byte a client can ever receive from one"*, and
 * `test/auth-security.e2e-spec.ts` pins BOTH boundaries from BOTH sides — the covered classes
 * assert the header is present, N9b asserts it absent on the body-parser 400, and N9c asserts it
 * absent on a CORS preflight — so the day either boundary moves the suite says so instead of
 * drifting.
 */
@Injectable()
export class AuthNoStoreMiddleware implements NestMiddleware {
  use(_request: Request, response: Response, next: NextFunction): void {
    response.setHeader('Cache-Control', NO_STORE_CACHE_CONTROL);
    next();
  }
}
