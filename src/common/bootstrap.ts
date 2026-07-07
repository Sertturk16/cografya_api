import { type INestApplication, RequestMethod } from '@nestjs/common';

/** Global route prefix for all content endpoints (Atlas ruling, PR-1a). */
export const GLOBAL_API_PREFIX = 'api';

/**
 * Applies the global `/api` prefix, keeping `/health` bare (the conventional
 * probe path, deliberately outside the versioned surface). Shared by `main.ts`
 * (runtime routes) and the OpenAPI generator (committed spec) so the spec's
 * paths always match the paths the app actually serves.
 */
export function applyGlobalPrefix(app: INestApplication): void {
  app.setGlobalPrefix(GLOBAL_API_PREFIX, {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
}
