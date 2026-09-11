/**
 * The SSRF host-allowlist guard for the cover proxy's own live upstream fetch (plan §5.4/§2.4).
 *
 * The write-time guard on the stored column, `isPublishableThumbnailUrl`
 * (`src/book/youtube/youtube-videos.parse.ts`), checks only that the value parses as a URL, is
 * under 512 characters, and uses the `https:` scheme — it does NOT pin the hostname. That was safe
 * while the only consumer was a reader's own browser hotlinking the value directly. The moment the
 * api's OWN server fetches this address (`VideoCoverService`), an untrusted or compromised host in
 * that column becomes a server-side SSRF vector: this repo's own process would open an outbound
 * connection to whatever host a stored row names. This function is the guard that closes that gap,
 * following the same three-line shape (`assertAllowedDownloadHost`,
 * `src/air-quality/cams/ads-jobs.ts`) this codebase already carries independently in three places
 * (ADS, ERA5, the air-quality probe) — one local copy per leg is the established convention here,
 * not a shared cross-module import.
 *
 * Deliberately returns `null` on any failure rather than throwing, UNLIKE the three existing
 * `assertAllowedDownloadHost` copies: those guard background ingest tours, where a thrown error
 * naturally becomes a logged, counted tour failure with no live requester waiting. This guard sits
 * on a LIVE per-request path whose every failure mode must converge on the same uniform 404
 * (`VideoCoverService`, plan §5.6) — a boolean-shaped (`URL | null`) return composes with that
 * design directly, with no behavioural difference in what is actually refused.
 */
export function isAllowedThumbnailHost(rawUrl: string, allowlist: readonly string[]): URL | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (!allowlist.includes(url.hostname)) return null;
  return url;
}
