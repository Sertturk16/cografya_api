import { beforeAll, describe, expect, it } from '@jest/globals';
import {
  type CanActivate,
  Controller,
  Delete,
  Get,
  Injectable,
  Post,
  Put,
  RequestMethod,
  UseGuards,
} from '@nestjs/common';
import {
  CONTROLLER_WATERMARK,
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { MetadataScanner } from '@nestjs/core';
import { ApiBearerAuth, DECORATORS } from '@nestjs/swagger';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  NO_TRUSTED_CLIENT_EXEMPTION,
  NoTrustedClientExemption,
} from '../common/throttler/throttler-metadata';
import { AccessTokenGuard } from './access-token.guard';

/**
 * Auth is opt-in (no global guard), so a forgotten decorator fails open: the route answers
 * anonymously and nothing errors. `@CurrentUser()` throwing 500 catches only handlers that read
 * the user. This spec closes the rest from the decorator metadata alone, no app and no database:
 *
 * - every route is guarded by `AccessTokenGuard` (class or method level) or listed in
 *   {@link PUBLIC_ROUTES}, and that list names exactly the routes that are public;
 * - a controller whose routes are all guarded declares the guard once, on the class, so a route
 *   added to it later is guarded without anyone remembering to;
 * - a guarded route also resolves `@NoTrustedClientExemption()` and
 *   `@ApiBearerAuth('access-token')`, and never repeats a class-level guard (it would run twice).
 *
 * Controllers are discovered, not listed: every non-spec `.ts` file under `src/` with a top-level
 * `@Controller(` decorator is imported and its exported controller classes are walked with the
 * same `MetadataScanner` the Nest router uses.
 */

/**
 * Every route that answers WITHOUT `AccessTokenGuard`, on purpose. Global prefix omitted. A new
 * public route is added here in the same PR, so the decision is visible in review.
 */
const PUBLIC_ROUTES: readonly string[] = [
  'GET /air-quality/index-system',
  'GET /air-quality/provinces',
  'GET /air-quality/provinces/:plateCode',
  'POST /auth/login',
  'POST /auth/logout',
  'POST /auth/password-reset/confirm',
  'POST /auth/password-reset/request',
  'POST /auth/password-reset/verify',
  'POST /auth/refresh',
  'POST /auth/register',
  'POST /auth/verify-email',
  'POST /auth/verify-email/resend',
  'GET /books',
  'GET /books/:slug',
  'GET /countries',
  'GET /countries/:slug',
  'GET /countries/map-summary',
  'GET /earthquakes',
  'GET /earthquakes/meta',
  'GET /earthquakes/provinces/:plateCode',
  'GET /elevation/profile',
  'GET /health',
  'GET /marine/layers',
  'GET /marine/overview',
  'GET /marine/points',
  'GET /marine/points/:slug/conditions',
  'GET /marine/provinces/:plateCode/conditions',
  'GET /provinces',
  'GET /provinces/:slug',
  'GET /provinces/map-summary',
  'GET /reference/departments',
  'GET /reference/districts',
  'GET /reference/universities',
  'GET /regions',
  'GET /regions/:slug',
  'GET /video-cover/:bookVideoId',
];

const SRC = join(__dirname, '..');
const ROOT = join(SRC, '..');
const CONTROLLER_DECORATOR = /^@Controller\(/m;
const BEARER_SCHEME = 'access-token';

interface ControllerClass {
  readonly name: string;
  readonly prototype: object;
}

interface RouteAudit {
  /** Neither guarded nor allow-listed: what a forgotten decorator leaves public. */
  unguarded: string[];
  /** Allow-listed but guarded or no longer served: the list must stay exact. */
  staleAllowList: string[];
  /** Controllers whose routes are all guarded at method level only. */
  methodLevelOnly: string[];
  /** Routes that repeat the class-level `AccessTokenGuard`. */
  repeatedGuard: string[];
  /** Guarded routes without the exemption opt-out or the bearer security requirement. */
  missingCompanions: string[];
}

function metadata(key: string, target: object): unknown {
  return Reflect.getMetadata(key, target) as unknown;
}

function guardsOf(target: object): unknown[] {
  const guards = metadata(GUARDS_METADATA, target);
  return Array.isArray(guards) ? guards : [];
}

function pathsOf(target: object): string[] {
  const path = metadata(PATH_METADATA, target);
  if (Array.isArray(path)) return path.map(String);
  return typeof path === 'string' ? [path] : [];
}

function hasBearerSecurity(target: object): boolean {
  const security = metadata(DECORATORS.API_SECURITY, target);
  return (
    Array.isArray(security) &&
    security.some((entry) => typeof entry === 'object' && entry !== null && BEARER_SCHEME in entry)
  );
}

function routeKeys(controller: ControllerClass, handler: object): string[] {
  const verb = RequestMethod[metadata(METHOD_METADATA, handler) as RequestMethod];
  return pathsOf(controller).flatMap((base) =>
    pathsOf(handler).map((path) => {
      const joined = `/${base}/${path}`.replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
      return `${verb} ${joined}`;
    }),
  );
}

function auditRoutes(
  controllers: readonly ControllerClass[],
  publicRoutes: readonly string[],
): RouteAudit {
  const audit: RouteAudit = {
    unguarded: [],
    staleAllowList: [],
    methodLevelOnly: [],
    repeatedGuard: [],
    missingCompanions: [],
  };
  const allowed = new Set(publicRoutes);
  const unguardedSeen = new Set<string>();
  const scanner = new MetadataScanner();

  for (const controller of controllers) {
    const classGuarded = guardsOf(controller).includes(AccessTokenGuard);
    const handlers = scanner
      .getAllMethodNames(controller.prototype)
      .map((name) => (controller.prototype as Record<string, unknown>)[name])
      .filter(
        (handler): handler is object =>
          typeof handler === 'function' && metadata(PATH_METADATA, handler) !== undefined,
      );
    let methodGuardedCount = 0;

    for (const handler of handlers) {
      const methodGuarded = guardsOf(handler).includes(AccessTokenGuard);
      const keys = routeKeys(controller, handler);
      if (methodGuarded) methodGuardedCount += 1;
      if (classGuarded && methodGuarded) audit.repeatedGuard.push(...keys);

      if (!classGuarded && !methodGuarded) {
        for (const key of keys) {
          unguardedSeen.add(key);
          if (!allowed.has(key)) audit.unguarded.push(key);
        }
        continue;
      }
      const optedOut =
        metadata(NO_TRUSTED_CLIENT_EXEMPTION, handler) === true ||
        metadata(NO_TRUSTED_CLIENT_EXEMPTION, controller) === true;
      if (!optedOut || !(hasBearerSecurity(handler) || hasBearerSecurity(controller))) {
        audit.missingCompanions.push(...keys);
      }
    }

    if (!classGuarded && handlers.length > 0 && methodGuardedCount === handlers.length) {
      audit.methodLevelOnly.push(controller.name);
    }
  }

  audit.staleAllowList = publicRoutes.filter((key) => !unguardedSeen.has(key));
  return audit;
}

function controllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return controllerFiles(path);
    if (!entry.name.endsWith('.ts') || /\.(spec|d)\.ts$/.test(entry.name)) return [];
    return CONTROLLER_DECORATOR.test(readFileSync(path, 'utf8')) ? [path] : [];
  });
}

function isController(value: unknown): value is ControllerClass {
  return typeof value === 'function' && metadata(CONTROLLER_WATERMARK, value) === true;
}

describe('AccessTokenGuard coverage', () => {
  const byFile = new Map<string, ControllerClass[]>();
  let controllers: ControllerClass[] = [];

  beforeAll(async () => {
    for (const file of controllerFiles(SRC)) {
      const exported = (await import(file)) as Record<string, unknown>;
      byFile.set(relative(ROOT, file), Object.values(exported).filter(isController));
    }
    controllers = [...byFile.values()].flat();
  });

  it('finds at least one exported controller in every file that declares one', () => {
    expect(byFile.size).toBeGreaterThan(0);
    const empty = [...byFile].filter(([, found]) => found.length === 0).map(([file]) => file);
    expect(empty).toEqual([]);
  });

  it('guards every route or lists it as public, and keeps the public list exact', () => {
    const audit = auditRoutes(controllers, PUBLIC_ROUTES);
    expect(audit.unguarded).toEqual([]);
    expect(audit.staleAllowList).toEqual([]);
  });

  it('puts the guard on the class when every route of a controller is guarded', () => {
    const audit = auditRoutes(controllers, PUBLIC_ROUTES);
    expect(audit.methodLevelOnly).toEqual([]);
    expect(audit.repeatedGuard).toEqual([]);
  });

  it('pairs every guarded route with the exemption opt-out and the bearer scheme', () => {
    expect(auditRoutes(controllers, PUBLIC_ROUTES).missingCompanions).toEqual([]);
  });

  describe('negative controls (probe controllers, never registered anywhere)', () => {
    @Injectable()
    class UnrelatedGuard implements CanActivate {
      canActivate(): boolean {
        return true;
      }
    }

    @Controller('probe-mixed')
    class MixedProbeController {
      @Get()
      forgotten(): void {}

      @Get('flagged')
      @UseGuards(UnrelatedGuard)
      otherGuardOnly(): void {}

      @Post()
      @UseGuards(AccessTokenGuard)
      @NoTrustedClientExemption()
      @ApiBearerAuth(BEARER_SCHEME)
      guarded(): void {}
    }

    @Controller('probe-class')
    @UseGuards(AccessTokenGuard)
    @NoTrustedClientExemption()
    @ApiBearerAuth(BEARER_SCHEME)
    class ClassGuardedProbeController {
      @Get()
      addedLater(): void {}

      @Delete()
      @UseGuards(AccessTokenGuard)
      doubleGuarded(): void {}
    }

    @Controller('probe-method')
    class MethodGuardedProbeController {
      @Get()
      @UseGuards(AccessTokenGuard)
      @NoTrustedClientExemption()
      @ApiBearerAuth(BEARER_SCHEME)
      read(): void {}

      @Put()
      @UseGuards(AccessTokenGuard)
      @NoTrustedClientExemption()
      write(): void {}
    }

    const audit = auditRoutes(
      [MixedProbeController, ClassGuardedProbeController, MethodGuardedProbeController],
      ['GET /probe-mixed/flagged', 'GET /probe-class', 'GET /probe-gone'],
    );

    it('reports an undecorated route, and does not count another guard as auth', () => {
      expect(audit.unguarded).toEqual(['GET /probe-mixed']);
      expect(
        auditRoutes([MixedProbeController], []).unguarded.sort((a, b) => a.localeCompare(b)),
      ).toEqual(['GET /probe-mixed', 'GET /probe-mixed/flagged']);
    });

    it('covers a route added to a class-guarded controller without any decorator', () => {
      expect(audit.unguarded).not.toContain('GET /probe-class');
    });

    it('reports allow-list entries that are guarded or no longer served', () => {
      expect(audit.staleAllowList).toEqual(['GET /probe-class', 'GET /probe-gone']);
    });

    it('reports a fully guarded controller that guards per route, and a repeated guard', () => {
      expect(audit.methodLevelOnly).toEqual(['MethodGuardedProbeController']);
      expect(audit.repeatedGuard).toEqual(['DELETE /probe-class']);
    });

    it('reports a guarded route without the bearer scheme', () => {
      expect(audit.missingCompanions).toEqual(['PUT /probe-method']);
    });
  });
});
