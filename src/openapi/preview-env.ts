/**
 * Side-effect module: sets a placeholder DATABASE_URL for OpenAPI generation.
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
