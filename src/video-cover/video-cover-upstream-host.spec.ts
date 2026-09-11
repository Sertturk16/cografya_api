import { describe, expect, it } from '@jest/globals';
import { isAllowedThumbnailHost } from './video-cover-upstream-host';

const ALLOWLIST = ['i.ytimg.com'];

/**
 * The SSRF guard, unit-tested against every failure shape a stored `thumbnail_url` could carry —
 * plan §5.8. A positive case, and negative cases for wrong host, `http:` scheme, a malformed URL
 * string, and an empty allowlist.
 */
describe('isAllowedThumbnailHost', () => {
  it('returns the parsed URL for an allowlisted https host', () => {
    const url = isAllowedThumbnailHost('https://i.ytimg.com/vi/abc/maxresdefault.jpg', ALLOWLIST);
    expect(url).not.toBeNull();
    expect(url?.hostname).toBe('i.ytimg.com');
  });

  it('refuses a host not on the allowlist', () => {
    expect(isAllowedThumbnailHost('https://evil.invalid/thumb.jpg', ALLOWLIST)).toBeNull();
  });

  it('refuses a subdomain the allowlist does not literally name', () => {
    // Hostname equality only — never a suffix/subdomain match, which would let
    // "i.ytimg.com.evil.invalid" or "evil-i.ytimg.com" slip through.
    expect(isAllowedThumbnailHost('https://sub.i.ytimg.com/thumb.jpg', ALLOWLIST)).toBeNull();
  });

  it('refuses the http: scheme even on an allowlisted host', () => {
    expect(
      isAllowedThumbnailHost('http://i.ytimg.com/vi/abc/maxresdefault.jpg', ALLOWLIST),
    ).toBeNull();
  });

  it('refuses a non-URL string rather than throwing', () => {
    expect(isAllowedThumbnailHost('not a url', ALLOWLIST)).toBeNull();
  });

  it('refuses every URL against an empty allowlist', () => {
    expect(isAllowedThumbnailHost('https://i.ytimg.com/vi/abc/maxresdefault.jpg', [])).toBeNull();
  });

  it('refuses a javascript: or data: scheme', () => {
    expect(isAllowedThumbnailHost('javascript:alert(1)', ALLOWLIST)).toBeNull();
    expect(isAllowedThumbnailHost('data:image/png;base64,AAAA', ALLOWLIST)).toBeNull();
  });
});
