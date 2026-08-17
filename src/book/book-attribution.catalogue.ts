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
 * ## Every value here is COPIED from the ledger, none is minted — with ONE stated exception
 * `provenance/integrations.md` is the canonical home, and it carries two tables inside its
 * attribution block: "YouTube attribution — canonical strings" for the two notices, and "Other
 * `BookAttributionDto` values sourced from this ledger" for `providerName` and `licenceUrl`. The
 * second table exists because those two fields' own `@ApiProperty` descriptions named the ledger
 * while the ledger carried no row for them — B3 closed that gap by extending the ledger, not by
 * inventing values here (Atlas ruling, 2026-08-15).
 *
 * The exception is {@link YOUTUBE_CHANNEL_URL}: the ledger states it "deliberately has no row
 * here" and names the two rulings it was waiting on. Its source is therefore `DEC 2026-08-17b`
 * plus the verification note that ruling made it conditional on, both cited at the constant. The
 * ledger paragraph is filled by NOVA on the next provenance touch (the ruling's own
 * implementation line) — `provenance/` is not this repo's to edit.
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
 * books that channel publishes. **Since `DEC 2026-08-17b`, {@link YOUTUBE_CHANNEL_URL} is in that
 * same class** — a handle cannot be derived from an id, so the address is a compiled per-channel
 * value rather than a function of the column. No abstraction is built for a second partner
 * (`ENGINEERING.md` §12, YAGNI), but the boundary is not left silent either: the spec asserts every
 * seeded book shares one `youtubeChannelId`, which carries no fact literal, cannot pass on an empty
 * corpus, and fails the build the moment a book from another channel is seeded
 * (`FU-BOOK-ATTRIBUTION-MULTIPARTNER` — whose scope now covers the address as well as the notice).
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
 * The channel address both attribution rows point at — the HANDLE form, owner-ruled.
 *
 * `DEC 2026-08-17b` hüküm 1 sets the served form to the handle, replacing the `/channel/<id>` form
 * composed from the column under `DEC 2026-08-15h` item 4. **That ruling was conditional and the
 * condition was discharged before this constant landed:**
 * `Owner's Inbox/kitap-video-web/channelurl-verification.md` establishes handle and
 * `UCH7D1zOgHykrHfx5Q7WERmw` as the same channel in BOTH directions — the handle page carries the
 * id in `<meta itemprop="identifier">`, the id page carries `"canonicalBaseUrl":"/@cografyagurmesi"`
 * — and both addresses answered 200 with no redirect. That note also closes the older docblock's
 * open flag: the address is no longer merely a shape, it was fetched.
 *
 * **A constant rather than a composition, and that is the ruling's real content.** A handle cannot
 * be derived from a channel id, so the address stops being a function of the column. What that
 * costs is stated where it can be acted on: a book seeded from another channel would now receive
 * this channel's address as well as this channel's credit, and the guard for both is the same
 * seeded-corpus invariant in the spec beside this file, not anything checkable here at runtime.
 *
 * **Two risks the owner took knowingly, recorded rather than smoothed:**
 * - YouTube "reserves the right to change, reclaim, or remove a handle at any time" (its own help
 *   page, quoted in the verification note K5). A channel id is not exposed to that. The ruling
 *   weighs it against a one-line correction and accepts it.
 * - NOVA's recommendation was the id form, because YouTube's own `<link rel="canonical">` prints
 *   that form on both pages. The owner ruled the handle on the reference product's precedent. The
 *   recommendation is recorded here so the next reader reads a decision, not an oversight.
 */
export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@cografyagurmesi';

/**
 * Builds both attribution rows for one book.
 *
 * A fresh array of fresh objects on every call: the DTOs are handed to the serializer, and a shared
 * frozen structure would make any future mutation by a consumer a cross-request bug (the CAMS
 * `noticeKeys` precedent).
 *
 * Both rows point at the same channel address. The DTO's own description allows "the channel or the
 * publisher"; we hold a channel and no publisher URL, and inventing one is exactly what the
 * `licenceUrl = null` reasoning forbids. Which of the two the `partner` row ought to point at is
 * the second question `provenance/integrations.md` records as open, and `DEC 2026-08-17b` settled
 * the address FORM only — so it stays open and is not settled here by default.
 *
 * Takes no argument: since `DEC 2026-08-17b` nothing in either row is derived from the book, and a
 * parameter kept for looks would read as a per-book value that no longer exists.
 */
export function buildBookAttribution(): BookAttributionDto[] {
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
      channelUrl: YOUTUBE_CHANNEL_URL,
    },
    {
      providerId: BOOK_ATTRIBUTION_PROVIDER_PARTNER,
      providerName: PARTNER_PROVIDER_NAME,
      requiredNoticeTr: PARTNER_REQUIRED_NOTICE_TR,
      // Same reasoning, different source: the partner obligation comes from `QUESTIONS.md` V-2 and
      // `CONVENTIONS.md` §7 — the commissioning party is the content owner, so no third party
      // licensed anything and there is no licence URL to publish.
      licenceUrl: null,
      channelUrl: YOUTUBE_CHANNEL_URL,
    },
  ];
}
