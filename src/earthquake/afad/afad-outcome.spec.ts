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
});
