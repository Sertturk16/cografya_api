import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { INTERNAL_REQUEST_HEADER } from '../src/common/throttler/trusted-client';

// 44-char dummy secret, visible ASCII (what `env.schema.ts` requires). Not a production secret.
const TEST_INTERNAL_TOKEN = 'e2e-trusted-client-token-0123456789-abcdefgh';

/**
 * The ONE end-to-end test that pins the global rate limit's BEHAVIOUR.
 *
 * PR #67 introduced `TrustedClientThrottlerGuard` and every content suite since then injects the
 * internal token on every request — which is good fidelity to the allow path, and left the DENY
 * path untested at the HTTP layer. The guard's `shouldSkip` logic is unit-tested, but "an
 * anonymous client actually receives 429 from the running app at the configured window" was
 * asserted nowhere: the limiter could have been misconfigured, or the custom subclass could have
 * broken the base guard's counting, and nothing in CI would have said so. Rate limiting is the
 * only thing standing between a public, unauthenticated API and a scraper.
 *
 * Deliberately its OWN suite, with its own container and NO token-injecting middleware. The
 * alternative — an opt-out header in a content suite's middleware — would put an escape hatch
 * into the security harness of five other suites so that one test could use it, and it would
 * leave that suite's anonymous bucket half-consumed for whatever ran next. The cost is one extra
 * Testcontainers boot; the schema is created and nothing is seeded, because an empty
 * `/api/provinces` (a `200 []`) is all the assertions need.
 *
 * STRUCTURAL, per `CONVENTIONS.md` §2: every number comes from `THROTTLE_LIMIT` /
 * `THROTTLE_TTL_MS` in `app.module.ts`. Nothing here restates the window, so tuning the limit
 * re-points this test instead of breaking it.
 */
describe('Rate limiting (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let throttleLimit: number;
  let throttleTtlMs: number;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();

    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    // The exemption must be CONFIGURED for this suite to prove anything: with no secret set the
    // guard is fail-closed and the trusted-client assertion below would pass for the wrong reason.
    process.env.INTERNAL_REQUEST_TOKEN = TEST_INTERNAL_TOKEN;

    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();

    // Load AppModule only now — after DATABASE_URL is set — because ConfigModule.forRoot
    // validates the env eagerly at module-load time. The throttle constants ride along on the
    // same deferred require, so the assertions read the app's real configuration.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appModule = require('../src/app.module') as typeof import('../src/app.module');
    throttleLimit = appModule.THROTTLE_LIMIT;
    throttleTtlMs = appModule.THROTTLE_TTL_MS;

    const moduleRef = await Test.createTestingModule({ imports: [appModule.AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    // NOTE: no header-injecting middleware here, unlike every content suite. This suite's whole
    // subject is the ANONYMOUS path, so requests must arrive exactly as a public client's do.
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await dataSource?.destroy();
    await container?.stop();
  });

  it('sanity: the window is long enough that this suite cannot outrun it', () => {
    // The assertions below assume every request in this file lands inside ONE window. If the TTL
    // were ever shortened to seconds, the bucket could reset mid-run and the 429 assertion would
    // flake instead of failing honestly. Stated as a check rather than a comment.
    expect(throttleTtlMs).toBeGreaterThanOrEqual(30_000);
    expect(throttleLimit).toBeGreaterThan(0);
  });

  it('serves an anonymous client up to the limit, then answers 429', async () => {
    const server = app.getHttpServer();

    // Sequential on purpose: the assertion is "the Nth request is still allowed", which is only
    // meaningful if the requests are ordered. Concurrency would prove a total, not a boundary.
    for (let i = 1; i <= throttleLimit; i += 1) {
      const res = await request(server).get('/api/provinces');
      expect({ request: i, status: res.status }).toEqual({ request: i, status: 200 });
    }

    // The first request over the window. This is the whole point of the suite.
    const denied = await request(server).get('/api/provinces');
    expect(denied.status).toBe(429);
  }, 120_000);

  it('does NOT throttle the trusted first-party client, from the same exhausted client', async () => {
    // Runs after the anonymous bucket is spent, which is what makes it evidence: the exemption —
    // not a fresh counter — is what distinguishes this request. Same process, same client key,
    // same route; only the header differs.
    const res = await request(app.getHttpServer())
      .get('/api/provinces')
      .set(INTERNAL_REQUEST_HEADER, TEST_INTERNAL_TOKEN);

    expect(res.status).toBe(200);
  });

  it('rejects a WRONG token exactly like an anonymous client', async () => {
    // Fail-closed: presenting a token is not what grants the exemption, matching it is. A near
    // miss must not buy a single extra request.
    const res = await request(app.getHttpServer())
      .get('/api/provinces')
      .set(INTERNAL_REQUEST_HEADER, `${TEST_INTERNAL_TOKEN}-wrong`);

    expect(res.status).toBe(429);
  });

  it('keeps /health exempt even after the window is exhausted', async () => {
    // `@SkipThrottle()` is honoured by the inherited `canActivate`, NOT by the `super.shouldSkip()`
    // call in our subclass (see the guard's docblock — in @nestjs/throttler 6.5.0 the base
    // `shouldSkip` is literally `return false`). That is a subtlety a future refactor could break
    // silently, and a liveness probe answering 429 takes an instance out of the load balancer.
    const res = await request(app.getHttpServer()).get('/health');

    expect(res.status).toBe(200);
  });
});
