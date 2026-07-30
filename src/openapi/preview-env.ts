/**
 * Side-effect module: sets the placeholder environment OpenAPI generation needs.
 *
 * MUST be imported before `AppModule`, because `ConfigModule.forRoot({ validate })`
 * validates the environment EAGERLY at module-load time — i.e. the moment
 * `AppModule` is imported, before `NestFactory.create` even runs. Kept in its
 * own module and imported first (import evaluation is ordered) so this ordering
 * is explicit and survives import hoisting.
 *
 * The spec generator boots in preview mode and never opens a DB connection, so
 * this value is never used to connect — it only satisfies the (required, valid)
 * DATABASE_URL zod check so the module graph can load for metadata scanning.
 */
process.env.DATABASE_URL ??= 'postgresql://openapi:openapi@localhost:5432/openapi';

/**
 * `NODE_ENV` lost its default when the E1 production gate was hardened (a gate keyed on a
 * variable a deployment can omit is not a gate). This generator is a BUILD-TIME tool that boots
 * the module graph purely to scan metadata — it has no environment of its own, and CI runs it
 * without one. `development` is the honest label for a process that never serves a request, and
 * it keeps the spec byte-identical to a local run.
 */
process.env.NODE_ENV ??= 'development';
