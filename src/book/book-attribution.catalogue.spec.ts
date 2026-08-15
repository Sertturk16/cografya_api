import { describe, expect, it } from '@jest/globals';
import { isEndorsementClaim } from '../common/attribution/endorsement-guard';
import { SEED_BOOKS } from '../database/seeds/books.seed-data';
import {
  buildBookAttribution,
  PARTNER_PROVIDER_NAME,
  PARTNER_REQUIRED_NOTICE_TR,
  YOUTUBE_PROVIDER_NAME,
  YOUTUBE_REQUIRED_NOTICE_TR,
  youtubeChannelUrl,
} from './book-attribution.catalogue';

/**
 * A SYNTHETIC channel id. The real one is a fact that belongs to the seed and the ledger, and
 * re-typing it here would make this spec assert a fact rather than a shape. Everything below that
 * involves the id is derived from this value, so the cases stay structural.
 */
const TEST_CHANNEL_ID = 'UC_test_channel';

/** Every string the module actually serves, flattened — the corpus the guards below run over. */
function servedStrings(): string[] {
  return buildBookAttribution(TEST_CHANNEL_ID)
    .flatMap((row) => Object.values(row))
    .filter((value): value is string => typeof value === 'string');
}

/**
 * Byte-for-byte pins on the book attribution rows — ALL of them.
 *
 * ## Why literals live in THIS spec when the house rule forbids fact literals
 * `CONVENTIONS.md` §2 is "tests assert structure and invariants, never facts". Licence and
 * attribution strings are the ONE recorded exception (the W2a / M5 / CAMS precedent): a mandated
 * verbatim string is not a claim ABOUT the world that a separate fact-check owns — it IS the
 * artifact under test. One changed letter breaks the obligation, and no structural assertion can
 * see that. The accepted text is `provenance/integrations.md`, "YouTube attribution — canonical
 * strings" and "Other `BookAttributionDto` values sourced from this ledger".
 *
 * The exception is narrow: it covers ledger-sourced verbatim strings and nothing else. Do not cite
 * it to hardcode a deneme count, a start second or any other measured number.
 *
 * ## The whole object, not a sample
 * The pin is `toEqual` over the entire served array, so no field can change without this test
 * changing with it. A sampled pin is how `CAMS_LICENCE_URL` went unpinned everywhere in the repo
 * while its docblock claimed otherwise (review #84).
 */
describe('book attribution catalogue', () => {
  it('pins EVERY served value byte-for-byte, both rows', () => {
    // The exported constants are pinned SEPARATELY from the built object. The object pin below
    // would still pass if a constant were replaced by an inline literal at the call site, which is
    // exactly how a ledger-sourced string quietly acquires a second copy.
    expect(YOUTUBE_REQUIRED_NOTICE_TR).toBe('Video kaynağı: YouTube');
    expect(PARTNER_REQUIRED_NOTICE_TR).toBe(
      "Video çözümler Coğrafya Gurmesi kanalına, kitap Coğrafya Gurmesi Yayınları'na aittir.",
    );

    expect(buildBookAttribution(TEST_CHANNEL_ID)).toEqual([
      {
        providerId: 'youtube',
        providerName: 'YouTube',
        requiredNoticeTr: 'Video kaynağı: YouTube',
        licenceUrl: null,
        channelUrl: `https://www.youtube.com/channel/${TEST_CHANNEL_ID}`,
      },
      {
        providerId: 'partner',
        providerName: 'Coğrafya Gurmesi',
        requiredNoticeTr:
          "Video çözümler Coğrafya Gurmesi kanalına, kitap Coğrafya Gurmesi Yayınları'na aittir.",
        licenceUrl: null,
        channelUrl: `https://www.youtube.com/channel/${TEST_CHANNEL_ID}`,
      },
    ]);
  });

  it('never publishes a variant spelling of the YouTube brand', () => {
    // The exact forms the Branding Guidelines name: "You must never use the YouTube name or any
    // abbreviation, acronym, or variant of the word YouTube, such as YT or You-Tube". `Youtube`
    // (lowercase t) is the one a keyboard produces by accident and the one no structural check
    // would ever see — it is the same defect class as the CAMS capital-I.
    expect(YOUTUBE_PROVIDER_NAME).toBe('YouTube');
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

  it('composes channelUrl from the column rather than storing an address', () => {
    // `DEC 2026-08-15h` item 4: the attribution STRINGS are the ledger's, a URL FORM is not.
    // Asserted through the id this test owns, so the case says "the id reaches the URL" without
    // pinning which channel the catalogue happens to be used for.
    expect(youtubeChannelUrl(TEST_CHANNEL_ID)).toContain(TEST_CHANNEL_ID);
    expect(youtubeChannelUrl('UC_other')).toBe('https://www.youtube.com/channel/UC_other');
    for (const row of buildBookAttribution(TEST_CHANNEL_ID)) {
      expect(row.channelUrl).toBe(youtubeChannelUrl(TEST_CHANNEL_ID));
    }
  });

  it('hands every response its own row objects (no shared mutable state)', () => {
    const first = buildBookAttribution(TEST_CHANNEL_ID);
    const second = buildBookAttribution(TEST_CHANNEL_ID);
    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
    expect(first).toEqual(second);
  });

  /**
   * The partner boundary — no fact literal, and it cannot pass vacuously.
   *
   * {@link PARTNER_REQUIRED_NOTICE_TR} names one partner, so it is correct for exactly the books
   * that channel publishes. Rather than building an abstraction for a second partner nobody has
   * (`ENGINEERING.md` §12), this asserts the premise the compiled credit rests on. A seeded book on
   * another channel turns it red on the PR that adds the book, which is where the question belongs.
   *
   * `toBe(1)` rather than `toBeLessThanOrEqual(1)` on purpose: an empty corpus yields a set of size
   * 0 and FAILS, so this case can never report a green on nothing — the "nothing expected" refusal
   * (`ENGINEERING.md` §8) in the form this assertion can carry.
   */
  it('every seeded book shares one channel — the compiled partner credit names one partner', () => {
    expect(SEED_BOOKS.length).toBeGreaterThan(0);
    expect(new Set(SEED_BOOKS.map((book) => book.youtubeChannelId)).size).toBe(1);
  });

  it('exports the partner name as the shared root, not a compound nobody uses', () => {
    // Recorded rather than smoothed: this value drops the publisher's `Yayınları`, and the reader
    // loses nothing because `requiredNoticeTr` names both parties in full. Asserted so the lossy
    // half stays visible instead of drifting into a hand-built compound
    // (`FU-BOOK-ATTRIBUTION-PARTNER-SPLIT`).
    expect(PARTNER_PROVIDER_NAME).toBe('Coğrafya Gurmesi');
    expect(PARTNER_REQUIRED_NOTICE_TR).toContain(PARTNER_PROVIDER_NAME);
  });
});
