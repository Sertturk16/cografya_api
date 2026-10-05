/**
 * In-container liveness probe: exits 0 when the API answers the bare `/health` (outside the `/api`
 * prefix), 1 otherwise, and prints the JSON body on success. Run by the Dockerfile's HEALTHCHECK
 * and by `deploy.yml` (`docker compose exec -T api node healthcheck.mjs`); copied to the image
 * root next to `run-migrations.cjs`.
 *
 * Plain Node with no imports, so it runs without `dist/` or `node_modules` and cannot fail on a
 * broken build for a reason other than the server not answering.
 */
const port = process.env.PORT ?? '3001';

try {
  const res = await fetch(`http://127.0.0.1:${port}/health`, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) {
    console.error(`health: HTTP ${res.status}`);
    process.exit(1);
  }
  process.stdout.write(`${await res.text()}\n`);
} catch (error) {
  console.error(`health: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
