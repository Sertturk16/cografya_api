import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CircuitBreaker } from './circuit-breaker';
import { OperationDeadline } from './operation-deadline';
import { ProviderBudget, type ProviderBudgetLimits } from './provider-budget';
import { UpstreamHttpClient } from './upstream-http.client';
import { UpstreamMetrics } from './upstream-metrics';
import { UpstreamSchemaError, type UpstreamParseResult } from './upstream.types';

/** Captures structured events so an assertion can read them without touching an unbound method. */
interface RecordedEvent {
  level: string;
  message: string;
  context: Record<string, unknown>;
}

const LIMITS: ProviderBudgetLimits = { perMinute: 100, perHour: 1_000, perDay: 10_000 };
const URL_UNDER_TEST = 'https://provider.test/v1?lat=40.7&lon=28.4';

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json;charset=UTF-8' },
  });
}

/** The only parse the tests need: `{"value": n}` → n, `{"value": null}` → no_data. */
function parseValue(body: string): UpstreamParseResult<number> {
  const parsed: unknown = JSON.parse(body);
  const value = (parsed as { value?: unknown }).value;
  if (value === null) return { kind: 'no_data', reason: 'provider returned null' };
  if (typeof value !== 'number') throw new UpstreamSchemaError('value is not a number');
  return { kind: 'ok', value };
}

describe('UpstreamHttpClient', () => {
  let metrics: UpstreamMetrics;
  let events: RecordedEvent[];
  let breaker: CircuitBreaker;
  let budget: ProviderBudget;
  let nowMs: number;
  let sleeps: number[];

  function build(fetchImpl: typeof fetch): UpstreamHttpClient {
    budget = new ProviderBudget(metrics, null, () => nowMs);
    return new UpstreamHttpClient(metrics, budget, breaker, {
      singleCallTimeoutMs: 3_000,
      userAgent: 'TestBot/1.0',
      fetchImpl,
      sleepImpl: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      now: () => nowMs,
    });
  }

  function request(client: UpstreamHttpClient, limits: ProviderBudgetLimits = LIMITS) {
    return client.request({
      providerId: 'provider',
      label: 'provider.value',
      url: URL_UNDER_TEST,
      deadline: new OperationDeadline(6_000),
      limits,
      parse: parseValue,
    });
  }

  beforeEach(() => {
    metrics = new UpstreamMetrics();
    events = [];
    jest.spyOn(metrics, 'event').mockImplementation((level, message, context) => {
      events.push({ level, message, context: { ...context } });
    });
    breaker = new CircuitBreaker(metrics, {
      failureThreshold: 3,
      openMs: 10_000,
      now: () => nowMs,
    });
    nowMs = Date.parse('2026-07-30T12:00:00.000Z');
    sleeps = [];
  });

  it('returns the parsed value and identifies itself honestly', async () => {
    const fetchImpl = jest.fn<typeof fetch>(() => Promise.resolve(jsonResponse('{"value":18.4}')));
    const outcome = await request(build(fetchImpl));

    expect(outcome).toEqual({ kind: 'ok', value: 18.4, validAtMs: null });
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('TestBot/1.0');
    expect(init.signal).toBeDefined();
  });

  it('never leaves a call unbounded — every request carries an abort signal', async () => {
    const fetchImpl = jest.fn<typeof fetch>(() => Promise.resolve(jsonResponse('{"value":1}')));
    await request(build(fetchImpl));
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal?.aborted).toBe(false);
  });

  it('reports HTTP 200 + null as `no_data`, not as a failure', async () => {
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse('{"value":null}')));
    const outcome = await request(build(fetchImpl));

    expect(outcome.kind).toBe('no_data');
    // A land mask is the provider working correctly; counting it against the breaker would take a
    // healthy provider off the page.
    expect(breaker.state('provider')).toBe('closed');
  });

  it('checks the content type BEFORE parsing — the measured CMEMS XML error path', async () => {
    // HTTP 200 with `text/xml` (or an HTML error page from a proxy): a blind JSON.parse here
    // throws a SyntaxError that reads like OUR bug instead of a provider contract problem.
    const fetchImpl = jest.fn(() =>
      Promise.resolve(
        new Response('<ExceptionReport/>', {
          status: 200,
          headers: { 'content-type': 'text/xml;charset=UTF-8' },
        }),
      ),
    );
    const outcome = await request(build(fetchImpl));

    expect(outcome.kind).toBe('schema_error');
    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'error',
        message: expect.stringContaining('did not match the expected contract'),
      }),
    );
  });

  it('classifies HTTP 400 as OUR error, logs it loudly and does NOT retry it', async () => {
    const fetchImpl = jest.fn(() =>
      Promise.resolve(
        new Response('<Exception>Invalid time coord</Exception>', {
          status: 400,
          headers: { 'content-type': 'text/xml' },
        }),
      ),
    );
    const outcome = await request(build(fetchImpl));

    expect(outcome.kind).toBe('client_error');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual(
      expect.objectContaining({
        level: 'error',
        message: expect.stringContaining('rejected OUR request'),
      }),
    );
  });

  it('classifies 429, carries Retry-After through, and opens the breaker at once', async () => {
    const fetchImpl = jest.fn(() =>
      Promise.resolve(new Response('slow down', { status: 429, headers: { 'retry-after': '90' } })),
    );
    const outcome = await request(build(fetchImpl));

    expect(outcome).toMatchObject({ kind: 'rate_limited', retryAfterSeconds: 90 });
    expect(breaker.state('provider')).toBe('open');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure EXACTLY once', async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(jsonResponse('{"value":7}'));

    const outcome = await request(build(fetchImpl));

    expect(outcome).toMatchObject({ kind: 'ok', value: 7 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([250]);
    expect(metrics.get('upstream.retry', 'provider')).toBe(1);
  });

  it('gives up after the single retry rather than grinding', async () => {
    const fetchImpl = jest.fn(() => Promise.reject(new Error('ECONNRESET')));
    const outcome = await request(build(fetchImpl));

    expect(outcome.kind).toBe('transient');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry when the remaining budget cannot pay for another attempt', async () => {
    // The retry rule is about the budget that is LEFT, not about the attempt counter.
    const fetchImpl = jest.fn(() => Promise.reject(new Error('ECONNRESET')));
    const client = build(fetchImpl);

    const outcome = await client.request({
      providerId: 'provider',
      label: 'provider.value',
      url: URL_UNDER_TEST,
      deadline: new OperationDeadline(300),
      limits: LIMITS,
      parse: parseValue,
    });

    expect(outcome.kind).toBe('transient');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('makes no call at all once the deadline has already elapsed', async () => {
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse('{"value":1}')));
    const client = build(fetchImpl);
    const deadline = new OperationDeadline(1);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const outcome = await client.request({
      providerId: 'provider',
      label: 'provider.value',
      url: URL_UNDER_TEST,
      deadline,
      limits: LIMITS,
      parse: parseValue,
    });

    expect(outcome.kind).toBe('transient');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(metrics.get('upstream.deadline_exceeded', 'provider')).toBe(1);
  });

  it('records NO breaker evidence for the keys a spent shared deadline refuses', async () => {
    // The shared-deadline fix made an already-spent budget the normal state for keys 2..N of one
    // multi-key request. Gating on the breaker first meant those keys each recorded a phantom
    // failure — and, in half-open, consumed the trial — for calls the provider never saw
    // (review #73 confirm pass, N1). Three keys, one spent budget: the breaker must not move.
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse('{"value":1}')));
    const client = build(fetchImpl);
    const shared = new OperationDeadline(1);
    await new Promise((resolve) => setTimeout(resolve, 20));

    for (const label of ['key.a', 'key.b', 'key.c']) {
      const outcome = await client.request({
        providerId: 'provider',
        label,
        url: URL_UNDER_TEST,
        deadline: shared,
        limits: LIMITS,
        parse: parseValue,
      });
      expect(outcome.kind).toBe('transient');
    }

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(breaker.state('provider')).toBe('closed');
    expect(metrics.get('breaker.opened', 'provider')).toBe(0);
    expect(metrics.get('upstream.deadline_exceeded', 'provider')).toBe(3);
  });

  it('does not consume the half-open trial for a call the deadline already refused', async () => {
    // The half of N1 that is the same family as the validated CRITICAL: `canAttempt` is a
    // WITHDRAWAL, not a question. A call that never leaves the process must not spend the one
    // probe the circuit allows — and must not re-arm the cooldown on its own refusal.
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse('{"value":1}')));
    const client = build(fetchImpl);

    breaker.recordFailure('provider', 'transient');
    breaker.recordFailure('provider', 'transient');
    breaker.recordFailure('provider', 'transient');
    nowMs += 10_001; // the cooldown has elapsed → the circuit is half-open

    const spent = new OperationDeadline(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await client.request({
      providerId: 'provider',
      label: 'provider.value',
      url: URL_UNDER_TEST,
      deadline: spent,
      limits: LIMITS,
      parse: parseValue,
    });

    // The trial is still available to the next caller — one that can actually make the call.
    expect(breaker.canAttempt('provider')).toBe(true);
    expect(metrics.get('breaker.trial_abandoned', 'provider')).toBe(0);
  });

  it('refuses the call when the provider budget is exhausted — the cache-failure backstop', async () => {
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse('{"value":1}')));
    const client = build(fetchImpl);
    const tiny: ProviderBudgetLimits = { perMinute: 1, perHour: 10, perDay: 10 };

    await request(client, tiny);
    const outcome = await request(client, tiny);

    expect(outcome.kind).toBe('budget_exhausted');
    expect(outcome.kind === 'budget_exhausted' && outcome.reason).toContain('budget exhausted');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does NOT open the breaker on a budget refusal — that provider was never contacted', async () => {
    // Otherwise a burst of self-inflicted refusals crosses the failure threshold within seconds
    // and reports a perfectly healthy provider as down, then hides the loud budget log behind a
    // generic "circuit breaker is open" for the cooldown (review #73, silent-failure I).
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse('{"value":1}')));
    const client = build(fetchImpl);
    const tiny: ProviderBudgetLimits = { perMinute: 1, perHour: 10, perDay: 10 };

    await request(client, tiny);
    for (let i = 0; i < 10; i += 1) await request(client, tiny);

    expect(breaker.state('provider')).toBe('closed');
  });

  it('charges the provider quota in the unit the PROVIDER counts, not per HTTP request', async () => {
    // One batched request for 31 locations costs 31 quota units on Open-Meteo's accounting
    // (Atlas ruling, review #73 I5). Counting requests made the ceiling ~186% of the free tier
    // while the guard never fired.
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse('{"value":1}')));
    const client = build(fetchImpl);
    const limits: ProviderBudgetLimits = { perMinute: 40, perHour: 100, perDay: 100 };

    const weighted = (): Promise<unknown> =>
      client.request({
        providerId: 'provider',
        label: 'provider.batch',
        url: URL_UNDER_TEST,
        deadline: new OperationDeadline(6_000),
        limits,
        quotaWeight: 31,
        parse: parseValue,
      });

    await weighted();
    const second = await weighted();

    // Two batched requests = 62 weighted units, past the 40/min ceiling.
    expect((second as { kind: string }).kind).toBe('budget_exhausted');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('releases a leaked half-open trial when `parse` throws — the review #73 CRITICAL', async () => {
    // Without the try/finally the trial flag stays set for the process lifetime and the provider
    // becomes permanently unreachable, with logs byte-identical to a healthy cooldown.
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse('{"value":1}')));
    const client = build(fetchImpl);

    breaker.recordFailure('provider', 'transient');
    breaker.recordFailure('provider', 'transient');
    breaker.recordFailure('provider', 'transient');
    nowMs += 10_001; // cooldown elapsed → the next call takes the trial

    await expect(
      client.request({
        providerId: 'provider',
        label: 'provider.value',
        url: URL_UNDER_TEST,
        deadline: new OperationDeadline(6_000),
        limits: LIMITS,
        parse: () => {
          throw new TypeError('undefined is not a function');
        },
      }),
    ).rejects.toThrow(TypeError);

    // The provider must still be reachable, and the release must NOT have counted as a failure.
    expect(breaker.canAttempt('provider')).toBe(true);
    expect(metrics.get('breaker.trial_abandoned', 'provider')).toBe(1);
  });

  it('refuses to follow a redirect, so a provider cannot choose the host we talk to', async () => {
    const fetchImpl = jest.fn<typeof fetch>(() => Promise.resolve(jsonResponse('{"value":1}')));
    await request(build(fetchImpl));
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.redirect).toBe('error');
  });

  it('redacts a credential echoed back inside a provider ERROR BODY', async () => {
    // The excerpt is logged at ERROR and persisted into the negative cache. Providers routinely
    // echo the offending request back, so once a keyed feed uses this client the first 200 bytes
    // could carry its key (review #73, security i4).
    const fetchImpl = jest.fn(() =>
      Promise.resolve(
        new Response('<Exception>bad request: /v1?apikey=s3cret&lat=40</Exception>', {
          status: 400,
          headers: { 'content-type': 'text/xml' },
        }),
      ),
    );
    const outcome = await request(build(fetchImpl));

    expect(outcome.kind).toBe('client_error');
    const reason = outcome.kind === 'client_error' ? outcome.reason : '';
    expect(reason).not.toContain('s3cret');
    expect(reason).toContain('<redacted>');
    // …and the diagnostic remainder survives: the excerpt exists to tell an operator what we sent.
    expect(reason).toContain('lat=40');
  });

  it('refuses the call while the breaker is open, without touching the network', async () => {
    breaker.recordFailure('provider', 'transient');
    breaker.recordFailure('provider', 'transient');
    breaker.recordFailure('provider', 'transient');

    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse('{"value":1}')));
    const outcome = await request(build(fetchImpl));

    expect(outcome.kind).toBe('transient');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(metrics.get('breaker.rejected', 'provider')).toBeGreaterThan(0);
  });

  it('turns a parse-contract violation into `schema_error`, not a 500', async () => {
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse('{"value":"eighteen"}')));
    const outcome = await request(build(fetchImpl));
    expect(outcome.kind).toBe('schema_error');
  });

  it('treats malformed JSON as a schema error rather than crashing the request', async () => {
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse('{not json')));
    const outcome = await request(build(fetchImpl));
    expect(outcome.kind).toBe('schema_error');
  });

  it('RETHROWS a genuine programming error out of `parse` instead of dressing it as a provider fault', async () => {
    // The one case that must not be swallowed: hiding our own bug behind "provider unavailable"
    // is precisely the silent failure this layer exists to prevent.
    const fetchImpl = jest.fn(() => Promise.resolve(jsonResponse('{"value":1}')));
    const client = build(fetchImpl);

    await expect(
      client.request({
        providerId: 'provider',
        label: 'provider.value',
        url: URL_UNDER_TEST,
        deadline: new OperationDeadline(6_000),
        limits: LIMITS,
        parse: () => {
          throw new TypeError('undefined is not a function');
        },
      }),
    ).rejects.toThrow(TypeError);
  });

  it('does not retry an oversized body — the same request would produce the same payload', async () => {
    const fetchImpl = jest.fn(() =>
      Promise.resolve(
        new Response('x'.repeat(64), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const client = build(fetchImpl);

    const outcome = await client.request({
      providerId: 'provider',
      label: 'provider.value',
      url: URL_UNDER_TEST,
      deadline: new OperationDeadline(6_000),
      limits: LIMITS,
      parse: parseValue,
      maxResponseBytes: 8,
    });

    expect(outcome.kind).toBe('schema_error');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps a credential-shaped query value out of the failure reason', async () => {
    const fetchImpl = jest.fn(() => Promise.resolve(new Response('nope', { status: 503 })));
    const client = build(fetchImpl);

    const outcome = await client.request({
      providerId: 'provider',
      label: 'provider.value',
      url: 'https://provider.test/v1?apikey=s3cret&lat=40',
      deadline: new OperationDeadline(6_000),
      limits: LIMITS,
      parse: parseValue,
    });

    expect(outcome.kind).toBe('transient');
    expect(outcome.kind === 'transient' && outcome.reason).not.toContain('s3cret');
  });
  /**
   * The binary branch (DEC 2026-07-31 A-1 / DEC 2026-07-31b).
   *
   * The point of these tests is not that bytes come back — it is that they come back through the
   * SAME guards, in the same order. A second downloader would have passed its own tests too;
   * review #73's CRITICAL lived in exactly this sequence, which is why there is only one of it.
   */
  describe('responseKind: bytes', () => {
    /** Bytes no UTF-8 decoder can round-trip: 0x80–0x83 are lone continuation bytes. */
    const BINARY = new Uint8Array([0x47, 0x52, 0x49, 0x42, 0x80, 0x81, 0x82, 0x83, 0xff, 0x00]);

    function binaryResponse(
      body: Uint8Array,
      status = 200,
      contentType = 'application/grib',
    ): Response {
      // Copied into a plain ArrayBuffer: a `Uint8Array` view is not a `BodyInit` under this
      // TypeScript lib, and the copy also guarantees the fixture cannot be mutated by the read.
      const buffer = new ArrayBuffer(body.byteLength);
      new Uint8Array(buffer).set(body);
      return new Response(buffer, { status, headers: { 'content-type': contentType } });
    }

    function requestBytes(
      client: UpstreamHttpClient,
      overrides: { maxResponseBytes?: number; expectedContentType?: string } = {},
    ) {
      return client.request({
        providerId: 'provider',
        label: 'provider.grib',
        url: URL_UNDER_TEST,
        deadline: new OperationDeadline(6_000),
        limits: LIMITS,
        responseKind: 'bytes',
        expectedContentType: overrides.expectedContentType ?? 'application/grib',
        maxResponseBytes: overrides.maxResponseBytes,
        parse: (body: Uint8Array): UpstreamParseResult<Uint8Array> => ({ kind: 'ok', value: body }),
      });
    }

    it('delivers the bytes verbatim, with nothing lost to a UTF-8 round trip', async () => {
      const client = build(jest.fn(() => Promise.resolve(binaryResponse(BINARY))));

      const outcome = await requestBytes(client);

      expect(outcome.kind).toBe('ok');
      expect(outcome.kind === 'ok' && Array.from(outcome.value)).toEqual(Array.from(BINARY));
      // The proof that the branch matters at all: decoding first replaces every invalid sequence
      // with U+FFFD, which is lossy, irreversible, and produces a perfectly ordinary string.
      const throughText = new TextEncoder().encode(new TextDecoder().decode(BINARY));
      expect(Array.from(throughText)).not.toEqual(Array.from(BINARY));
    });

    it('is still stopped by the provider budget, before the call is made', async () => {
      const fetchImpl = jest.fn(() => Promise.resolve(binaryResponse(BINARY)));
      const client = build(fetchImpl);

      const first = await requestBytes(client);
      expect(first.kind).toBe('ok');

      const exhausted = await client.request({
        providerId: 'provider',
        label: 'provider.grib',
        url: URL_UNDER_TEST,
        deadline: new OperationDeadline(6_000),
        limits: { perMinute: 1, perHour: 1, perDay: 1 },
        responseKind: 'bytes',
        expectedContentType: 'application/grib',
        parse: (body: Uint8Array): UpstreamParseResult<Uint8Array> => ({ kind: 'ok', value: body }),
      });

      expect(exhausted.kind).toBe('budget_exhausted');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('is still stopped by an already-spent deadline, without touching the breaker', async () => {
      const fetchImpl = jest.fn(() => Promise.resolve(binaryResponse(BINARY)));
      const client = build(fetchImpl);
      // Spent the way the text branch's own test spends one: a 1 ms budget, then a real pause.
      // `new OperationDeadline(0)` is rejected at construction — a zero budget is a bug, not a
      // state.
      const deadline = new OperationDeadline(1);
      await new Promise((resolve) => setTimeout(resolve, 20));

      const outcome = await client.request({
        providerId: 'provider',
        label: 'provider.grib',
        url: URL_UNDER_TEST,
        deadline,
        limits: LIMITS,
        responseKind: 'bytes',
        expectedContentType: 'application/grib',
        parse: (body: Uint8Array): UpstreamParseResult<Uint8Array> => ({ kind: 'ok', value: body }),
      });

      expect(outcome.kind).toBe('transient');
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('is still stopped by the byte cap', async () => {
      const client = build(jest.fn(() => Promise.resolve(binaryResponse(BINARY))));

      // Deterministic, so it must NOT be retried — the same request produces the same oversized
      // body, from a provider we are deliberately being polite to.
      const outcome = await requestBytes(client, { maxResponseBytes: 4 });

      expect(outcome.kind).toBe('schema_error');
    });

    it('is still stopped by the content-type check, before parse is reached', async () => {
      let parsed = false;
      const client = build(
        jest.fn(() => Promise.resolve(binaryResponse(BINARY, 200, 'text/html'))),
      );

      const outcome = await client.request({
        providerId: 'provider',
        label: 'provider.grib',
        url: URL_UNDER_TEST,
        deadline: new OperationDeadline(6_000),
        limits: LIMITS,
        responseKind: 'bytes',
        expectedContentType: 'application/grib',
        parse: (body: Uint8Array): UpstreamParseResult<Uint8Array> => {
          parsed = true;
          return { kind: 'ok', value: body };
        },
      });

      expect(outcome.kind).toBe('schema_error');
      expect(parsed).toBe(false);
    });

    it('reports a 4xx with a readable, redacted excerpt even though the branch is binary', async () => {
      const client = build(
        jest.fn(() =>
          Promise.resolve(
            new Response('bad request: apikey=s3cret is unknown', {
              status: 400,
              headers: { 'content-type': 'text/plain' },
            }),
          ),
        ),
      );

      const outcome = await requestBytes(client);

      expect(outcome.kind).toBe('client_error');
      expect(outcome.kind === 'client_error' && outcome.reason).toContain('bad request');
      expect(outcome.kind === 'client_error' && outcome.reason).not.toContain('s3cret');
    });
  });
});
