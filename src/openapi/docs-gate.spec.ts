import { describe, expect, it, jest } from '@jest/globals';
import {
  applyDocsGate,
  buildDocsAuthMiddleware,
  DOCS_PATHS,
  resolveDocsExposure,
  type DocsAuthRequest,
  type DocsAuthResponse,
  type DocsExposure,
  type DocsGateApp,
} from './docs-gate';
import { type Env } from '../config/env.schema';

const TOKEN = 'docs-access-token-0123456789-abcdefghijkl'; // 41-char visible-ASCII stand-in (CODE139-M4: measured)

function fakeResponse(): DocsAuthResponse & { setHeader: jest.Mock; end: jest.Mock } {
  return {
    statusCode: 200,
    setHeader: jest.fn(),
    end: jest.fn(),
  };
}

function basicHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

describe('resolveDocsExposure', () => {
  const NON_PRODUCTION_ENVS: Env['NODE_ENV'][] = ['development', 'test'];

  it.each(NON_PRODUCTION_ENVS)('is "open" outside production regardless of the token (NODE_ENV=%s)', (nodeEnv) => {
    expect(resolveDocsExposure(nodeEnv, undefined)).toBe('open');
    expect(resolveDocsExposure(nodeEnv, TOKEN)).toBe('open');
  });

  it('is "off" in production with no token configured — fail-closed by construction', () => {
    expect(resolveDocsExposure('production', undefined)).toBe('off');
    expect(resolveDocsExposure('production', '')).toBe('off');
  });

  it('is "gated" in production with a token configured', () => {
    expect(resolveDocsExposure('production', TOKEN)).toBe('gated');
  });
});

describe('buildDocsAuthMiddleware', () => {
  it('answers 401 with WWW-Authenticate and does NOT call next when Authorization is absent', () => {
    const req: DocsAuthRequest = { headers: {} };
    const res = fakeResponse();
    const next = jest.fn();

    buildDocsAuthMiddleware(TOKEN)(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Basic realm="cografya-api docs", charset="UTF-8"',
    );
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it('answers 401 on a Bearer scheme (wrong scheme, not Basic)', () => {
    const req: DocsAuthRequest = { headers: { authorization: `Bearer ${TOKEN}` } };
    const res = fakeResponse();
    const next = jest.fn();

    buildDocsAuthMiddleware(TOKEN)(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('answers 401 on the correct scheme with the WRONG password', () => {
    const req: DocsAuthRequest = { headers: { authorization: basicHeader('docs', 'wrong-password') } };
    const res = fakeResponse();
    const next = jest.fn();

    buildDocsAuthMiddleware(TOKEN)(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('answers 401 on malformed base64', () => {
    const req: DocsAuthRequest = { headers: { authorization: 'Basic %%%not-base64%%%' } };
    const res = fakeResponse();
    const next = jest.fn();

    buildDocsAuthMiddleware(TOKEN)(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('answers 401 when the decoded value carries no colon', () => {
    const req: DocsAuthRequest = {
      headers: { authorization: `Basic ${Buffer.from('no-colon-here', 'utf8').toString('base64')}` },
    };
    const res = fakeResponse();
    const next = jest.fn();

    buildDocsAuthMiddleware(TOKEN)(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() exactly once and writes no status when the password matches (username ignored)', () => {
    const req: DocsAuthRequest = { headers: { authorization: basicHeader('anyone', TOKEN) } };
    const res = fakeResponse();
    const next = jest.fn();

    buildDocsAuthMiddleware(TOKEN)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });
});

/**
 * VAL139-SD8 — the mounting decision `src/main.ts` used to inline, now measurable: this is the
 * gate that catches `else if (docsExposure === 'open')` silently becoming a plain `else` (which
 * would mount Swagger UNGATED in the 'off' case). `app.use` is a bare recorder, never a real
 * Nest/Express app, so this needs no Testcontainers boot — the decision under test is pure glue,
 * not I/O.
 */
describe('applyDocsGate', () => {
  function fakeApp(): DocsGateApp & { useCalls: Array<readonly string[]> } {
    const useCalls: Array<readonly string[]> = [];
    return {
      useCalls,
      use: (paths) => {
        useCalls.push(paths);
      },
    };
  }

  it("'gated' with a token: mounts the auth middleware on DOCS_PATHS, then calls setupSwagger", () => {
    const app = fakeApp();
    const setupSwagger = jest.fn();

    applyDocsGate(app, 'gated', TOKEN, setupSwagger);

    expect(app.useCalls).toEqual([DOCS_PATHS]);
    expect(setupSwagger).toHaveBeenCalledTimes(1);
  });

  it("'open': calls setupSwagger and mounts NO auth middleware", () => {
    const app = fakeApp();
    const setupSwagger = jest.fn();

    applyDocsGate(app, 'open', undefined, setupSwagger);

    expect(app.useCalls).toEqual([]);
    expect(setupSwagger).toHaveBeenCalledTimes(1);
  });

  it("'off': calls setupSwagger NEVER and mounts NO auth middleware — the fail-closed branch this extraction exists to protect", () => {
    const app = fakeApp();
    const setupSwagger = jest.fn();

    applyDocsGate(app, 'off', undefined, setupSwagger);

    expect(app.useCalls).toEqual([]);
    expect(setupSwagger).not.toHaveBeenCalled();
  });

  it("'gated' with NO token (defensively impossible via resolveDocsExposure, guarded anyway): behaves like 'off'", () => {
    const app = fakeApp();
    const setupSwagger = jest.fn();

    applyDocsGate(app, 'gated', undefined, setupSwagger);

    expect(app.useCalls).toEqual([]);
    expect(setupSwagger).not.toHaveBeenCalled();
  });

  it.each<DocsExposure>(['gated', 'open', 'off'])(
    'exhaustiveness: every DocsExposure value is handled explicitly (%s)',
    (docsExposure) => {
      const app = fakeApp();
      expect(() => applyDocsGate(app, docsExposure, TOKEN, jest.fn())).not.toThrow();
    },
  );
});
