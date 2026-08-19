import { describe, expect, it } from '@jest/globals';
import { quoteProviderText } from './afad-log-safe';

describe('quoteProviderText', () => {
  it('renders an ordinary value the way the hand-written messages already did', () => {
    // The control for every negative below: the shape did not change, only the escaping.
    expect(quoteProviderText('Ege Denizi')).toBe('"Ege Denizi"');
    expect(quoteProviderText('2026-08-10T10:07:59')).toBe('"2026-08-10T10:07:59"');
  });

  it('escapes the newline that would otherwise forge a second log line', () => {
    const forged = 'ok\n2026-08-10 ERROR nothing is wrong here';
    const quoted = quoteProviderText(forged);

    expect(quoted).not.toContain('\n');
    expect(quoted).toContain('\\n');
    // The text itself survives — this is escaping, not stripping: a refusal that hides the value
    // it refused is a worse diagnosis than one that shows it safely.
    expect(quoted).toContain('nothing is wrong here');
  });

  it('escapes a carriage return and a tab too', () => {
    expect(quoteProviderText('a\rb\tc')).toBe('"a\\rb\\tc"');
  });

  it('cuts a value no length check bounds, and says that it cut it', () => {
    // `date` and the four numeric fields reach a refusal reason with no length check of their own;
    // only `EARTHQUAKE_RESPONSE_MAX_BYTES` (4 MiB) bounds them.
    const quoted = quoteProviderText('x'.repeat(5_000));

    expect(quoted.length).toBeLessThan(200);
    expect(quoted.endsWith('…"')).toBe(true);
  });

  it('leaves a value exactly on the limit whole', () => {
    const exact = 'y'.repeat(160);
    expect(quoteProviderText(exact)).toBe(`"${exact}"`);
  });

  it('renders a non-string without throwing', () => {
    // The numeric fields arrive as `unknown` and are quoted before their type is established.
    expect(quoteProviderText(42)).toBe('"42"');
    expect(quoteProviderText(null)).toBe('"null"');
    expect(quoteProviderText(undefined)).toBe('"undefined"');
  });
});
