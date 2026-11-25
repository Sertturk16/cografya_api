import { BOOK_ATTRIBUTION_PROVIDER_YOUTUBE } from './book.types';
import type { BookAttributionDto } from './dto/book-attribution.dto';

/**
 * The attribution rows every book detail response carries — an obligation rather than a nicety.
 *
 * ## Why compiled constants and not seed data (the CAMS / marine precedent)
 * A missing credit is a breach of the YouTube terms, not a degraded widget. As compiled constants
 * the strings exist at compile time, are read in the diff, and are byte-pinned by the spec beside
 * this file, so an unseeded or hand-edited database cannot serve the content uncredited.
 *
 * The notice is required wording: copied verbatim, never translated, shortened or reworded.
 *
 * ## One row: the YouTube source credit
 * `youtube` discharges Developer Policies III.E.4 — the page must make clear that YouTube is the
 * source. The Branding Guidelines also require the logo, which is a web-repo asset. The row links
 * to the book's own channel, derived from `books.youtube_channel_id`, so each book credits the
 * channel its solutions are published on.
 */

/** `providerName` for the YouTube row — the brand's own form; never `YT`, `You-Tube` or `Youtube`. */
export const YOUTUBE_PROVIDER_NAME = 'YouTube';

/** The required YouTube source credit, verbatim from the ledger. */
export const YOUTUBE_REQUIRED_NOTICE_TR = 'Video kaynağı: YouTube';

/**
 * The channel page for a YouTube channel id, or `null` when the book carries none.
 *
 * The `/channel/<id>` form, because it is the one an id determines: a handle can be changed or
 * reclaimed by YouTube, an id cannot. The id is encoded anyway — the column has no CHECK on its
 * alphabet, and this value becomes an `href` on a public page.
 */
export function youtubeChannelUrl(channelId: string | null): string | null {
  if (channelId === null || channelId.length === 0) {
    return null;
  }
  return `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`;
}

/**
 * Builds the attribution rows for one book.
 *
 * A fresh array of fresh objects on every call: the DTOs are handed to the serializer, and a shared
 * frozen structure would make any future mutation by a consumer a cross-request bug (the CAMS
 * `noticeKeys` precedent).
 */
export function buildBookAttribution(youtubeChannelId: string | null): BookAttributionDto[] {
  return [
    {
      providerId: BOOK_ATTRIBUTION_PROVIDER_YOUTUBE,
      providerName: YOUTUBE_PROVIDER_NAME,
      requiredNoticeTr: YOUTUBE_REQUIRED_NOTICE_TR,
      // `null` is the STATEMENT, not a gap: the obligation arises from the YouTube API Services
      // ToS, the Developer Policies and the Branding Guidelines — terms of service, not a licence
      // grant with a canonical address of the CC-BY kind. Pointing this at a ToS page would publish
      // a licence that does not exist.
      licenceUrl: null,
      channelUrl: youtubeChannelUrl(youtubeChannelId),
    },
  ];
}
