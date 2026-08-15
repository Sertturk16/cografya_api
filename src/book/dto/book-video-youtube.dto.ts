import { ApiProperty } from '@nestjs/swagger';

/**
 * The API-sourced enrichment for one video — **the only part of this contract that can be absent,
 * and its absence is a normal state rather than an error.**
 *
 * It is served only while the underlying snapshot is younger than the soft threshold (600 h ≈ 25
 * days), is present in the provider's answer, and exists at all. In every other case the parent's
 * `youtube` field is `null`: the sync has never run, the data aged past the soft threshold, or the
 * video stopped being returned. That is why the parent marks the field `nullable: true` — the web
 * repo reads the "do not emit `VideoObject`" decision from exactly there (SPEC §6.2 item 2), and
 * `SEO-POLICY.md` §B5 5.8 makes an invented structured-data field a BLOCKER while omitting the
 * block is only a lost enrichment.
 *
 * **Nothing on the page depends on this object.** The künye, the denemeler, the questions and the
 * 180 start seconds are ours; a total YouTube outage costs the `VideoObject` and the thumbnail.
 *
 * ## Retention — why this object is separate from its parent all the way up
 * Every field here is YouTube API Data under Developer Policies III.E.4.d, capped at 30 calendar
 * days. The split is a table in the database (`youtube_video_snapshots`) and a nested object in
 * the contract, for the same reason in both places: the perishable half can be deleted whole,
 * without a column list that can go stale.
 *
 * **POPULATED SINCE B4.** B3 shipped this schema with `youtube: null` on every video, because the
 * serving path and its age thresholds were B4's (`DEC 2026-08-15h` item 2). B4 landed them: the sync
 * leg writes `youtube_video_snapshots` on its own timer and `BookService` serves this object for
 * every video whose snapshot is inside the soft threshold. `null` remains the designed normal path
 * for the other four states — no snapshot yet, aged past soft, stopped being returned, already
 * purged — and none of them is an error.
 */
export class BookVideoYoutubeDto {
  @ApiProperty({
    type: String,
    description:
      'Thumbnail URL exactly as the provider returned it. NEVER construct this address from the ' +
      'video id — replacing API Data with independently computed data is barred (Developer ' +
      'Policies III.E.5). Hotlink it; do not copy, cache or optimise the bytes (III.E.1), which ' +
      'is why image optimisation is off on this surface.',
  })
  thumbnailUrl!: string;

  @ApiProperty({
    type: Number,
    minimum: 1,
    description:
      'Thumbnail width in pixels, as reported. Render the image with explicit dimensions: the ' +
      'facade reserves its box from these two numbers, which is how this surface holds CLS at 0.',
  })
  thumbnailWidth!: number;

  @ApiProperty({
    type: Number,
    minimum: 1,
    description: 'Thumbnail height in pixels, as reported.',
  })
  thumbnailHeight!: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: "The video's publication instant, UTC. Feeds VideoObject.uploadDate.",
  })
  publishedAtUtc!: string;

  @ApiProperty({
    type: String,
    example: 'PT6M8S',
    description:
      "Duration as the provider's raw ISO 8601 string. Published beside the parsed seconds " +
      'because the two are cross-checked on the write path: a parser that reads "PT6M8S" as 68 ' +
      'seconds passes every range invariant and is still wrong on the page.',
  })
  durationIso!: string;

  @ApiProperty({
    type: Number,
    minimum: 1,
    example: 368,
    description:
      'Duration in seconds, parsed from durationIso. The write path re-derives the ISO string ' +
      'from this integer and refuses a row that does not round-trip, so the two fields are ' +
      'guaranteed to agree on every served object.',
  })
  durationSeconds!: number;

  @ApiProperty({
    type: Boolean,
    description:
      'Whether the provider permits embedding. FALSE is not an error: the page then shows a ' +
      'typographic facade instead of the player and stays complete.',
  })
  embeddable!: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      'When WE fetched this snapshot, UTC — the instant the 30-day retention clock is measured ' +
      'from. Publish it as an absolute timestamp if it is shown at all; never as a standing ' +
      'promise about update frequency.',
  })
  dataFetchedAtUtc!: string;
}
