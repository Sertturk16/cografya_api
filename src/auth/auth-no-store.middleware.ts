import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** The one value this middleware writes, and the header it writes it to. */
export const NO_STORE_CACHE_CONTROL = 'no-store';

/**
 * `AuthNoStoreMiddleware`'s guarantee, restated as a MECHANISM rather than a count round 3 got
 * wrong three times running (`VAL136R3-NS1`, PR #136 round 4): **every response that reaches
 * Nest's module-middleware stage on a `(path, method)` pair `AuthController` registers carries
 * `Cache-Control: no-store` — handler, pipe, guard, throttler and exception filter alike. Nothing
 * answered BEFORE that stage carries it (the responses Express's body parser produces, and the
 * preflight the `cors` package answers itself), and nothing on an UNREGISTERED `(path, method)`
 * pair under `/api/auth` carries it: Nest's 404 for such a pair is produced without this
 * middleware running, and 404 — unlike 400 — is heuristically cacheable under RFC 9110 §15.1.**
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
 * below, and it was rejected anyway: `Owner's Inbox/uyelik-ve-giris-yol-haritasi/UYELIK-02-plan.md`
 * §6.3 and `DEC 2026-08-25h` R3 rule that this api writes no global exception filter (`ENGINEERING.md`
 * §6 is the i18n content model, not this rule — the earlier citation was wrong, `VAL136R3-NSP1`), and
 * piercing a settled design rule to place one header is out of proportion to what that header buys
 * here. The RFC bound below is the reason it is out of proportion.
 *
 * ## The classes this cannot cover, stated exactly rather than papered over — and never counted
 * A count is what got this wrong three rounds running: the right description is the MECHANISM
 * ("a response answered before this middleware's stage can never carry a header this middleware
 * writes"), not an enumeration of examples, because a third member (Nest's own unregistered-route
 * 404, above) kept surviving every enumerated list.
 *
 * **Class 1 — a response Express's body parser produces**, before `NestApplication.init()`
 * applies any module middleware (`registerParserMiddleware()` runs ahead of `registerModules()`).
 * A malformed JSON body is the one this suite exercises (N9b), but the class is the MECHANISM, not
 * that one example: an over-limit body and an unsupported content encoding answer the same way,
 * for the same reason (`SEC136R3-M1`). No arrangement of module middleware can change any of it
 * while `src/main.ts` — the only place the parser could be reconfigured — is frozen.
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
 * **Class 3 — Nest's own 404 for an unregistered `(path, method)` pair under `/api/auth`.**
 * `forRoutes(AuthController)` binds this middleware to the PAIRS that controller registers, not to
 * the whole `/api/auth` prefix, so a request under the prefix that names no registered pair (e.g.
 * `GET /api/auth/login`, or the bare `GET`/`POST /api/auth`) is answered by Nest's router without
 * this middleware ever running — measured directly against the installed framework, PR #136 round
 * 4 §6.2, and pinned negatively by N9d/N9e. Unlike the first two classes this one is NOT answered
 * before the middleware stage for a structural reason outside this application's control — it is
 * simply never routed to this controller — but the observable effect is the same: no header.
 * Binding the middleware to the whole prefix instead of the controller class would close this
 * class; that one-line change is measured and recorded as a follow-up (`FU-AUTH-NOSTORE-BINDING`)
 * rather than landed this round, because this round's charter is closing regressions, not adding
 * behaviour (PR #136 round 4, Q2).
 *
 * The residual exposure is bounded and stated at the boundary it actually holds, not argued away.
 * The malformed-JSON 400's body carries neither token nor PII, and RFC 9110 §15.1 already excludes
 * 400 (like 401 and 429) from the heuristically cacheable set for a compliant intermediary — a
 * real leak needs a non-conforming one. A CORS preflight is bounded by RFC 9110 §9.3.7 itself:
 * "Responses to the OPTIONS method are not cacheable" — not by an argument about its empty body,
 * which is not a rule and would not bound a status that IS heuristically cacheable (`logout`'s 204
 * is one). This application additionally sends no `Access-Control-Max-Age`, so nothing here
 * invites an intermediary to retain the preflight at all (`SEC136R3-M2`). Nest's unregistered-route
 * 404 is bounded the same way §15.1 bounds it for the covered controller's OWN routes: 404 IS
 * heuristically cacheable, which is exactly why Class 3 above is worth a follow-up rather than a
 * shrug. So the guarantee this middleware offers is deliberately stated as *"every response that
 * reaches Nest's module-middleware stage on a `(path, method)` pair `AuthController` registers"*,
 * not *"every byte a client can ever receive from `/api/auth`"*, and
 * `test/auth-security.e2e-spec.ts` pins every boundary from BOTH sides — the covered classes
 * assert the header is present, N9b asserts it absent on the body-parser 400, N9c asserts it
 * absent on a CORS preflight, and N9d/N9e assert it absent on Class 3's two unregistered pairs —
 * so the day any boundary moves the suite says so instead of drifting.
 */
@Injectable()
export class AuthNoStoreMiddleware implements NestMiddleware {
  use(_request: Request, response: Response, next: NextFunction): void {
    response.setHeader('Cache-Control', NO_STORE_CACHE_CONTROL);
    next();
  }
}
