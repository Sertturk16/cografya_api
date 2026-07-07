// IMPORTANT: this side-effect import MUST come first — it sets a placeholder
// DATABASE_URL before AppModule (and its eager env validation) is loaded.
import './preview-env';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { applyGlobalPrefix } from '../common/bootstrap';
import { buildOpenApiDocument } from './build-document';

/**
 * Emits the committed OpenAPI artifact (`openapi/openapi.json`).
 *
 * Run against the COMPILED build (`node dist/openapi/generate-openapi.js`) — see
 * the `openapi:generate` script. It boots the app in PREVIEW mode: the full
 * module graph is built (so every route + DTO schema is discovered) but no
 * provider is instantiated, so TypeORM never connects to a database. That makes
 * spec generation a pure, side-effect-free, DB-free operation — ideal for the CI
 * drift gate.
 *
 * `abortOnError: false` makes any init error reject this promise (surfaced +
 * logged below) instead of Nest's default silent `process.exit(1)` teardown.
 */
const OUTPUT_DIR = join(process.cwd(), 'openapi');
const OUTPUT_FILE = join(OUTPUT_DIR, 'openapi.json');

async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
    abortOnError: false,
  });
  applyGlobalPrefix(app);

  const document = buildOpenApiDocument(app);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  // Trailing newline keeps the file POSIX-clean and diff-friendly.
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  await app.close();
  console.log(`OpenAPI spec written to ${OUTPUT_FILE}`);
}

generate().catch((error: unknown) => {
  console.error('Failed to generate the OpenAPI spec:', error);
  // Use exitCode (not process.exit) so buffered stdio flushes before exit.
  process.exitCode = 1;
});
