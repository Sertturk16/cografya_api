import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { applyGlobalPrefix, applyProxyTrust, buildCorsOptions } from './common/bootstrap';
import { AppModule } from './app.module';
import { type Env } from './config/env.schema';
import { buildOpenApiDocument } from './openapi/build-document';
import { buildDocsAuthMiddleware, DOCS_PATHS, resolveDocsExposure } from './openapi/docs-gate';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get<ConfigService<Env, true>>(ConfigService);

  // Baseline HTTP hardening. CSP is intentionally left OFF: this service serves
  // JSON, not HTML pages — CSP protects the browser-rendered web app, which is
  // the separate `cografya_web` repo's concern. The only HTML surface here is
  // the dev-only Swagger UI at /docs, which needs inline scripts. All other
  // helmet protections (HSTS, noSniff, frameguard, …) stay on.
  app.use(helmet({ contentSecurityPolicy: false }));

  // SEC84-P1 — the PEER axis of the visitor-scoped throttle tracker. Bounded to {0, 1} by the
  // env schema; sound at 1 ONLY because the api is not reachable except through the single
  // trusted L7 terminator (`DEC 2026-08-26o`). See `applyProxyTrust`'s own docblock for the full
  // precondition, and `visitor-tracker.ts` for the forwarded axis this is deliberately separate
  // from.
  applyProxyTrust(app, configService.get('TRUSTED_PROXY_HOPS', { infer: true }));

  // CORS — a deliberate posture, not an access control on a public api (`ENGINEERING.md` §3.1).
  // It protects BROWSER users of other origins; no browser calls this api on any route today
  // (measured, SEC84-P1 plan "Observed current mechanism" item 9). Widening it (extra origins,
  // `credentials: true`) is a decision that lands with cookie auth, not a default.
  // `buildCorsOptions` is now the single definition runtime and e2e both read — closing
  // `CODE136-I5-FOLLOWUP`, which `bootstrap.ts`'s own docblock queued for "the next PR that may
  // touch this file".
  app.enableCors(buildCorsOptions(configService.get('WEB_ORIGIN', { infer: true })));

  // Global `/api` prefix for content endpoints; `/health` stays bare.
  applyGlobalPrefix(app);

  // Baseline input safety: whitelist DTO properties, reject unknown ones, and
  // transform payloads to their DTO types. Applied globally from day one so
  // every future write endpoint is guarded by default.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // OpenAPI document — the api is the single source of truth for the shared
  // DTO/type contract; the web repo codegens its types from the committed
  // `openapi/openapi.json` artifact, which is generated from this same builder.
  const document = buildOpenApiDocument(app);

  // SEC84-P1 — `/docs` (Swagger UI + `/docs-json` + `/docs-yaml`) is OPEN outside production (the
  // web repo keeps codegenning its types against a dev instance), GATED behind HTTP Basic auth in
  // production when `DOCS_ACCESS_TOKEN` is set, and NOT MOUNTED AT ALL in production when it is
  // unset — fail-closed by construction. This closes the `TODO(first-deploy)` this call site used
  // to carry: going public (`DEC 2026-08-26m`) made the full API surface a real exposure rather
  // than a hypothetical one. The decision itself is `resolveDocsExposure`'s
  // (`src/openapi/docs-gate.ts`), unit-tested there in full; this is only the wiring, and the
  // auth middleware is mounted BEFORE `SwaggerModule.setup` so it runs first on every docs path.
  const docsAccessToken = configService.get('DOCS_ACCESS_TOKEN', { infer: true });
  const docsExposure = resolveDocsExposure(
    configService.get('NODE_ENV', { infer: true }),
    docsAccessToken,
  );
  if (docsExposure === 'gated' && docsAccessToken !== undefined) {
    app.use(DOCS_PATHS, buildDocsAuthMiddleware(docsAccessToken));
    SwaggerModule.setup('docs', app, document);
  } else if (docsExposure === 'open') {
    SwaggerModule.setup('docs', app, document);
  }
  // 'off' → SwaggerModule.setup is deliberately NOT called: every docs path 404s and the surface
  // is not advertised.

  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  // Surface boot failures (e.g. env validation) loudly and exit non-zero.
  console.error('Failed to bootstrap the application:', error);
  process.exit(1);
});
