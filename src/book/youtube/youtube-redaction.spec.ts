import { describe, expect, it } from '@jest/globals';
import { redactYoutubeKey, youtubeRedactor } from './youtube-redaction';

/**
 * SPEC §13 item 15, the `no-key-material` unit half.
 *
 * The key used here is fabricated. `AIzaSyFAKE…` is the SHAPE of a Google API key and is not one —
 * which is also the point of the second case: the redactor is bound to a value, so it does not care
 * what the shape is.
 */
const FAKE_KEY = 'AIzaSyFAKE_not_a_real_key_000000000000';

describe('redactYoutubeKey', () => {
  it('removes the key from an error body a provider echoed back', () => {
    const body = `{"error":{"message":"API key not valid: ${FAKE_KEY}"}}`;
    const redacted = redactYoutubeKey(body, FAKE_KEY);

    expect(redacted).not.toContain(FAKE_KEY);
    expect(redacted).toContain('[REDACTED]');
    // The rest of the message survives — a redactor that erased the diagnosis would be swapping one
    // problem for another.
    expect(redacted).toContain('API key not valid');
  });

  it('removes the PERCENT-ENCODED form too, because a key echoed inside a URL arrives escaped', () => {
    const encoded = encodeURIComponent(FAKE_KEY);
    const text = `refused https://provider.invalid/videos?key=${encoded}&id=x`;

    expect(redactYoutubeKey(text, encoded)).not.toContain(encoded);
    expect(redactYoutubeKey(text, FAKE_KEY)).not.toContain(FAKE_KEY);
  });

  it('removes EVERY occurrence, not only the first', () => {
    const twice = `${FAKE_KEY} and again ${FAKE_KEY}`;
    expect(redactYoutubeKey(twice, FAKE_KEY)).toBe('[REDACTED] and again [REDACTED]');
  });

  it('is a no-op with no secret to hide, and never mangles a message', () => {
    expect(redactYoutubeKey('nothing to hide', null)).toBe('nothing to hide');
    expect(redactYoutubeKey('nothing to hide', '')).toBe('nothing to hide');
  });

  it('does NOT mask by shape — a key-shaped string that is not OUR key stays readable', () => {
    // Value-based on purpose. Masking "anything that looks like a key" would be a regex maintained
    // against a format we do not control, and it would erase diagnostic ids that merely resemble
    // one while still missing a credential that stopped looking like a credential.
    const other = 'AIzaSyDIFFERENT_string_00000000000000';
    expect(redactYoutubeKey(`saw ${other}`, FAKE_KEY)).toBe(`saw ${other}`);
  });
});

describe('youtubeRedactor', () => {
  it('binds one secret so nothing downstream has to remember to pass it', () => {
    const redact = youtubeRedactor(FAKE_KEY);
    expect(redact(`a ${FAKE_KEY} b`)).toBe('a [REDACTED] b');
  });

  it('is inert when the leg holds no key', () => {
    expect(youtubeRedactor(null)(`a ${FAKE_KEY} b`)).toBe(`a ${FAKE_KEY} b`);
  });
});
