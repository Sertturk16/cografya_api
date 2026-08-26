import { type Env } from '../config/env.schema';
import { constantTimeTokenMatch } from '../common/security/constant-time-token';

/**
 * SEC84-P1 — gates `/docs` (Swagger UI + `/docs-json` + `/docs-yaml`) in production, closing
 * `src/main.ts`'s former `TODO(first-deploy)`. Kept in its own module (not `main.ts`) so the
 * decision is unit-testable: the e2e bootstrap builds its app with
 * `moduleRef.createNestApplication()` and never runs `main.ts`, so a decision that lived only
 * there could never be measured by any test in this repo.
 *
 * **This surface did not exist before the api went public** (`DEC 2026-08-26m`): a dev-only
 * instance had no reason to hide its own spec. Going public makes it live.
 */

/**
 * `app.use('/docs', mw)` matches `/docs`, `/docs/` and every `/docs/*` static asset, and does
 * NOT match `/docs-json` — which is why all three literal paths are listed here (measured against
 * `@nestjs/swagger@11.4.5`'s `SwaggerModule.setup`: with no options, `raw` defaults to `true` so
 * BOTH `/docs-json` and `/docs-yaml` are served alongside the UI). A gate covering only `/docs`
 * would leave the full spec publicly readable at `/docs-json`.
 *
 * **No test in this repo pins this array's EXHAUSTIVENESS against what `@nestjs/swagger` itself
 * mounts (CODE139-M5).** `docs-gate.spec.ts` measures `resolveDocsExposure` and
 * `buildDocsAuthMiddleware`; neither reads this constant. A future `@nestjs/swagger` upgrade that
 * publishes a fourth default path would silently leave that path outside the gate, and CI would
 * stay green. Recorded rather than closed: closing it means asserting against the installed
 * package's own route table, which is a bigger change than this fix round's scope.
 */
export const DOCS_PATHS: readonly string[] = ['/docs', '/docs-json', '/docs-yaml'];

export type DocsExposure = 'open' | 'gated' | 'off';

/**
 * Pure decision: how `/docs` is exposed for this boot.
 *
 * - Outside production: `'open'` — mounted exactly as today, so the web repo keeps codegenning
 *   its types against a dev instance.
 * - Production with `DOCS_ACCESS_TOKEN` set: `'gated'` — mounted behind Basic auth.
 * - Production with it unset: `'off'` — `SwaggerModule.setup` must not be called at all, so
 *   every docs path 404s and the surface is not advertised. Fail-closed by construction: there is
 *   no third posture and no accidental partial mount.
 */
export function resolveDocsExposure(
  nodeEnv: Env['NODE_ENV'],
  docsAccessToken: string | undefined,
): DocsExposure {
  if (nodeEnv !== 'production') return 'open';
  return docsAccessToken !== undefined && docsAccessToken !== '' ? 'gated' : 'off';
}

/** The minimal request/response shape the middleware needs — satisfied structurally by both a
 * real Express request/response and a fake pair built in `docs-gate.spec.ts`. */
export interface DocsAuthRequest {
  readonly headers: { readonly authorization?: string };
}

export interface DocsAuthResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(): unknown;
}

export type DocsAuthNext = () => void;

const BASIC_AUTH_SCHEME = 'basic';

/**
 * Extracts the PASSWORD half of an `Authorization: Basic <base64(user:pass)>` header. The
 * username is deliberately ignored — this gate has exactly one credential, the shared token.
 *
 * Never throws: `Buffer.from(x, 'base64')` is lenient (it does not reject invalid characters), so
 * every malformed shape — wrong scheme, garbage base64, a decoded value with no colon — falls
 * through to `undefined` rather than an exception, and the caller answers a plain 401 for all of
 * them alike.
 */
function extractBasicPassword(authorizationHeader: string | undefined): string | undefined {
  if (authorizationHeader === undefined) return undefined;

  const spaceIndex = authorizationHeader.indexOf(' ');
  if (spaceIndex === -1) return undefined;

  const scheme = authorizationHeader.slice(0, spaceIndex).toLowerCase();
  if (scheme !== BASIC_AUTH_SCHEME) return undefined;

  const encoded = authorizationHeader.slice(spaceIndex + 1).trim();
  if (encoded.length === 0) return undefined;

  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const colonIndex = decoded.indexOf(':');
  if (colonIndex === -1) return undefined;

  return decoded.slice(colonIndex + 1);
}

/**
 * HTTP Basic auth for the gated `/docs` surface. Chosen over a query parameter (which lands in
 * proxy logs and browser history) and over a custom header (which a human in a browser cannot
 * set): Basic is the smallest thing that works for both a browser and `curl`.
 *
 * Failure answers `401` with `WWW-Authenticate: Basic realm="cografya-api docs",
 * charset="UTF-8"`, an EMPTY body, no log line and never the presented value. Success calls
 * `next()` exactly once and writes no status of its own.
 *
 * **Deliberately outside the global throttler AND deliberately silent on every failed attempt —
 * both are decisions, not gaps (SEC139-M5).** This middleware runs as `app.use(...)`, mounted
 * BEFORE Nest's own request pipeline, so `TrustedClientThrottlerGuard` (an `APP_GUARD`, which
 * only sees Nest routes) never sees it; a brute-force attempt against the token is not rate
 * limited. The remedy judged here is the DOCUMENTATION branch only, not a log line, for two
 * reasons: first, the surface this credential protects is already world-readable regardless —
 * `openapi/openapi.json` is committed in this repo, which is public — so a successful guess buys
 * nothing a `git clone` does not already give away; second, a WARN per failed attempt on an
 * UNTHROTTLED public path is itself a flood and disk-fill vector, which is a worse failure mode
 * than the one it would report, and the once-per-process-per-reason pattern this repo uses
 * elsewhere (`TrustedClientThrottlerGuard`) would give it zero brute-force detection value: every
 * attempt after the first would be silenced anyway. A genuine brute-force defence here would mean
 * putting an actual rate limit on this path, which is a larger change than this fix round's
 * scope.
 */
export function buildDocsAuthMiddleware(
  token: string,
): (req: DocsAuthRequest, res: DocsAuthResponse, next: DocsAuthNext) => void {
  return (req, res, next): void => {
    const presentedPassword = extractBasicPassword(req.headers.authorization);
    if (presentedPassword !== undefined && constantTimeTokenMatch(presentedPassword, token)) {
      next();
      return;
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="cografya-api docs", charset="UTF-8"');
    res.statusCode = 401;
    res.end();
  };
}

/** The minimal app shape {@link applyDocsGate} needs — a real `INestApplication` satisfies this
 * structurally (its `use` method is a strict superset), so no `@nestjs/common` import is needed
 * here, and `docs-gate.spec.ts` can pass a plain object with no real Nest app or Testcontainers
 * boot required. */
export interface DocsGateApp {
  use(
    paths: readonly string[],
    middleware: (req: DocsAuthRequest, res: DocsAuthResponse, next: DocsAuthNext) => void,
  ): unknown;
}

/**
 * VAL139-SD8 — the mounting decision `src/main.ts` used to inline as a three-way `if`/`else
 * if`/(implicit else), extracted so it can be MEASURED by a test in this repo, the same
 * `CODE136-I5` pattern `applyProxyTrust` / `buildCorsOptions` / `applyGlobalPrefix` already use
 * (`src/common/bootstrap.ts`). Before this extraction the branch was invisible to every test run
 * in this repo — `main.ts` is never executed by the e2e bootstrap
 * (`moduleRef.createNestApplication()`) — so an edit turning `else if (docsExposure === 'open')`
 * into a plain `else` would have called `setupSwagger` unconditionally, mounting Swagger UNGATED
 * even when `resolveDocsExposure` said `'off'`, and nothing in this repo would have turned red.
 *
 * `setupSwagger` is a caller-supplied closure rather than a direct `SwaggerModule.setup(...)`
 * call so this function needs no real `OpenAPIObject` or `@nestjs/swagger` internals to
 * unit-test — `docs-gate.spec.ts` passes a `jest.fn()` and asserts it is called (or not) for
 * each {@link DocsExposure}. The behaviour is UNCHANGED from what `main.ts` inlined: `'gated'`
 * mounts the Basic-auth middleware then calls `setupSwagger`; `'open'` calls `setupSwagger`
 * alone; `'off'` calls neither — every docs path 404s and the surface is not advertised
 * (fail-closed by construction, per `resolveDocsExposure`'s own docblock).
 */
export function applyDocsGate(
  app: DocsGateApp,
  docsExposure: DocsExposure,
  docsAccessToken: string | undefined,
  setupSwagger: () => void,
): void {
  if (docsExposure === 'gated' && docsAccessToken !== undefined) {
    app.use(DOCS_PATHS, buildDocsAuthMiddleware(docsAccessToken));
    setupSwagger();
  } else if (docsExposure === 'open') {
    setupSwagger();
  }
  // 'off' → setupSwagger is deliberately NOT called: every docs path 404s and the surface is not
  // advertised.
}
