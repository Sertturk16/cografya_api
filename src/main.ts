import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { applyGlobalPrefix, applyProxyTrust, buildCorsOptions } from './common/bootstrap';
import { AppModule } from './app.module';
import { type Env } from './config/env.schema';
import { buildOpenApiDocument } from './openapi/build-document';
import { applyDocsGate, resolveDocsExposure } from './openapi/docs-gate';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get<ConfigService<Env, true>>(ConfigService);

  // Baseline HTTP hardening. CSP is intentionally left OFF: this service serves
  // JSON, not HTML pages, for its public content routes — CSP protects the
  // browser-rendered web app, which is the separate `cografya_web` repo's concern.
  // The one HTML surface here, Swagger UI at /docs, is NOT dev-only (CODE139-I1/
  // SEC139-M6): since SEC84-P1 it answers in production too, behind HTTP Basic
  // auth when DOCS_ACCESS_TOKEN is set (applyDocsGate below / docs-gate.ts), and
  // is not mounted at all when it is unset.
  //
  // The CSP-off decision was RE-EVALUATED a SECOND time (SEC139R2-I1): the
  // previous rewrite's premise — that Swagger UI needs inline scripts helmet's
  // default CSP would block — was measured FALSE and is retracted here, not
  // repeated. Measured against the served page (`@nestjs/swagger@11.4.5`'s
  // `buildSwaggerHTML`, called with no custom `swaggerOptions`, which is exactly
  // how `applyDocsGate` below calls it): three `<script src="...">` tags to
  // same-origin files (`swagger-ui-bundle.js`, `swagger-ui-standalone-preset.js`,
  // `swagger-ui-init.js`) and ZERO inline `<script>` tags or `on*` attribute
  // handlers. `helmet@8.2.0`'s own default `script-src` is `['self']`, which
  // already permits those three same-origin files, and its default `style-src`
  // already permits the page's two inline `<style>` blocks — so the specific
  // blocker the previous sentence named does not exist.
  //
  // What stays UNMEASURED here, and is left open rather than asserted either
  // way: whether the default CSP is fully compatible with the bundled
  // `swagger-ui-dist@5.32.8` client once it runs in a browser. That bundle
  // contains one `new Function(` call and one hardcoded reference to
  // `https://validator.swagger.io` (its default spec-validator badge); CSP's
  // `script-src`/`connect-src` fall back to `default-src 'self'` when not set
  // explicitly, which would block either of those IF actually exercised on this
  // render path — but no browser render was performed in this session to settle
  // whether it is. CSP therefore stays off for the reason that survives
  // measurement — untested compatibility with this one HTML surface, not a
  // confirmed technical blocker — and enabling it is future work behind an
  // actual compatibility check, scoped to /docs, never a blanket toggle or a
  // silent default. All other helmet protections (HSTS, noSniff, frameguard,
  // …) stay on.
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
  // than a hypothetical one. The decision itself is `resolveDocsExposure`'s and the mounting
  // decision is `applyDocsGate`'s (both `src/openapi/docs-gate.ts`, unit-tested there in full —
  // VAL139-SD8: this branch used to be inlined here, where no test in this repo could reach it).
  const docsAccessToken = configService.get('DOCS_ACCESS_TOKEN', { infer: true });
  const docsExposure = resolveDocsExposure(
    configService.get('NODE_ENV', { infer: true }),
    docsAccessToken,
  );
  applyDocsGate(app, docsExposure, docsAccessToken, () => {
    SwaggerModule.setup('docs', app, document);
  });

  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  // Surface boot failures (e.g. env validation) loudly and exit non-zero.
  console.error('Failed to bootstrap the application:', error);
  process.exit(1);
});
