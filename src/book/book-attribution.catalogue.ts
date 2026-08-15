import { BOOK_ATTRIBUTION_PROVIDER_PARTNER, BOOK_ATTRIBUTION_PROVIDER_YOUTUBE } from './book.types';
import type { BookAttributionDto } from './dto/book-attribution.dto';

/**
 * The attribution rows every book response carries — DATA, and an obligation rather than a nicety.
 *
 * ## Why a compiled constant and not seed data (the CAMS / marine precedent, deliberately reused)
 * A missing attribution row is not a degraded widget, it is a **breach**. As compiled constants the
 * breach is structurally impossible: the strings exist at compile time, they are read in the diff,
 * and the spec beside this file byte-pins them. They change only when the ledger changes — a code
 * change plus a fresh NOVA verification plus a `provenance/integrations.md` entry. No operator ever
 * edits them by hand, and an unseeded database cannot serve the content uncredited.
 *
 * ## Every value here is COPIED from the ledger, none is minted
 * `provenance/integrations.md` is the canonical home, and it carries two tables inside its
 * attribution block: "YouTube attribution — canonical strings" for the two notices, and "Other
 * `BookAttributionDto` values sourced from this ledger" for `providerName` and `licenceUrl`. The
 * second table exists because those two fields' own `@ApiProperty` descriptions named the ledger
 * while the ledger carried no row for them — B3 closed that gap by extending the ledger, not by
 * inventing values here (Atlas ruling, 2026-08-15).
 *
 * The notices are the **untouchable class** of `CONTENT-STYLE.md` §22: copied exactly, never
 * translated, shortened or reworded. `book-attribution.catalogue.spec.ts` pins every served string
 * byte-for-byte, which is the recorded exception to "tests assert structure, never facts" — a
 * licence-mandated verbatim string is not a claim ABOUT the world, it IS the artifact under test.
 *
 * ## Two rows, always both, and neither substitutes for the other
 * - `youtube` discharges Developer Policies III.E.4 — the page must make clear that YouTube is the
 *   source. A text credit alone may not be enough; the Branding Guidelines also require the logo,
 *   which is a web-repo asset and the one open blocker on this obligation. We carry both.
 * - `partner` credits the content owner. That duty comes from `QUESTIONS.md` V-2 and
 *   `CONVENTIONS.md` §7, not from YouTube.
 *
 * ## What `partner.providerName` knowingly drops
 * The notice credits TWO parties — the channel `Coğrafya Gurmesi` (the video solutions) and the
 * publisher `Coğrafya Gurmesi Yayınları` (the book). They share a brand and are not one entity, and
 * `Coğrafya Gurmesi` names only the first. **Nothing is lost to the reader**: `providerName` is not
 * the credit, `requiredNoticeTr` is, and that string names both parties in full. The non-lossy form
 * is two rows (`partner-channel`, `partner-publisher`), which is a change to a contract B1 froze for
 * codegen and therefore Atlas's call, not a reflex — recorded as `FU-BOOK-ATTRIBUTION-PARTNER-SPLIT`
 * and triggered the day a surface credits the two separately (Atlas ruling, 2026-08-15).
 *
 * ## One partner, and the boundary is guarded rather than abstracted
 * `PARTNER_REQUIRED_NOTICE_TR` names Coğrafya Gurmesi by name, so it is correct for exactly the
 * books that channel publishes. No abstraction is built for a second partner (`ENGINEERING.md` §12,
 * YAGNI), but the boundary is not left silent either: the spec asserts every seeded book shares one
 * `youtubeChannelId`, which carries no fact literal, cannot pass on an empty corpus, and fails the
 * build the moment a book from another channel is seeded (`FU-BOOK-ATTRIBUTION-MULTIPARTNER`).
 */

/** `providerName` for the YouTube row — the brand's own form; never `YT`, `You-Tube` or `Youtube`. */
export const YOUTUBE_PROVIDER_NAME = 'YouTube';

/** The required YouTube source credit, verbatim from the ledger. */
export const YOUTUBE_REQUIRED_NOTICE_TR = 'Video kaynağı: YouTube';

/** `providerName` for the partner row — the channel's actual name. See the class note on what it drops. */
export const PARTNER_PROVIDER_NAME = 'Coğrafya Gurmesi';

/**
 * The partner credit, verbatim from the ledger.
 *
 * ONE unbroken string literal, deliberately: `ENGINEERING.md` §8 names `+` concatenation as the
 * exact site of PR #43's dropped spaces, and a join that does not exist cannot lose a space.
 * Prettier never splits a string literal, so nothing in the toolchain reintroduces one. Double
 * quotes because the string contains an ASCII apostrophe (U+0027, verified against the ledger).
 */
export const PARTNER_REQUIRED_NOTICE_TR =
  "Video çözümler Coğrafya Gurmesi kanalına, kitap Coğrafya Gurmesi Yayınları'na aittir.";

/**
 * The canonical channel address, composed from the stored id.
 *
 * `DEC 2026-08-15h` item 4: composed from the column, because an attribution *string* belongs to
 * the ledger while a URL FORM does not. The `@handle` form is deliberately not used — it was never
 * verified as the channel's canonical address, and settling that needs a network round this leg has
 * not spent.
 *
 * **Flagged and staying flagged:** that this URL actually RESOLVES is unverified — zero network on
 * this leg, verified at first real use. The shape being ruled is not the same as the address being
 * reachable.
 */
export function youtubeChannelUrl(youtubeChannelId: string): string {
  return `https://www.youtube.com/channel/${youtubeChannelId}`;
}

/**
 * Builds both attribution rows for one book.
 *
 * A fresh array of fresh objects on every call: the DTOs are handed to the serializer, and a shared
 * frozen structure would make any future mutation by a consumer a cross-request bug (the CAMS
 * `noticeKeys` precedent).
 *
 * Both rows point at the same channel URL. The DTO's own description allows "the channel or the
 * publisher"; we hold a channel id and no publisher URL, and inventing one is exactly what the
 * `licenceUrl = null` reasoning forbids.
 *
 * @param youtubeChannelId the book's `youtube_channel_id` column.
 */
export function buildBookAttribution(youtubeChannelId: string): BookAttributionDto[] {
  const channelUrl = youtubeChannelUrl(youtubeChannelId);

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
      channelUrl,
    },
    {
      providerId: BOOK_ATTRIBUTION_PROVIDER_PARTNER,
      providerName: PARTNER_PROVIDER_NAME,
      requiredNoticeTr: PARTNER_REQUIRED_NOTICE_TR,
      // Same reasoning, different source: the partner obligation comes from `QUESTIONS.md` V-2 and
      // `CONVENTIONS.md` §7 — the commissioning party is the content owner, so no third party
      // licensed anything and there is no licence URL to publish.
      licenceUrl: null,
      channelUrl,
    },
  ];
}
