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
  // The CSP-off decision was RE-EVALUATED a THIRD time (SEC139R3-M1/SEC139R3-M2/
  // CODE139R3-M1/CODE139R3-M2): the previous rewrite's premise — that Swagger UI
  // needs inline scripts helmet's default CSP would block — was measured FALSE
  // in round 2 and holds on independent re-measurement here too. What this
  // round found wrong instead was the remaining-risk paragraph's OWN counts,
  // and — more importantly — its conclusion, which claimed more than either
  // count supports.
  //
  // Measured against the served page (`@nestjs/swagger@11.4.5`'s
  // `buildSwaggerHTML`, invoked with no custom `swaggerOptions` by the
  // `SwaggerModule.setup('docs', app, document)` call inside the closure
  // `applyDocsGate` runs below — not by `applyDocsGate` itself, which only
  // decides whether to run that closure): three `<script src="...">` tags to
  // same-origin files (`swagger-ui-bundle.js`, `swagger-ui-standalone-preset.js`,
  // `swagger-ui-init.js`) and ZERO inline `<script>` tags or `on*` attribute
  // handlers. `helmet@8.2.0`'s own default `script-src` is the explicit
  // `['self']`, which already permits those three same-origin files, and its
  // default `style-src` already permits the page's two inline `<style>` blocks
  // — so the specific blocker the earlier rewrite named does not exist.
  //
  // The remaining-risk paragraph named two items and both counts were wrong.
  // The served page loads two `swagger-ui-dist@5.32.8` files
  // (`swagger-ui-bundle.js`, `swagger-ui-standalone-preset.js`); each contains
  // exactly one `new Function(` call, for TWO total, not one — and both are the
  // identical webpack `globalThis` polyfill: `if("object"==typeof
  // globalThis)return globalThis;try{return this||new
  // Function("return this")()}catch(s){if("object"==typeof
  // window)return window}`. `swagger-ui-bundle.js` separately references
  // `https://validator.swagger.io/validator` THREE times, not one — two
  // `void 0===x?<default>:x` fallbacks plus the frozen default-config entry —
  // all belonging to the single `validatorUrl` default its bundled
  // `OnlineValidatorBadge` ships with. The `script-src`/`connect-src` sentence
  // in the previous version was also imprecise: `script-src` is already
  // explicit (measured above) and does not fall back to anything; only
  // `connect-src`, absent from helmet's default directive list, falls back to
  // `default-src 'self'`. None of this is pinned by a test or a type in this
  // repo — it is an observation about the installed packages' current
  // contents, not a guarantee that anything here turns red if a future
  // `swagger-ui-dist` or `@nestjs/swagger` upgrade changes it.
  //
  // Read directly rather than left open, the `new Function(` call RESOLVES,
  // and does not need a browser render to settle: `typeof globalThis ===
  // 'object'` is true in every currently shipping browser (Chrome 71+,
  // Firefox 65+, Safari 12.1+, Edge 79+ — all years old), so the branch
  // containing `new Function(` is never reached under normal execution. In a
  // browser old enough to lack `globalThis`, the call sits inside a
  // `try`/`catch` that falls back to `window` on any thrown error, so a
  // `script-src` without `'unsafe-eval'` blocking that call is caught and
  // absorbed rather than surfacing as a broken page. The `validator.swagger.io`
  // reference is a separate, `connect-src` question: if a CSP with no explicit
  // `connect-src` were ever applied here, the online-validator badge's request
  // would be blocked and the badge would fail — the page would not.
  //
  // What this measurement supports: the three objections raised against the
  // served `/docs` page across three rounds — required inline scripts, an
  // insufficient `script-src`, and a blocking `new Function(` call — are each
  // refuted, independently re-measured for the third time. What it does NOT
  // support is "therefore CSP stays off": `app.use(helmet({
  // contentSecurityPolicy: false }))` below is a GLOBAL setting, and every
  // compatibility question measured above and by the two prior rounds is
  // scoped to the one `/docs` HTML surface. Nothing measured here says
  // anything about why CSP is off on the JSON routes, where no such question
  // exists at all — the only thing that has ever carried over there is the
  // older observation that CSP is harmless on JSON, not that anything above
  // makes it necessary. CSP therefore stays off today because it has never
  // been evaluated as a global setting, not because this comment defends it as
  // one; enabling it — narrowly for /docs, more broadly, or not at all —
  // remains a separate, evidenced decision this PR does not make in either
  // direction. All other helmet protections (HSTS, noSniff, frameguard, …)
  // stay on.
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
