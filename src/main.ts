import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { applyGlobalPrefix } from './common/bootstrap';
import { AppModule } from './app.module';
import { type Env } from './config/env.schema';
import { MARINE_CACHE_AGE_HEADER } from './marine/marine-cache-age.interceptor';
import { buildOpenApiDocument } from './openapi/build-document';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get<ConfigService<Env, true>>(ConfigService);

  // Baseline HTTP hardening. CSP is intentionally left OFF: this service serves
  // JSON, not HTML pages — CSP protects the browser-rendered web app, which is
  // the separate `cografya_web` repo's concern. The only HTML surface here is
  // the dev-only Swagger UI at /docs, which needs inline scripts. All other
  // helmet protections (HSTS, noSniff, frameguard, …) stay on.
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS: only the configured web origin may call the API from a browser. No
  // credentials (no cookie auth yet); revisit when auth cookies are introduced.
  app.enableCors({
    origin: configService.get('WEB_ORIGIN', { infer: true }),
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: false,
    // Custom response headers are invisible to browser JavaScript unless they are exposed.
    // `X-Marine-Cache-Age` carries only an integer age (no PII, no provider detail, no key), and
    // a marine widget that wants to say "veri N dakika önce" would otherwise read `undefined`
    // with nothing to explain why.
    exposedHeaders: [MARINE_CACHE_AGE_HEADER],
  });

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
  // TODO(first-deploy): gate `/docs` (Swagger UI + OpenAPI JSON) behind a
  // non-production check before the first real deployment — the full API
  // surface must not be publicly browsable in prod. Left ungated for now so the
  // web repo can codegen its types against a local/dev instance.
  SwaggerModule.setup('docs', app, document);

  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  // Surface boot failures (e.g. env validation) loudly and exit non-zero.
  console.error('Failed to bootstrap the application:', error);
  process.exit(1);
});
