import { describe, expect, it } from '@jest/globals';
import { classifyAfadServerErrorBody } from './afad-outcome';

/**
 * The measured contradiction: HTTP 500, body `"status": 400`.
 *
 * This spec is the answer to the question the next engineer will ask when they see a 5xx being
 * reported as a client error — "surely that is backwards?". It is not: the body is right, and
 * believing the transport code means retrying our own malformed query forever.
 */
describe('classifyAfadServerErrorBody', () => {
  const MEASURED_BODY =
    '{"timestamp":1786451618,"status":400,"error":"Parameter Exception",' +
    '"exception":null,"message":"Start-End Time is required","path":null}';

  it('escalates the measured body to a client error', () => {
    expect(classifyAfadServerErrorBody(MEASURED_BODY)).toBe('client_error');
  });

  it('still escalates when the excerpt was truncated mid-JSON', () => {
    // The hook receives at most 200 bytes, so a longer error body arrives unparseable. Falling
    // back to the field pattern is what makes this work on the real payload rather than only on a
    // tidy one.
    expect(classifyAfadServerErrorBody(MEASURED_BODY.slice(0, 40))).toBe('client_error');
  });

  it('leaves a body that agrees with its own 5xx alone', () => {
    expect(classifyAfadServerErrorBody('{"status":503,"error":"Service Unavailable"}')).toBeNull();
  });

  it('leaves a body claiming success alone — too confused to act on', () => {
    expect(classifyAfadServerErrorBody('{"status":200}')).toBeNull();
  });

  it.each([
    ['<html><body>502 Bad Gateway</body></html>', 'an HTML error page'],
    ['', 'an empty body'],
    ['[]', 'an array'],
    ['{"error":"nope"}', 'a body with no status field'],
  ])('leaves %s alone (%s)', (body) => {
    expect(classifyAfadServerErrorBody(body)).toBeNull();
  });

  it('accepts a stringified status, since JSON envelopes vary on that', () => {
    expect(classifyAfadServerErrorBody('{"status":"404"}')).toBe('client_error');
  });

  it.each([
    ['[{"status":400,"error":"Parameter Exception"}]', 'an envelope wrapped in an array'],
    ['{"error":{"status":400,"message":"nope"}}', 'a status nested one level down'],
    ['{"status":null,"cause":{"status":404}}', 'a top-level status of the wrong type'],
  ])('still escalates %s (%s)', (body) => {
    // The JSON path reads the envelope's OWN top-level status and nothing else, on purpose — it
    // must not mistake a nested field for the envelope's verdict. But when it finds no usable
    // status the pattern fallback has to run: it used to run only when `JSON.parse` THREW, so a
    // body that parsed into an unexpected shape filed our own malformed query as a provider outage
    // — the precise failure this hook exists to prevent (review #118 SFH118-M7).
    expect(classifyAfadServerErrorBody(body)).toBe('client_error');
  });

  it('does not invent a 4xx out of a body that has no status anywhere', () => {
    // The control for the case above: the fallback now runs on far more bodies, so it has to stay
    // silent on the ones that say nothing.
    expect(classifyAfadServerErrorBody('{"detail":"upstream timeout"}')).toBeNull();
    expect(classifyAfadServerErrorBody('[1,2,3]')).toBeNull();
    expect(classifyAfadServerErrorBody('{"status":null,"trailing":"…"}')).toBeNull();
  });
});
