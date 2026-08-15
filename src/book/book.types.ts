/**
 * Shared book / video-solution vocabulary — the closed sets the entities, the DTOs, the (B2) seed,
 * the (B4) sync leg and the OpenAPI contract all read from.
 *
 * The contract ships in `openapi/openapi.json` in PR B1 (the "contract PR", SPEC §16) so the web
 * repo can codegen and build against a mock while B2 seeds the store and B3 lands the two public
 * endpoints. Everything here is FROZEN at B1: a change to any value below is a BREAKING contract
 * change and goes to Atlas (playbook §4) — including ADDING a member, because a new member can
 * break an exhaustive `switch` in the consumer.
 *
 * One file on purpose, like `earthquake.types.ts`, `marine.types.ts` and `air-quality.types.ts`: a
 * set duplicated between an entity and a DTO is exactly how a token ends up spelled two ways.
 *
 * ## Why these sets are TypeScript enums and not database CHECK constraints
 * The E1 precedent (`magnitude_type`) is followed deliberately: the column is a plain `varchar` and
 * the closed set lives here plus in the published OpenAPI `enum`. For `examTrack` that is the
 * STRONGER guard rather than the weaker one — every value is written by our own seed, so the enum
 * makes a wrong track a COMPILE error instead of a runtime insert failure, the same reasoning that
 * put the eight `CURRICULUM_*` climate names behind shared constants (playbook §8, M1 lane). For
 * {@link YoutubeThumbnailKey} it also avoids handing a fail-soft ingest loop a constraint that can
 * abort a row: the value can only ever come from our own ordered selection ladder, so a violation
 * would mean a code defect, and B4 handles a rejected row by counting it and continuing.
 *
 * **Nothing here is a price, a currency, an availability state or an offer.** `CONVENTIONS.md` §4
 * bars commercial packages and pricing, and the absence is structural: publishing one would
 * require editing this file and both migrations (→ DEC 2026-08-15c §1, which authorised the
 * outbound seller LINK and nothing else).
 */

/**
 * Which exam a book prepares for — a closed set, published in the contract.
 *
 * `AYT` and `TYT` are `GLOSSARY.md` §4 rows and the AYT row names `books.exam_track` by name;
 * `YKS` and `KPSS` are §4 rows too. Turkish abbreviations are PRESERVED rather than translated,
 * which is the pattern those rows fix (`YKS (Yükseköğretim Kurumları Sınavı)`).
 *
 * **`Lgs` has no `GLOSSARY.md` row today** and is carried because SPEC §5.1 names it in the closed
 * set. It is inert — no LGS book exists, so no reader can see the token — and it is surfaced to
 * Atlas rather than silently minted as a canonical term or silently dropped from the SPEC's set.
 */
export enum ExamTrack {
  /** Alan Yeterlilik Testleri — YKS's second session. The only value in use today. */
  Ayt = 'AYT',
  /** Temel Yeterlilik Testi — YKS's first session; singular by name (`GLOSSARY.md` §4). */
  Tyt = 'TYT',
  /** The whole Yükseköğretim Kurumları Sınavı, for a book that spans both sessions. */
  Yks = 'YKS',
  /** Kamu Personeli Seçme Sınavı. */
  Kpss = 'KPSS',
  /** Liselere Geçiş Sınavı. See the class note: no glossary row yet, no book, no reader. */
  Lgs = 'LGS',
}

/**
 * Who an attribution row credits.
 *
 * Two rows, always both, on every response (SPEC §6.2 item 3). They are NOT interchangeable and
 * neither can be dropped in favour of the other:
 *  - `youtube` discharges Developer Policies III.E.4 — the page must make clear that YouTube is
 *    the source. The ledger records that a text credit alone may not be sufficient (the Branding
 *    Guidelines require the logo too) and leaves that question open as `[SAĞLAYICIYA SOR]`; we
 *    carry both, which is strictly safer than either alone.
 *  - `partner` credits the content owner — the channel and the publisher. That obligation comes
 *    from `QUESTIONS.md` V-2 and `CONVENTIONS.md` §7, not from YouTube.
 *
 * The STRINGS are not here and are not minted in code: their canonical home is
 * `provenance/integrations.md`, "YouTube attribution — canonical strings". See
 * {@link BookAttributionDto}.
 */
export const BOOK_ATTRIBUTION_PROVIDER_YOUTUBE = 'youtube';

/** @see BOOK_ATTRIBUTION_PROVIDER_YOUTUBE */
export const BOOK_ATTRIBUTION_PROVIDER_PARTNER = 'partner';

/** @see BOOK_ATTRIBUTION_PROVIDER_YOUTUBE */
export type BookAttributionProviderId =
  typeof BOOK_ATTRIBUTION_PROVIDER_YOUTUBE | typeof BOOK_ATTRIBUTION_PROVIDER_PARTNER;

/**
 * Which key of the provider's thumbnail map a snapshot took its image from.
 *
 * Stored beside the URL so the SELECTION is auditable — "why is this video's cover smaller than
 * that one's" is answerable from the row rather than from re-reading the sync code. B4 walks the
 * ladder in declaration order and takes the first key the provider actually returned.
 *
 * Not published in any DTO: the reader is served a URL plus its measured width and height, and the
 * name of the rung it came from tells them nothing.
 */
export enum YoutubeThumbnailKey {
  Maxres = 'maxres',
  Standard = 'standard',
  High = 'high',
  Medium = 'medium',
  Default = 'default',
}
