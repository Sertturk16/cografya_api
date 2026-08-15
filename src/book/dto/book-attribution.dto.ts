import { ApiProperty } from '@nestjs/swagger';
import {
  BOOK_ATTRIBUTION_PROVIDER_PARTNER,
  BOOK_ATTRIBUTION_PROVIDER_YOUTUBE,
  type BookAttributionProviderId,
} from '../book.types';

/**
 * Provider attribution — DATA, and an obligation rather than a nicety.
 *
 * Two rows on **every** response, always both, and neither substitutes for the other:
 *  - `youtube` discharges Developer Policies III.E.4 — a page displaying YouTube content must make
 *    clear that YouTube is the source;
 *  - `partner` credits the content owner, the channel and the publisher. That duty comes from
 *    `QUESTIONS.md` V-2 and `CONVENTIONS.md` §7, not from YouTube.
 *
 * Populated on every response including the cold path, at every data state — an empty array would
 * be a breach, not a degraded widget, which is also why B3 carries these as a COMPILED CONSTANT
 * rather than seed data (the marine and earthquake attribution-catalogue precedent: an unseeded
 * database would otherwise serve the content uncredited).
 *
 * ## Why this class carries no example strings in B1
 * The strings themselves are B3's (SPEC §16) and their canonical home is the ledger:
 * `provenance/integrations.md`, "YouTube attribution — canonical strings (binding for both YouTube
 * rows)". SPEC §10 records why they are not minted here — writing them into a committed artifact
 * the web repo codegens from, before B3's byte-pinned constant exists, produces a second copy that
 * can drift from the first. The descriptions point at the ledger instead. They are also the
 * untouchable class of `CONTENT-STYLE.md` §22 (licence, liability, attribution text): copied
 * verbatim, never translated, shortened or reworded.
 *
 * ## A text credit alone may not be enough, and that is recorded rather than resolved
 * The Branding Guidelines require the YouTube logo on any page where the API has a presence, and
 * the ledger leaves open — as `[SAĞLAYICIYA SOR]` — whether the icon alone satisfies III.E.4 on a
 * page whose player has not loaded yet. We carry both the string and the logo requirement, which
 * is strictly safer than either alone. Obtaining the official logo asset is an owner/Vera action
 * and is the one open blocker on this obligation; it is not an api field.
 *
 * No string on this leg may imply endorsement — not "YouTube onaylı", not "resmî YouTube
 * uygulaması", not "Coğrafya Gurmesi iş birliğiyle onaylanmıştır" (`CONVENTIONS.md` §7). The
 * repo's existing `endorsement-guard` denylist runs over every string this leg serves once B3
 * serves any.
 *
 * Served on every `GET /api/books/{slug}` response since B3. The strings now exist as compiled
 * constants in `book-attribution.catalogue.ts`, copied from the ledger and byte-pinned by its spec.
 */
export class BookAttributionDto {
  @ApiProperty({
    type: String,
    enum: [BOOK_ATTRIBUTION_PROVIDER_YOUTUBE, BOOK_ATTRIBUTION_PROVIDER_PARTNER],
    description:
      'Machine token for whom this row credits. Both rows are always present; the reader-facing ' +
      "grouping is the web layer's decision, not a reason to drop one.",
  })
  providerId!: BookAttributionProviderId;

  @ApiProperty({
    type: String,
    description:
      'Provider name as credited. Verbatim from the provenance ledger ' +
      '(provenance/integrations.md, "YouTube attribution — canonical strings"); never translated ' +
      'or shortened.',
  })
  providerName!: string;

  @ApiProperty({
    type: String,
    description:
      'The required attribution line, verbatim and untranslated. Its canonical text lives in ' +
      'provenance/integrations.md and is byte-pinned by a spec beside the catalogue. Display is ' +
      'the web repo\'s decision; carrying it on every response removes "it was not shown" as a ' +
      'possibility.',
  })
  requiredNoticeTr!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Licence URL when the obligation arises from a licence, or null when it does not. Null is ' +
      'a statement, not a gap: inventing a plausible URL would misdescribe the terms.',
  })
  licenceUrl!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Link the credit should point at — the channel or the publisher — or null. The Branding ' +
      'Guidelines require a YouTube logo used for attribution to link back to YouTube content or ' +
      'to a YouTube component.',
  })
  channelUrl!: string | null;
}
