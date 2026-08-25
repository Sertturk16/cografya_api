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
 * ## The ONE class this cannot cover, stated exactly rather than papered over
 * A malformed JSON body is rejected by Express's body parser, which `NestApplication.init()`
 * registers (`registerParserMiddleware()`) BEFORE it applies any module middleware
 * (`registerModules()`). That 400 therefore leaves without this header, and no arrangement of
 * module middleware can change it while `src/main.ts` — the only place the parser could be
 * reconfigured — is frozen.
 *
 * The residual exposure is bounded and was measured against the specification rather than
 * assumed: RFC 9110 §15.1 and RFC 9111 §3 make 400 (like 401 and 429) NOT heuristically
 * cacheable — a shared cache may only store it under an explicit freshness directive, which
 * nothing here sends. A real leak needs a non-conforming intermediary, and the body carries
 * neither token nor PII. So the guarantee this class offers is deliberately stated as *"every
 * response this application produces for an auth route"*, not *"every byte a client can ever
 * receive from one"*, and `test/auth-security.e2e-spec.ts` pins that boundary from BOTH sides —
 * the covered classes assert the header is present, and the body-parser 400 asserts it is absent,
 * so the day the boundary moves the suite says so instead of drifting.
 */
@Injectable()
export class AuthNoStoreMiddleware implements NestMiddleware {
  use(_request: Request, response: Response, next: NextFunction): void {
    response.setHeader('Cache-Control', NO_STORE_CACHE_CONTROL);
    next();
  }
}
