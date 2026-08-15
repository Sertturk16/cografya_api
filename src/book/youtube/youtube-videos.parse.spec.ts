import { describe, expect, it } from '@jest/globals';
import { UpstreamSchemaError } from '../../upstream/upstream.types';
import { YoutubeThumbnailKey } from '../book.types';
import { parseVideosListResponse } from './youtube-videos.parse';

/**
 * Structural only, and SYNTHETIC by necessity.
 *
 * Every fixture below is hand-built: ids are `aaaaaaaaaaa`-shaped, thumbnail addresses are
 * `https://example.invalid/…`, and no value is transcribed from a real `videos.list` answer. That
 * is not squeamishness about test data — a committed fixture holding real API Data would be stored
 * API Data, and Developer Policies III.E.4.d caps that at 30 calendar days, which a file in git
 * cannot honour. The SHAPE is what these assert, and the shape is what was measured live.
 */

/** One well-formed item; each case below deforms exactly one thing about it. */
function item(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'aaaaaaaaaaa',
    snippet: {
      publishedAt: '2026-05-07T12:50:41Z',
      title: 'a title this leg must not store',
      description: 'a description this leg must not store',
      thumbnails: {
        default: { url: 'https://example.invalid/d.jpg', width: 120, height: 90 },
        medium: { url: 'https://example.invalid/m.jpg', width: 320, height: 180 },
        high: { url: 'https://example.invalid/h.jpg', width: 480, height: 360 },
        standard: { url: 'https://example.invalid/s.jpg', width: 640, height: 480 },
        maxres: { url: 'https://example.invalid/x.jpg', width: 1280, height: 720 },
      },
      localized: { title: 'a machine translation this leg must not read' },
    },
    contentDetails: { duration: 'PT7M56S', dimension: '2d', definition: 'hd' },
    status: { uploadStatus: 'processed', privacyStatus: 'public', embeddable: true },
    ...overrides,
  };
}

function body(items: unknown[]): string {
  return JSON.stringify({ kind: 'youtube#videoListResponse', items, pageInfo: {} });
}

describe('parseVideosListResponse — the envelope', () => {
  it('throws a schema error when the body is not JSON', () => {
    // Surfaces as `schema_error`: an alarm-level log and no retry, because the provider's contract
    // moved under us and everything downstream would otherwise keep "working" while publishing
    // nothing (risk R11).
    expect(() => parseVideosListResponse('<html>nope</html>')).toThrow(UpstreamSchemaError);
  });

  it('throws a schema error when `items` is absent or not an array', () => {
    expect(() => parseVideosListResponse(JSON.stringify({ kind: 'x' }))).toThrow(
      UpstreamSchemaError,
    );
    expect(() => parseVideosListResponse(JSON.stringify({ items: {} }))).toThrow(
      UpstreamSchemaError,
    );
  });

  it('accepts an EMPTY items array — that is how the provider says "none of these ids exist"', () => {
    const parsed = parseVideosListResponse(body([]));
    expect(parsed.accepted).toEqual([]);
    expect(parsed.rejected).toEqual([]);
  });
});

describe('parseVideosListResponse — one item', () => {
  it('reads exactly the columns §5.4 holds, and nothing else', () => {
    const [row] = parseVideosListResponse(body([item()])).accepted;

    expect(row).toEqual({
      youtubeVideoId: 'aaaaaaaaaaa',
      thumbnailKey: YoutubeThumbnailKey.Maxres,
      thumbnailUrl: 'https://example.invalid/x.jpg',
      thumbnailWidth: 1280,
      thumbnailHeight: 720,
      publishedAtUtc: new Date('2026-05-07T12:50:41Z'),
      durationIso: 'PT7M56S',
      durationSeconds: 476,
      embeddable: true,
      privacyStatus: 'public',
    });
    // The whole-object comparison above is the assertion that matters: a title, a description or a
    // localized field creeping into the row would fail it. Each would be API Data carrying a 30-day
    // retention obligation for a value nothing publishes (SPEC §5.2).
  });

  it('walks the thumbnail ladder in declaration order and records the rung it took', () => {
    const noMaxres = item({
      snippet: {
        publishedAt: '2026-05-07T12:50:41Z',
        thumbnails: {
          default: { url: 'https://example.invalid/d.jpg', width: 120, height: 90 },
          high: { url: 'https://example.invalid/h.jpg', width: 480, height: 360 },
        },
      },
    });
    const [row] = parseVideosListResponse(body([noMaxres])).accepted;
    expect(row?.thumbnailKey).toBe(YoutubeThumbnailKey.High);
    expect(row?.thumbnailUrl).toBe('https://example.invalid/h.jpg');
  });

  it('SKIPS a rung whose dimensions are unusable and keeps walking, rather than repairing it', () => {
    // A fabricated dimension is a layout shift on every visit; a smaller cover is nothing. The
    // B1 migration names this as a B4 obligation: reject a non-positive width or height at parse.
    const brokenMaxres = item({
      snippet: {
        publishedAt: '2026-05-07T12:50:41Z',
        thumbnails: {
          maxres: { url: 'https://example.invalid/x.jpg', width: 0, height: 720 },
          standard: { url: 'https://example.invalid/s.jpg', width: 640, height: 480 },
        },
      },
    });
    const [row] = parseVideosListResponse(body([brokenMaxres])).accepted;
    expect(row?.thumbnailKey).toBe(YoutubeThumbnailKey.Standard);
  });

  it('SKIPS a rung whose URL is not a bounded `https` address, and keeps walking', () => {
    // The thumbnail URL is the one provider string this leg republishes to a reader — into the
    // payload and into `VideoObject` — and it lands in an unbounded `text` column that nothing
    // downstream re-validates. So the rung carries a scheme and a length check, and failing either
    // costs a sharper cover rather than the whole video (PR #111 SEC111-M1).
    const badRungs = item({
      snippet: {
        publishedAt: '2026-05-07T12:50:41Z',
        thumbnails: {
          // Mixed content: it would not load on an HTTPS page.
          maxres: { url: 'http://example.invalid/x.jpg', width: 1280, height: 720 },
          // Not an address at all.
          standard: { url: 'javascript:alert(1)', width: 640, height: 480 },
          // Past the 512-character ceiling.
          high: { url: `https://example.invalid/${'a'.repeat(600)}.jpg`, width: 480, height: 360 },
          medium: { url: 'https://example.invalid/m.jpg', width: 320, height: 180 },
        },
      },
    });
    const [row] = parseVideosListResponse(body([badRungs])).accepted;
    expect(row?.thumbnailKey).toBe(YoutubeThumbnailKey.Medium);
    expect(row?.thumbnailUrl).toBe('https://example.invalid/m.jpg');
  });

  it('rejects the item when NO rung is usable', () => {
    const noThumbnails = item({
      snippet: { publishedAt: '2026-05-07T12:50:41Z', thumbnails: { maxres: { url: '' } } },
    });
    const parsed = parseVideosListResponse(body([noThumbnails]));
    expect(parsed.accepted).toEqual([]);
    expect(parsed.rejected[0]?.youtubeVideoId).toBe('aaaaaaaaaaa');
  });

  it('rejects the item when every rung fails the URL gate — refusing down the ladder has an end', () => {
    const allInsecure = item({
      snippet: {
        publishedAt: '2026-05-07T12:50:41Z',
        thumbnails: {
          maxres: { url: 'http://example.invalid/x.jpg', width: 1280, height: 720 },
          medium: { url: 'http://example.invalid/m.jpg', width: 320, height: 180 },
        },
      },
    });
    const parsed = parseVideosListResponse(body([allInsecure]));
    expect(parsed.accepted).toEqual([]);
    expect(parsed.rejected[0]?.reason).toContain('thumbnail');
  });
});

describe('parseVideosListResponse — a bad item is a counted row, never a thrown tour', () => {
  const cases: readonly { readonly label: string; readonly deformed: Record<string, unknown> }[] = [
    { label: 'no id', deformed: item({ id: undefined }) },
    { label: 'an id of the wrong shape', deformed: item({ id: 'too-short' }) },
    { label: 'no snippet', deformed: item({ snippet: undefined }) },
    { label: 'no contentDetails', deformed: item({ contentDetails: undefined }) },
    { label: 'no status', deformed: item({ status: undefined }) },
    {
      label: 'an unreadable publishedAt',
      deformed: item({
        snippet: {
          publishedAt: 'the seventh of May',
          thumbnails: { high: { url: 'https://example.invalid/h.jpg', width: 480, height: 360 } },
        },
      }),
    },
    {
      label: 'a duration that does not round-trip',
      deformed: item({ contentDetails: { duration: 'PT60S' } }),
    },
    { label: 'a zero duration', deformed: item({ contentDetails: { duration: 'PT0S' } }) },
    {
      label: 'a non-boolean embeddable',
      deformed: item({ status: { privacyStatus: 'public', embeddable: 'yes' } }),
    },
    { label: 'no privacyStatus', deformed: item({ status: { embeddable: true } }) },
    {
      label: 'a privacyStatus past the column width',
      deformed: item({ status: { embeddable: true, privacyStatus: 'x'.repeat(17) } }),
    },
  ];

  for (const { label, deformed } of cases) {
    it(`collects ${label} into rejected and keeps the good item`, () => {
      const parsed = parseVideosListResponse(body([deformed, item({ id: 'bbbbbbbbbbb' })]));

      // The GOOD item still lands. That is the whole property: one odd video must not stop a tour
      // refreshing twenty-nine others.
      expect(parsed.accepted.map((row) => row.youtubeVideoId)).toEqual(['bbbbbbbbbbb']);
      expect(parsed.rejected).toHaveLength(1);
      expect(parsed.rejected[0]?.reason.length).toBeGreaterThan(0);
    });
  }

  it('names the id in the rejection when it could be read, and says so when it could not', () => {
    const parsed = parseVideosListResponse(body([item({ contentDetails: {} }), item({ id: 42 })]));
    expect(parsed.rejected.map((row) => row.youtubeVideoId)).toEqual([
      'aaaaaaaaaaa',
      '(unreadable id)',
    ]);
  });

  it('BOUNDS and ESCAPES the provider value it quotes back into the reason', () => {
    // The reason reaches a WARN line, up to fifty a tour. Unbounded it is a giant log entry; with a
    // raw newline in it, it is a forged second entry (PR #111 SEC111-M2 — the repo's own
    // `ads-jobs.ts` `slice(0, 128)` is the discipline this restates).
    // The newline sits INSIDE the first 64 characters on purpose: past the slice it would be
    // dropped by the bound alone, and the escape half would go untested.
    const hostile = `${'x'.repeat(20)}\nWARN a line nobody logged\n${'y'.repeat(500)}`;
    const parsed = parseVideosListResponse(
      body([
        item({
          snippet: {
            publishedAt: hostile,
            thumbnails: { high: { url: 'https://example.invalid/h.jpg', width: 480, height: 360 } },
          },
        }),
      ]),
    );

    const reason = parsed.rejected[0]?.reason ?? '';
    expect(reason).not.toContain('\n');
    // Comfortably under one line: the quoted value is capped at 64 characters plus the sentence.
    expect(reason.length).toBeLessThan(160);
    expect(reason).toContain('xxxx');
  });
});
