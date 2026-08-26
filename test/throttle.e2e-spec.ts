import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { applyGlobalPrefix, applyProxyTrust } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import { INTERNAL_REQUEST_HEADER } from '../src/common/throttler/trusted-client';
import {
  VISITOR_ADDRESS_HEADER,
  VISITOR_FORWARD_TOKEN_HEADER,
} from '../src/common/throttler/visitor-tracker';

// 44-char dummy secret, visible ASCII (what `env.schema.ts` requires). Not a production secret.
const TEST_INTERNAL_TOKEN = 'e2e-trusted-client-token-0123456789-abcdefgh';

// SEC84-P1 — a DISTINCT 45-char visible-ASCII stand-in for VISITOR_FORWARD_TOKEN (CODE139-M4:
// measured, not copied from TEST_INTERNAL_TOKEN's comment above). Must differ from
// TEST_INTERNAL_TOKEN: the two guard different blast radii and `env.schema.ts` refuses a boot
// where they collide.
const TEST_FORWARD_TOKEN = 'e2e-visitor-forward-token-0123456789-abcdefgh';

// The peer axis under test: exactly one trusted hop, the deployed value under `DEC 2026-08-26o`.
// Fed to BOTH `process.env.TRUSTED_PROXY_HOPS` and `applyProxyTrust` directly below, so the two
// can never silently drift apart within this suite.
const TRUSTED_PROXY_HOPS = 1;

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
  let logoutThrottleLimit: number;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();

    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    // The exemption must be CONFIGURED for this suite to prove anything: with no secret set the
    // guard is fail-closed and the trusted-client assertion below would pass for the wrong reason.
    process.env.INTERNAL_REQUEST_TOKEN = TEST_INTERNAL_TOKEN;
    // SEC84-P1 — same reasoning, for the separate forwarding mechanism: with no token configured
    // the forwarded axis does not exist and every SEC84-P1 assertion below would pass for the
    // wrong reason (silently falling back to the peer axis).
    process.env.VISITOR_FORWARD_TOKEN = TEST_FORWARD_TOKEN;
    process.env.TRUSTED_PROXY_HOPS = String(TRUSTED_PROXY_HOPS);

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
    // SEC84-P1's cases run against POST /api/auth/logout (item 3 of the plan's "Observed current
    // mechanism": bucket keys include the handler name, so this is a DIFFERENT counter from the
    // /api/provinces bucket the suite above exhausts). Deferred for the same eager-validation
    // reason as `appModule` above.
    type AuthControllerModule = typeof import('../src/auth/auth.controller');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const authController = require('../src/auth/auth.controller') as AuthControllerModule;
    logoutThrottleLimit = authController.AUTH_ROUTE_THROTTLES.logout.limit;

    const moduleRef = await Test.createTestingModule({ imports: [appModule.AppModule] }).compile();
    app = moduleRef.createNestApplication();
    applyGlobalPrefix(app);
    // SEC84-P1 — the shared, runtime-used proxy-trust setup, applied here so E-3a/E-3b can
    // measure it: an assertion against a layer the test application never installed cannot go
    // red (the `CODE136-I5` lesson this repo already paid for). In this harness supertest is the
    // ONE trusted hop, exactly the position the deployed terminator occupies under
    // `DEC 2026-08-26o`.
    applyProxyTrust(app, TRUSTED_PROXY_HOPS);
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
    // A non-finite limit passes `> 0` and then makes the loop below run forever: the suite would
    // die on Jest's timeout, naming nothing. Fail here instead, on the actual cause.
    expect(Number.isFinite(throttleLimit)).toBe(true);
  });

  it('serves an anonymous client up to the limit, then answers 429', async () => {
    const server = app.getHttpServer();

    const startedAt = Date.now();

    // Sequential on purpose: the assertion is "the Nth request is still allowed", which is only
    // meaningful if the requests are ordered. Concurrency would prove a total, not a boundary.
    for (let i = 1; i <= throttleLimit; i += 1) {
      const res = await request(server).get('/api/provinces');
      expect({ request: i, status: res.status }).toEqual({ request: i, status: 200 });
    }

    // The first request over the window. This is the whole point of the suite.
    const denied = await request(server).get('/api/provinces');

    // The elapsed time rides along in the SAME assertion so an overrun self-reports. The whole
    // sequence has to land inside ONE window; if a slow machine ever stretched it past the TTL
    // the bucket would reset mid-run and this test would report "expected 429, got 200" — a
    // status defect it does not have. Asserted, the failure names its real cause instead.
    expect({
      status: denied.status,
      insideOneWindow: Date.now() - startedAt < throttleTtlMs,
    }).toEqual({ status: 429, insideOneWindow: true });
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

  /**
   * SEC84-P1 — the two-axis visitor identity, measured end to end against a real running app
   * (supertest playing both an anonymous socket AND, for E-3a/E-3b, the one trusted hop).
   * `visitor-tracker.spec.ts` and `trusted-client-throttler.guard.spec.ts` prove the RESOLUTION
   * LOGIC in isolation; this block is what proves the WIRING — a real `getTracker` override
   * actually reached by a real `ThrottlerGuard.canActivate` on a real route.
   *
   * Runs against `POST /api/auth/logout` (not `/api/provinces`, which the suite above exhausts):
   * bucket keys include the handler name (measured, SEC84-P1 plan "Observed current mechanism"
   * item 3), so this is an independent counter; `logout` answers `204` for an unknown refresh
   * token with no seeding beyond the migrations this suite already runs; and it has no
   * e-mail-axis limiter, so nothing else is consumed.
   *
   * **ORDER-DEPENDENT BY DESIGN, like the anonymous suite above — do not reorder these `it`
   * blocks.** Address fixtures are RFC 5737 documentation ranges throughout (`203.0.113.0/24`,
   * `198.51.100.0/24`), which are public-range and so behave identically under any `NODE_ENV`.
   * The bucket ledger, so a later editor can see at a glance which counter each case spends:
   *   - E-1  spends the FORWARDED buckets `203.0.113.10` and `.11`
   *   - E-2  exhausts the LOOPBACK PEER bucket (supertest's own socket; no forward token sent)
   *   - E-3a spends the PEER-VIA-TRUSTED-HOP buckets `203.0.113.30` and `.31`
   *   - E-3b re-enters `.30` and opens a fresh one at `.99`
   *   - E-4  reads the already-exhausted loopback peer bucket from E-2
   *   - E-5  reads BOTH the already-exhausted loopback peer bucket (E-2) AND the already-exhausted
   *          forwarded bucket `203.0.113.10` (E-1) — see that case's own comment for why reusing
   *          an EXHAUSTED forwarded bucket, rather than a genuinely unused address, is what makes
   *          its second assertion a clean isolation of "identity did not become bypass" rather
   *          than an ordinary fresh-visitor allow that would prove nothing about bypass at all.
   */
  describe('SEC84-P1 — visitor-scoped identity (POST /api/auth/logout)', () => {
    const logoutBody = { refreshToken: 'synthetic-unknown-token-for-throttle-probe' };

    function logoutRequest() {
      return request(app.getHttpServer()).post('/api/auth/logout').send(logoutBody);
    }

    it('E-1 — distinct forwarded identities get distinct route buckets', async () => {
      for (let i = 1; i <= logoutThrottleLimit; i += 1) {
        const res = await logoutRequest()
          .set(VISITOR_FORWARD_TOKEN_HEADER, TEST_FORWARD_TOKEN)
          .set(VISITOR_ADDRESS_HEADER, '203.0.113.10');
        expect({ request: i, status: res.status }).toEqual({ request: i, status: 204 });
      }

      const exhausted = await logoutRequest()
        .set(VISITOR_FORWARD_TOKEN_HEADER, TEST_FORWARD_TOKEN)
        .set(VISITOR_ADDRESS_HEADER, '203.0.113.10');
      expect(exhausted.status).toBe(429);

      // The whole point of the change: a DIFFERENT forwarded address, same forward token, same
      // socket, same route — gets its OWN bucket.
      const freshVisitor = await logoutRequest()
        .set(VISITOR_FORWARD_TOKEN_HEADER, TEST_FORWARD_TOKEN)
        .set(VISITOR_ADDRESS_HEADER, '203.0.113.11');
      expect(freshVisitor.status).toBe(204);
    }, 120_000);

    it('E-2 — a forged forwarding value from an UNAUTHENTICATED caller gains nothing', async () => {
      // No forward token anywhere in this case: every request lands on the PEER bucket
      // (supertest's own loopback socket), regardless of what x-visitor-address claims. This is
      // also what exhausts the shared loopback peer bucket E-4 and E-5 read below.
      let lastStatus = 0;
      for (let i = 1; i <= logoutThrottleLimit + 1; i += 1) {
        const res = await logoutRequest().set(VISITOR_ADDRESS_HEADER, `198.51.100.${i}`);
        lastStatus = res.status;
      }
      expect(lastStatus).toBe(429);

      // One more, with a WRONG forward token and yet another fresh forged address: still 429,
      // because presenting a token is not what grants forwarding, matching it is.
      const wrongToken = await logoutRequest()
        .set(VISITOR_FORWARD_TOKEN_HEADER, `${TEST_FORWARD_TOKEN}-wrong`)
        .set(VISITOR_ADDRESS_HEADER, '198.51.100.200');
      expect(wrongToken.status).toBe(429);
    }, 120_000);

    it('E-3a — distinct callers arriving through the trusted hop get distinct buckets', async () => {
      // TRUSTED_PROXY_HOPS=1: supertest plays the ONE hop the app trusts, so `x-forwarded-for`
      // resolves `req.ip` directly (this is `DEC 2026-08-26o`'s amended case 1, measured).
      for (let i = 1; i <= logoutThrottleLimit; i += 1) {
        const res = await logoutRequest().set('x-forwarded-for', '203.0.113.30');
        expect({ request: i, status: res.status }).toEqual({ request: i, status: 204 });
      }

      const exhausted = await logoutRequest().set('x-forwarded-for', '203.0.113.30');
      expect(exhausted.status).toBe(429);

      const freshHop = await logoutRequest().set('x-forwarded-for', '203.0.113.31');
      expect(freshHop.status).toBe(204);
    }, 120_000);

    it('E-3b — a forged client-supplied copy of X-Forwarded-For gains nothing', async () => {
      // The RIGHTMOST entry is authoritative under TRUSTED_PROXY_HOPS=1 (measured, §C) — the
      // forged left entry is unreachable, so `.30`'s now-exhausted bucket answers 429 regardless
      // of what is prepended.
      const prepended = await logoutRequest().set('x-forwarded-for', '198.51.100.77, 203.0.113.30');
      expect(prepended.status).toBe(429);

      // A DIFFERENT forged left entry: still 429, so varying the forgery mints nothing either.
      const differentPrepended = await logoutRequest().set(
        'x-forwarded-for',
        '198.51.100.78, 203.0.113.30',
      );
      expect(differentPrepended.status).toBe(429);

      // The case that shows precisely why the INGRESS RESTRICTION, not the parser, is what makes
      // the axis sound: a value with NO terminator entry at all lands in that value's OWN fresh
      // bucket. In this harness supertest IS the one trusted hop, exactly the position the
      // deployed terminator occupies (`DEC 2026-08-26o`) — a caller that reached the api directly,
      // bypassing a real terminator, would look exactly like this request.
      const onlyForged = await logoutRequest().set('x-forwarded-for', '203.0.113.99');
      expect(onlyForged.status).toBe(204);
    }, 120_000);

    it('E-4 — a malformed forwarded value falls back, and never 4xx', async () => {
      // The peer bucket (loopback) is already exhausted by E-2, so a single 429 on each of these
      // proves BOTH halves at once: no fresh bucket was minted for the malformed value, and no
      // request was rejected outright (never 400).
      for (const address of [
        'not-an-ip',
        // A REAL double-send of this header (verified against a raw socket, not assumed): Node's
        // http parser joins two instances of a non-special header with ", " — never an array —
        // so this string IS what "a two-value header" looks like once it reaches `req.headers`.
        '198.51.100.5, 198.51.100.6',
        '203.0.113.5, 70.41.3.18',
      ]) {
        const res = await logoutRequest()
          .set(VISITOR_FORWARD_TOKEN_HEADER, TEST_FORWARD_TOKEN)
          .set(VISITOR_ADDRESS_HEADER, address);
        expect({ address, status: res.status }).toEqual({ address, status: 429 });
      }
    });

    it('E-5 — the GET/HEAD-only exemption did NOT widen', async () => {
      // From the exhausted loopback peer bucket (E-2): a valid INTERNAL_REQUEST_TOKEN on this
      // POST still answers 429 — `shouldSkip`'s method check runs BEFORE it ever reads the token,
      // so a POST is never exempted regardless of what is presented.
      const internalTokenOnly = await logoutRequest().set(
        INTERNAL_REQUEST_HEADER,
        TEST_INTERNAL_TOKEN,
      );
      expect(internalTokenOnly.status).toBe(429);

      // The case that proves identity did not become bypass: the internal token AND a VALID
      // forwarding pair, together, on the same POST. The address deliberately REUSES `.10` —
      // E-1's now fully-exhausted forwarded bucket — rather than an address untouched by any
      // earlier case. That choice is what makes this assertion a clean isolation: a genuinely
      // UNUSED forwarded address would legitimately open its own fresh bucket and answer 204 (an
      // ordinary allowed first hit, which proves nothing about bypass either way, since it is the
      // SAME 204 a real fresh visitor would get with no internal token at all). Reusing an
      // ALREADY-exhausted forwarded bucket makes 429 the only possible non-bypass outcome, so this
      // 429 is real evidence that a valid forwarding pair riding along with the internal token did
      // NOT also grant a bypass.
      const internalTokenPlusForwarding = await logoutRequest()
        .set(INTERNAL_REQUEST_HEADER, TEST_INTERNAL_TOKEN)
        .set(VISITOR_FORWARD_TOKEN_HEADER, TEST_FORWARD_TOKEN)
        .set(VISITOR_ADDRESS_HEADER, '203.0.113.10');
      expect(internalTokenPlusForwarding.status).toBe(429);
    });
  });
});
