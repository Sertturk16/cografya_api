import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/**
 * Builds the OpenAPI document. Single source of truth for the spec, shared by:
 *  - `main.ts` (serves it live at `/docs` for dev), and
 *  - `scripts` → `openapi:generate` (writes the committed `openapi/openapi.json`
 *    artifact that the web repo codegens types from — CONVENTIONS §3, SPEC B).
 *
 * Keeping one builder guarantees the served docs and the committed artifact can
 * never describe different contracts.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Coğrafya API')
    .setDescription('Backend API for the Coğrafya education platform.')
    .setVersion('0.0.1')
    .build();

  return SwaggerModule.createDocument(app, config);
}
