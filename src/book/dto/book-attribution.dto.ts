import { ApiProperty } from '@nestjs/swagger';
import { BOOK_ATTRIBUTION_PROVIDER_YOUTUBE, type BookAttributionProviderId } from '../book.types';

/**
 * Provider attribution — DATA, and an obligation rather than a nicety.
 *
 * One row today, `youtube`: Developer Policies III.E.4 requires a page displaying YouTube content
 * to make clear that YouTube is the source. It is populated on every response, in every data
 * state — an empty array would be a breach, not a degraded widget, which is why the strings are a
 * COMPILED CONSTANT rather than seed data (the marine and earthquake attribution-catalogue
 * precedent: an unseeded database would otherwise serve the content uncredited).
 *
 * The strings live in `book-attribution.catalogue.ts` and are byte-pinned by its spec. They are
 * required attribution wording: copied verbatim, never translated, shortened or reworded.
 *
 * The Branding Guidelines also require the YouTube logo on any page where the API has a presence;
 * that is a web-repo asset, not an api field.
 *
 * No string on this leg may imply endorsement — not "YouTube onaylı", not "resmî YouTube
 * uygulaması". The repo's `endorsement-guard` denylist runs over every string
 * this leg serves.
 */
export class BookAttributionDto {
  @ApiProperty({
    type: String,
    enum: [BOOK_ATTRIBUTION_PROVIDER_YOUTUBE],
    description:
      'Machine token for whom this row credits. A closed set: adding a member is a breaking ' +
      'contract change.',
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
      "The channel page of the book's solutions channel, " +
      'https://www.youtube.com/channel/{youtubeChannelId}, or null when the book has no channel. ' +
      'The Branding Guidelines require a YouTube logo used for attribution to link back to YouTube ' +
      'content or to a YouTube component.',
  })
  channelUrl!: string | null;
}
