import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';

/**
 * Checks the COMMITTED contract (`openapi/openapi.json`), which CI's `openapi-check` keeps
 * byte-identical to what the decorators generate. The web codegens its types from this file, so
 * an error response without a body schema reaches the web as `content?: never`.
 */

interface ResponseObject {
  description?: string;
  content?: Record<string, { schema?: unknown }>;
}

interface OpenApiDocument {
  paths: Record<string, Record<string, { responses?: Record<string, ResponseObject> }>>;
}

const document = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'openapi', 'openapi.json'), 'utf8'),
) as OpenApiDocument;

function responses(): { route: string; status: string; response: ResponseObject }[] {
  return Object.entries(document.paths).flatMap(([path, operations]) =>
    Object.entries(operations).flatMap(([method, operation]) =>
      Object.entries(operation.responses ?? {}).map(([status, response]) => ({
        route: `${method.toUpperCase()} ${path}`,
        status,
        response,
      })),
    ),
  );
}

describe('openapi.json responses', () => {
  it('declares a JSON body schema on every non-2xx response', () => {
    const errors = responses().filter(({ status }) => !status.startsWith('2'));
    const missing = errors
      .filter(({ response }) => response.content?.['application/json']?.schema === undefined)
      .map(({ route, status }) => `${route} ${status}`);

    expect(errors.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('declares every body-less 2xx explicitly, with a description', () => {
    // A 202/204 with no body has nothing but its description. Nest also infers one from
    // `@HttpCode` alone, with an empty description, which is what an undeclared one looks like.
    const bodyless = responses().filter(
      ({ status, response }) => status.startsWith('2') && response.content === undefined,
    );
    const undescribed = bodyless
      .filter(({ response }) => !response.description?.trim())
      .map(({ route, status }) => `${route} ${status}`);

    expect(bodyless.length).toBeGreaterThan(0);
    expect(undescribed).toEqual([]);
  });
});
