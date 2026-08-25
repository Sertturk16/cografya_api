import { type INestApplication, RequestMethod } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
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
 * **Known and deliberate limit, recorded rather than left to be discovered:** `src/main.ts` is
 * frozen for this round and still constructs the same options inline, so runtime and e2e read two
 * copies of one decision. Collapsing them — `main.ts` calling this function — is a one-line change
 * queued for the next PR that may touch that file (`CODE136-I5-FOLLOWUP`). Until then this
 * function is the canonical shape and `main.ts` is the copy: a drift between them would show up as
 * S4 passing while production differs, which is a smaller hole than the one it replaces but is not
 * zero.
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
