import { type INestApplication, RequestMethod } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { MARINE_CACHE_AGE_HEADER } from '../marine/marine-cache-age.interceptor';

/** Global route prefix for all content endpoints (Atlas ruling, PR-1a). */
export const GLOBAL_API_PREFIX = 'api';

/**
 * The browser-facing CORS option shape: only the configured web origin, and **no credentials**
 * until cookie auth exists (`ENGINEERING.md` §3.1 — CORS and credentials are revisited together
 * when auth cookies land).
 *
 * **Why this is a function here rather than an inline object at one call site** (`CODE136-I5`):
 * `test/auth-security.e2e-spec.ts`'s S4 asserted that no auth route ever answers a preflight with
 * `Access-Control-Allow-Credentials`, and the assertion could not fail under any change — the
 * e2e application never called `enableCors` at all, so there was nothing to emit the header. A
 * check that cannot fail is worse than no check, because it counts as coverage. The e2e bootstrap
 * now installs CORS from THIS definition, so S4 measures a real layer built from the real option
 * shape.
 *
 * **`CODE136-I5-FOLLOWUP` is CLOSED, by this SEC84-P1 change.** `src/main.ts` now calls
 * `buildCorsOptions(configService.get('WEB_ORIGIN', ...))` instead of constructing its own inline
 * copy, so runtime and e2e read the same one definition — the drift this docblock used to record
 * as a known, deliberate limit can no longer happen. The CORS posture itself is UNCHANGED: same
 * allowlist (one origin), `credentials: false` until cookie auth lands, same exposed header. This
 * PR touches `main.ts` for an unrelated reason (the proxy-trust and `/docs`-gate wiring), which is
 * exactly the trigger this docblock said would close it ("the next PR that may touch that file").
 */
export function buildCorsOptions(webOrigin: string): CorsOptions {
  return {
    origin: webOrigin,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: false,
    // Custom response headers are invisible to browser JavaScript unless they are exposed.
    // `X-Marine-Cache-Age` carries only an integer age (no PII, no provider detail, no key).
    exposedHeaders: [MARINE_CACHE_AGE_HEADER],
  };
}

/**
 * Applies the global `/api` prefix, keeping `/health` bare (the conventional
 * probe path, deliberately outside the versioned surface). Shared by `main.ts`
 * (runtime routes) and the OpenAPI generator (committed spec) so the spec's
 * paths always match the paths the app actually serves.
 */
export function applyGlobalPrefix(app: INestApplication): void {
  app.setGlobalPrefix(GLOBAL_API_PREFIX, {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
}

/**
 * SEC84-P1 — sets Express's own `trust proxy` to a BOUNDED hop count (`TRUSTED_PROXY_HOPS`,
 * schema-bound to `{0, 1}`) — never the boolean `true`, which would make `X-Forwarded-For`
 * caller-controlled at any depth. Shared between `main.ts` (runtime) and the e2e bootstrap that
 * measures it (`test/throttle.e2e-spec.ts` E-3a/E-3b), the same shape `applyGlobalPrefix` and
 * `buildCorsOptions` already use — a setting that exists only in `main.ts` cannot be measured by
 * any test in this repo (`CODE136-I5`).
 *
 * **The precondition this setting rests on, and it holds ONLY at `hops === 1`.** A bounded single
 * trusted hop is sound ONLY because the api is not reachable except through the single L7
 * terminator (`DEC 2026-08-26o`). If that ingress restriction is ever lifted, `hops` must go back
 * to `0` in the SAME change — a directly reachable api with one trusted hop hands every caller a
 * self-declared identity, and this setting cannot detect that from inside the process. `0` (the
 * schema default) reproduces today's behaviour EXACTLY: `req.ip` is the raw socket peer and no
 * request header can influence it, so a deployment that forgets the terminator degrades to one
 * shared bucket rather than to a forgeable one.
 *
 * **That last sentence names no gate of its own — recorded here rather than left implicit
 * (VALH139-M1).** No test in this repo runs `applyProxyTrust` at `hops = 0` against a forged
 * `X-Forwarded-For` header; `test/throttle.e2e-spec.ts` E-3a/E-3b run only at `hops = 1` (the
 * deployed value, `DEC 2026-08-26o`), and `0` is exercised only at the schema level
 * (`env.schema.spec.ts`'s "defaults to 0" case, no Express involved). The property is protected
 * COMPOSITELY rather than directly: any regression class that would make `0` behave like a
 * caller-controlled `X-Forwarded-For` — passing the boolean `true` instead of the numeric `hops`,
 * or an off-by-one in the numeric predicate — changes the SAME code path that also decides
 * `hops = 1`'s behaviour, and E-3b's own assertion (the rightmost `X-Forwarded-For` entry wins,
 * not the caller-supplied leftmost one) already fails under exactly those mutations. This was
 * measured, not assumed: passing `true` here makes E-3b read the spoofed leftmost address instead
 * of the real rightmost one, turning that assertion red.
 *
 * `(app as NestExpressApplication).set('trust proxy', hops)` is the documented Nest wrapper
 * around Express's own `app.set('trust proxy', …)` — see `NestExpressApplication`'s own example.
 * No hand-rolled `X-Forwarded-For` parser is written anywhere in this repo; Express's own
 * `proxy-addr`-backed resolution is section C's whole mechanism.
 */
export function applyProxyTrust(app: INestApplication, hops: number): void {
  (app as NestExpressApplication).set('trust proxy', hops);
}
