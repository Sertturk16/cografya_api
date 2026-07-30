import { describe, expect, it } from '@jest/globals';
import {
  classifyHttpStatus,
  hasExpectedContentType,
  parseRetryAfterSeconds,
  readBodyCapped,
  redactSecrets,
  redactUrl,
  UpstreamOversizedResponseError,
} from './upstream-http.helpers';

describe('classifyHttpStatus', () => {
  it('separates 429 from the other 4xx, because only one of them is our volume', () => {
    expect(classifyHttpStatus(429)).toBe('rate_limited');
    expect(classifyHttpStatus(400)).toBe('client_error');
    expect(classifyHttpStatus(404)).toBe('client_error');
  });

  it('treats 5xx as transient and 2xx as ok', () => {
    expect(classifyHttpStatus(200)).toBe('ok');
    expect(classifyHttpStatus(204)).toBe('ok');
    expect(classifyHttpStatus(500)).toBe('transient');
    expect(classifyHttpStatus(503)).toBe('transient');
  });

  it('does not call an unfollowed redirect or a 1xx "ok" — there is no body to parse there', () => {
    expect(classifyHttpStatus(302)).toBe('transient');
    expect(classifyHttpStatus(100)).toBe('transient');
  });
});

describe('parseRetryAfterSeconds', () => {
  const now = Date.parse('2026-07-30T12:00:00.000Z');

  it('reads the delta-seconds form', () => {
    expect(parseRetryAfterSeconds('120', now)).toBe(120);
  });

  it('reads the HTTP-date form — ignoring it would retry immediately and earn a longer ban', () => {
    expect(parseRetryAfterSeconds('Thu, 30 Jul 2026 12:05:00 GMT', now)).toBe(300);
  });

  it('clamps a hostile or absurd value rather than parking a key in the cache for a week', () => {
    expect(parseRetryAfterSeconds('999999999', now)).toBe(86_400);
    expect(parseRetryAfterSeconds('-30', now)).toBe(0);
  });

  it('returns null for an absent or unparseable header', () => {
    expect(parseRetryAfterSeconds(null, now)).toBeNull();
    expect(parseRetryAfterSeconds('   ', now)).toBeNull();
    expect(parseRetryAfterSeconds('soon', now)).toBeNull();
  });
});

describe('redactUrl', () => {
  it('masks credential-shaped query values while keeping the diagnostic parameters verbatim', () => {
    const redacted = redactUrl('https://example.test/v1?lat=40.7&apikey=s3cret&lon=28.4');
    expect(redacted).toContain('lat=40.7');
    expect(redacted).toContain('lon=28.4');
    expect(redacted).not.toContain('s3cret');
    expect(redacted).toContain('%3Credacted%3E');
  });

  it('strips userinfo', () => {
    expect(redactUrl('https://user:pass@example.test/v1')).not.toContain('pass');
  });

  it('never echoes a string it could not parse', () => {
    expect(redactUrl('not a url')).toBe('<unparseable url>');
  });
});

describe('redactSecrets', () => {
  it('masks a credential echoed back inside a provider error body', () => {
    // Providers routinely quote the offending request in an error body, and that excerpt is both
    // logged at ERROR and persisted into the negative cache (review #73, security i4).
    const masked = redactSecrets('bad request: /v1?apikey=s3cret&lat=40.7');
    expect(masked).not.toContain('s3cret');
    expect(masked).toContain('lat=40.7');
  });

  it('handles the JSON and XML-attribute shapes the same way', () => {
    expect(redactSecrets('{"token":"abc123","lat":40}')).not.toContain('abc123');
    expect(redactSecrets('<req api_key="abc123" lat="40"/>')).not.toContain('abc123');
  });

  it('leaves an ordinary diagnostic message untouched', () => {
    const message = 'Invalid time coord: 2030-01-01T00:00:00.000Z is out of range';
    expect(redactSecrets(message)).toBe(message);
  });
});

describe('hasExpectedContentType', () => {
  it('accepts a charset suffix and rejects the provider XML error path', () => {
    expect(hasExpectedContentType('application/json;charset=UTF-8', 'application/json')).toBe(true);
    expect(hasExpectedContentType('text/xml;charset=UTF-8', 'application/json')).toBe(false);
    expect(hasExpectedContentType(null, 'application/json')).toBe(false);
  });
});

describe('readBodyCapped', () => {
  function streamed(body: string, headers: Record<string, string> = {}): Response {
    return new Response(body, { headers });
  }

  it('reads a normal body through', async () => {
    await expect(readBodyCapped(streamed('{"a":1}'), 'https://example.test', 1_000)).resolves.toBe(
      '{"a":1}',
    );
  });

  it('refuses on a declared Content-Length above the cap, before reading anything', async () => {
    const response = streamed('x', { 'content-length': '9999999' });
    await expect(readBodyCapped(response, 'https://example.test', 10)).rejects.toBeInstanceOf(
      UpstreamOversizedResponseError,
    );
  });

  it('still enforces the cap when Content-Length lies, because the stream is metered too', async () => {
    // The half that actually enforces the limit: a peer may simply not declare a length, or
    // declare a small one and send more.
    const response = streamed('0123456789ABCDEF');
    await expect(readBodyCapped(response, 'https://example.test', 4)).rejects.toBeInstanceOf(
      UpstreamOversizedResponseError,
    );
  });

  it('enforces the cap on a body-less response too — the branch where the meter cannot run', async () => {
    const oversized = 'y'.repeat(50);
    const response = {
      body: null,
      headers: new Headers(),
      text: () => Promise.resolve(oversized),
    } as unknown as Response;

    await expect(readBodyCapped(response, 'https://example.test', 10)).rejects.toBeInstanceOf(
      UpstreamOversizedResponseError,
    );
  });
});
