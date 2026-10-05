import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

const DEPLOY = read('.github/workflows/deploy.yml');
const DOCKERFILE = read('Dockerfile');

/**
 * The deploy used to `sleep 5` after `up -d api` and then run migrations, so a container that
 * never came up could still finish green. These pin the replacement: the deploy waits for the new
 * container to answer `/health` from inside, fails if it never does, and only then migrates.
 */
describe('deploy waits for a healthy api container', () => {
  it('no longer waits a fixed time', () => {
    expect(DEPLOY).not.toMatch(/^\s*sleep 5\s*$/m);
  });

  it('polls the in-image health probe inside the new container', () => {
    expect(DEPLOY).toContain('exec -T api node healthcheck.mjs </dev/null');
  });

  it('fails the deploy when the probe never succeeds', () => {
    // lastIndexOf: a comment in the script may name the same command.
    const afterUp = DEPLOY.slice(DEPLOY.lastIndexOf('up -d --no-deps api'));
    const migrate = afterUp.indexOf('node run-migrations.cjs');
    expect(migrate).toBeGreaterThan(0);
    expect(afterUp.slice(0, migrate)).toMatch(/exit 1/);
  });

  it('runs migrations only after the health wait', () => {
    const probe = DEPLOY.indexOf('exec -T api node healthcheck.mjs');
    const migrate = DEPLOY.indexOf('exec -T api node run-migrations.cjs');
    expect(probe).toBeGreaterThan(0);
    expect(migrate).toBeGreaterThan(probe);
  });

  it('never lets a `docker compose exec` read the script stdin', () => {
    // The remote script is ssh's stdin; `exec` forwards stdin into the container, so an `exec`
    // without `</dev/null` swallows every line after it and the deploy ends on that exec's exit
    // code with the remaining steps never run.
    const execLines = DEPLOY.split('\n').filter(
      (line) => !line.trim().startsWith('#') && /docker compose .*\bexec\b/.test(line),
    );
    expect(execLines.length).toBeGreaterThanOrEqual(2);
    for (const line of execLines) expect(line.trim()).toContain('</dev/null');
  });
});

describe('the image carries the probe', () => {
  it('copies healthcheck.mjs into the runner and declares a HEALTHCHECK with it', () => {
    expect(DOCKERFILE).toMatch(/COPY --from=builder \/app\/healthcheck\.mjs \.\/healthcheck\.mjs/);
    expect(DOCKERFILE).toMatch(
      /HEALTHCHECK[^\n]*\\?\s*\n?[^\n]*CMD \["node", "healthcheck\.mjs"\]/,
    );
  });
});
