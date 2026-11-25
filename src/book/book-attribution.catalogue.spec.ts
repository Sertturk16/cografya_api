import { describe, expect, it } from '@jest/globals';
import { isEndorsementClaim } from '../common/attribution/endorsement-guard';
import {
  buildBookAttribution,
  YOUTUBE_PROVIDER_NAME,
  YOUTUBE_REQUIRED_NOTICE_TR,
  youtubeChannelUrl,
} from './book-attribution.catalogue';

/** A channel id of the real shape (`UC` + 22 characters) that names no real channel. */
const CHANNEL_ID = 'UCOrnek_Kanal_1234567890';

/** Every string the module actually serves, flattened — the corpus the guards below run over. */
function servedStrings(): string[] {
  return buildBookAttribution(CHANNEL_ID)
    .flatMap((row) => Object.values(row))
    .filter((value): value is string => typeof value === 'string');
}

/**
 * Byte-for-byte pins on the book attribution rows.
 *
 * ## Why literals live in THIS spec when the house rule forbids fact literals
 * `CONVENTIONS.md` §2 is "tests assert structure and invariants, never facts". Licence and
 * attribution strings are the ONE recorded exception (the W2a / M5 / CAMS precedent): a mandated
 * verbatim string is not a claim ABOUT the world — it IS the artifact under test. One changed letter
 * breaks the obligation, and no structural assertion can see that.
 *
 * ## The whole object, not a sample
 * The pin is `toEqual` over the entire served array, so no field can change without this test
 * changing with it. A sampled pin is how `CAMS_LICENCE_URL` went unpinned everywhere in the repo
 * while its docblock claimed otherwise (review #84).
 */
describe('book attribution catalogue', () => {
  it('pins EVERY served value byte-for-byte', () => {
    // The exported constant is pinned SEPARATELY from the built object. The object pin below would
    // still pass if the constant were replaced by an inline literal at the call site, which is
    // exactly how a ledger-sourced string quietly acquires a second copy.
    expect(YOUTUBE_REQUIRED_NOTICE_TR).toBe('Video kaynağı: YouTube');

    expect(buildBookAttribution(CHANNEL_ID)).toEqual([
      {
        providerId: 'youtube',
        providerName: 'YouTube',
        requiredNoticeTr: 'Video kaynağı: YouTube',
        licenceUrl: null,
        channelUrl: 'https://www.youtube.com/channel/UCOrnek_Kanal_1234567890',
      },
    ]);
  });

  it('never publishes a variant spelling of the YouTube brand', () => {
    // The exact forms the Branding Guidelines name: "You must never use the YouTube name or any
    // abbreviation, acronym, or variant of the word YouTube, such as YT or You-Tube". `Youtube`
    // (lowercase t) is the one a keyboard produces by accident and the one no structural check
    // would ever see — it is the same defect class as the CAMS capital-I.
    expect(YOUTUBE_PROVIDER_NAME).toBe('YouTube');
    // `for…of` over an empty array passes every assertion inside it, so a `servedStrings()` that
    // silently returned nothing would report this brand check green.
    expect(servedStrings().length).toBeGreaterThan(0);
    for (const value of servedStrings()) {
      expect(`${value} → ${String(/\bYoutube\b|\bYT\b|You-Tube/.test(value))}`).toBe(
        `${value} → false`,
      );
    }
  });

  it('carries NO endorsement claim in any served string (CONVENTIONS §7)', () => {
    // The guard itself — its patterns, its corpora and its pinned known limits — lives at
    // `src/common/attribution/endorsement-guard.ts`, one copy for every leg that serves strings.
    // What belongs here is only the corpus THIS module serves.
    expect(servedStrings().length).toBeGreaterThan(0);
    for (const value of servedStrings()) {
      expect(`${value} → ${String(isEndorsementClaim(value))}`).toBe(`${value} → false`);
    }
  });

  it("links each book to ITS OWN channel, built from the book's channel id", () => {
    // Two different ids must yield two different links: a compiled per-channel address would pass
    // a single-id pin and still credit the wrong channel on every other book.
    const otherId = 'UCBaska_Kanal_0987654321';
    expect(buildBookAttribution(CHANNEL_ID)[0]?.channelUrl).toBe(
      `https://www.youtube.com/channel/${CHANNEL_ID}`,
    );
    expect(buildBookAttribution(otherId)[0]?.channelUrl).toBe(
      `https://www.youtube.com/channel/${otherId}`,
    );
  });

  it('serves a null channel link when the book carries no channel id', () => {
    expect(youtubeChannelUrl(null)).toBeNull();
    expect(youtubeChannelUrl('')).toBeNull();
    // The credit itself does not depend on there being a channel to link to.
    expect(buildBookAttribution(null)).toEqual([
      {
        providerId: 'youtube',
        providerName: 'YouTube',
        requiredNoticeTr: 'Video kaynağı: YouTube',
        licenceUrl: null,
        channelUrl: null,
      },
    ]);
  });

  it('encodes the id, so a value outside the channel-id alphabet cannot leave the path', () => {
    // The column carries no CHECK on its alphabet and this value becomes an href.
    expect(youtubeChannelUrl('UC/../x?y')).toBe('https://www.youtube.com/channel/UC%2F..%2Fx%3Fy');
  });

  it('hands every response its own row objects (no shared mutable state)', () => {
    const first = buildBookAttribution(CHANNEL_ID);
    const second = buildBookAttribution(CHANNEL_ID);
    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
    expect(first).toEqual(second);
  });
});
