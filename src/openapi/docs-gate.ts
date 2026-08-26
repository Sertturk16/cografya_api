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
