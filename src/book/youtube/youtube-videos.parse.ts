import { UpstreamSchemaError } from '../../upstream/upstream.types';
import { YoutubeThumbnailKey } from '../book.types';
import { parseDurationWithRoundTrip } from './iso8601-duration';

/**
 * Turning one `videos.list` body into rows we are willing to store.
 *
 * ## Two failure levels, deliberately not one
 * The ENVELOPE failing (not JSON, `items` absent or not an array) is a contract change and throws
 * {@link UpstreamSchemaError}, which the shared client maps to `schema_error` — an alarm-level log,
 * because everything downstream would otherwise keep "working" while publishing nothing (risk R11).
 *
 * One ITEM failing is not that. It is one video whose payload we will not store, on a tour that is
 * refreshing twenty-nine others: it is collected into {@link ParsedVideosList.rejected}, counted,
 * and the tour continues. Collapsing the two levels would let a single odd video stop the whole
 * refresh, which is the fail-soft rule inverted.
 *
 * ## What an item must satisfy to be accepted
 * Each of these is a column this leg would otherwise write a wrong or unstorable value into, and
 * three of them are obligations the B1 migration wrote down for B4 by name:
 *  - the id is present, is the 11-character YouTube shape and fits `varchar(16)`;
 *  - `contentDetails.duration` parses AND survives the round trip (SPEC §5.4), and is > 0 — the
 *    table's own `CHECK` says a zero-length video solution is a defect, not a state;
 *  - a thumbnail rung exists with a non-empty URL and POSITIVE integer dimensions (the facade
 *    reserves its box from them, so a zero would ship a layout shift);
 *  - `snippet.publishedAt` is a real instant;
 *  - `status.embeddable` is a boolean and `status.privacyStatus` a non-empty string that fits
 *    `varchar(16)`.
 *
 * ## What is deliberately NOT read
 * `snippet.title`, `snippet.description`, `snippet.localized.*`, the channel title and every
 * statistic. None is published, each would be API Data carrying a 30-day retention obligation for
 * nothing (SPEC §5.2), and the localized fields additionally arrive machine-translated under `hl` —
 * which is why the request never sends `hl` in the first place (SPEC §8.2).
 */

/** One row the tour is willing to write, in the entity's own vocabulary. */
export interface YoutubeSnapshotInput {
  readonly youtubeVideoId: string;
  readonly thumbnailKey: YoutubeThumbnailKey;
  readonly thumbnailUrl: string;
  readonly thumbnailWidth: number;
  readonly thumbnailHeight: number;
  readonly publishedAtUtc: Date;
  readonly durationIso: string;
  readonly durationSeconds: number;
  readonly embeddable: boolean;
  readonly privacyStatus: string;
}

/** One item the response carried and this leg refused, with the reason a human needs. */
export interface RejectedVideo {
  /** The id as far as it could be read; `'(unreadable id)'` when even that failed. */
  readonly youtubeVideoId: string;
  readonly reason: string;
}

export interface ParsedVideosList {
  readonly accepted: readonly YoutubeSnapshotInput[];
  readonly rejected: readonly RejectedVideo[];
}

/**
 * The `id` ceiling of one `videos.list` call, and therefore our chunk size (SPEC §8.2 step 2).
 *
 * Today's catalogue is 30 ids, so a tour is a single call costing one quota unit against a daily
 * allocation of 10 000. The constant is the provider's limit rather than our set size on purpose:
 * a second book must not silently start truncating the request.
 */
export const VIDEOS_LIST_MAX_IDS = 50;

/**
 * The `part` values this leg asks for — and no others.
 *
 * Every part costs quota and every part returns API Data we would then hold under the 30-day rule.
 * These three are exactly the ones §5.4's columns are filled from.
 */
export const VIDEOS_LIST_PARTS = 'snippet,contentDetails,status';

/**
 * The thumbnail ladder, best first (SPEC §8.2 step 4).
 *
 * Declaration order IS the selection order, and the chosen rung is stored beside the URL so that
 * "why is this cover smaller than that one" is answerable from the row.
 */
const THUMBNAIL_LADDER: readonly YoutubeThumbnailKey[] = [
  YoutubeThumbnailKey.Maxres,
  YoutubeThumbnailKey.Standard,
  YoutubeThumbnailKey.High,
  YoutubeThumbnailKey.Medium,
  YoutubeThumbnailKey.Default,
];

/** `book_videos` pins this shape with a CHECK constraint; the FK would refuse anything else. */
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** Column widths from the B1 migration — a value past one of them cannot be stored at all. */
const MAX_VIDEO_ID_LENGTH = 16;
const MAX_DURATION_ISO_LENGTH = 32;
const MAX_PRIVACY_STATUS_LENGTH = 16;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse one `videos.list` 200 body.
 *
 * @throws UpstreamSchemaError when the ENVELOPE is not the documented shape.
 */
export function parseVideosListResponse(body: string): ParsedVideosList {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (error: unknown) {
    // Rethrown as our own type rather than letting the SyntaxError travel: the client maps both to
    // `schema_error`, but only this one carries a message naming the caller.
    throw new UpstreamSchemaError(
      `videos.list body is not JSON — ${error instanceof Error ? error.message : 'unknown parse failure'}`,
    );
  }

  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new UpstreamSchemaError('videos.list body carries no `items` array');
  }

  const accepted: YoutubeSnapshotInput[] = [];
  const rejected: RejectedVideo[] = [];

  for (const item of payload.items) {
    const outcome = readItem(item);
    if ('reason' in outcome) {
      rejected.push(outcome);
    } else {
      accepted.push(outcome);
    }
  }

  return { accepted, rejected };
}

function readItem(item: unknown): YoutubeSnapshotInput | RejectedVideo {
  if (!isRecord(item)) {
    return { youtubeVideoId: '(unreadable id)', reason: 'item is not an object' };
  }

  const rawId: unknown = item.id;
  if (typeof rawId !== 'string' || !VIDEO_ID_PATTERN.test(rawId)) {
    return { youtubeVideoId: '(unreadable id)', reason: 'item carries no usable `id`' };
  }
  // Belt beside the pattern: the pattern pins 11 characters today, the column pins 16 forever, and
  // the day the id format grows the column is the one that decides what is storable.
  if (rawId.length > MAX_VIDEO_ID_LENGTH) {
    return { youtubeVideoId: '(unreadable id)', reason: 'id is longer than the column allows' };
  }
  const reject = (reason: string): RejectedVideo => ({ youtubeVideoId: rawId, reason });

  const snippet: unknown = item.snippet;
  const contentDetails: unknown = item.contentDetails;
  const status: unknown = item.status;
  if (!isRecord(snippet)) return reject('`snippet` is missing');
  if (!isRecord(contentDetails)) return reject('`contentDetails` is missing');
  if (!isRecord(status)) return reject('`status` is missing');

  const publishedAtRaw: unknown = snippet.publishedAt;
  if (typeof publishedAtRaw !== 'string') return reject('`snippet.publishedAt` is not a string');
  const publishedAtUtc = new Date(publishedAtRaw);
  if (Number.isNaN(publishedAtUtc.getTime())) {
    return reject(`\`snippet.publishedAt\` is not a readable instant: "${publishedAtRaw}"`);
  }

  const durationIso: unknown = contentDetails.duration;
  if (typeof durationIso !== 'string') return reject('`contentDetails.duration` is not a string');
  if (durationIso.length > MAX_DURATION_ISO_LENGTH) {
    return reject('`contentDetails.duration` is longer than the column allows');
  }
  // The fidelity rule, on the write path exactly as playbook §5 requires it (SPEC §5.4, §13 item 5).
  const durationSeconds = parseDurationWithRoundTrip(durationIso);
  if (durationSeconds === null) {
    return reject(`duration "${durationIso}" does not survive the seconds round trip`);
  }
  if (durationSeconds <= 0) {
    // The table's own CHECK says the same thing; refusing here keeps it a counted row rather than
    // an exception thrown inside a fail-soft loop.
    return reject(`duration "${durationIso}" is not positive`);
  }

  const embeddable: unknown = status.embeddable;
  if (typeof embeddable !== 'boolean') return reject('`status.embeddable` is not a boolean');

  const privacyStatus: unknown = status.privacyStatus;
  if (typeof privacyStatus !== 'string' || privacyStatus.length === 0) {
    return reject('`status.privacyStatus` is missing');
  }
  if (privacyStatus.length > MAX_PRIVACY_STATUS_LENGTH) {
    // Refused rather than truncated. The column is never published, so the cost of refusing is one
    // video's thumbnail; the cost of truncating is a stored provider value that says something the
    // provider did not, in the one column the sync leg uses to tell "gone" from "unlisted".
    return reject('`status.privacyStatus` is longer than the column allows');
  }

  const thumbnail = selectThumbnail(snippet.thumbnails);
  if (thumbnail === null) return reject('no thumbnail rung carried a usable url and dimensions');

  return {
    youtubeVideoId: rawId,
    thumbnailKey: thumbnail.key,
    thumbnailUrl: thumbnail.url,
    thumbnailWidth: thumbnail.width,
    thumbnailHeight: thumbnail.height,
    publishedAtUtc,
    durationIso,
    durationSeconds,
    embeddable,
    privacyStatus,
  };
}

interface SelectedThumbnail {
  readonly key: YoutubeThumbnailKey;
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

/**
 * The first rung of the ladder the provider actually returned, complete.
 *
 * "Complete" is the operative word: a rung whose dimensions are missing, zero or fractional is
 * SKIPPED rather than repaired, and the walk continues down the ladder. A smaller cover is a
 * cosmetic loss; a fabricated dimension is a layout shift on every visit, and a constructed URL
 * would breach Developer Policies III.E.5 outright — which is why nothing here ever builds an
 * address from the video id (SPEC §4.4).
 */
function selectThumbnail(thumbnails: unknown): SelectedThumbnail | null {
  if (!isRecord(thumbnails)) return null;

  for (const key of THUMBNAIL_LADDER) {
    const rung: unknown = thumbnails[key];
    if (!isRecord(rung)) continue;

    const url: unknown = rung.url;
    const width: unknown = rung.width;
    const height: unknown = rung.height;
    if (typeof url !== 'string' || url.length === 0) continue;
    if (typeof width !== 'number' || !Number.isInteger(width) || width <= 0) continue;
    if (typeof height !== 'number' || !Number.isInteger(height) || height <= 0) continue;

    return { key, url, width, height };
  }

  return null;
}
