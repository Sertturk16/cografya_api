import type { DataSource } from 'typeorm';
import { BookContentKind, ExamTrack } from '../../../src/book/book.types';
import {
  parseBookTimestampsArtifact,
  type BookTimestampsArtifact,
} from '../../../src/database/seeds/book-timestamps.artifact';
import type { BookSeed } from '../../../src/database/seeds/books.seed-data';
import { seedBooks, type SeedBooksResult } from '../../../src/database/seeds/seed-books';

/**
 * A fictional book and its etiket index, for every spec that needs a seeded catalogue.
 *
 * The committed corpus (`SEED_BOOKS`) is empty, so suites that read or write book rows seed this
 * instead, through the same `seedBooks` path a real book takes. Nothing here is a real künye, a real
 * channel or a measured second: the slug, ISBN, channel id and video ids are invented, and the ISBN
 * carries a valid check digit only so it has the shape a real one has.
 *
 * `FIXTURE_BOOK` passes `assertBookSeedInvariants` (prose ceilings, column lengths, id shapes) and
 * sits inside the SEO length bands, so seeding it prints no notes.
 */
export const FIXTURE_BOOK: BookSeed = {
  slugTr: 'ornek-deneme-kitabi',
  slugEn: 'sample-practice-book',
  titleTr: 'Örnek Deneme Kitabı',
  titleEn: null,
  publisherName: 'Örnek Yayınları',
  authorNames: ['Ada Lovelace', 'Grace Hopper'],
  isbn13: '9780000000002',
  pageCount: 120,
  examTrack: ExamTrack.Ayt,
  contentKind: BookContentKind.Deneme,
  coverImagePath: '/kitaplar/ornek-deneme-kitabi.webp',
  purchaseUrl: 'https://example.com/kitap/ornek-deneme-kitabi',
  introTr:
    'Örnek Deneme Kitabı, testler için yazılmış kurmaca bir deneme kitabıdır. Gerçek bir yayına karşılık gelmez.\n\nHer denemenin çözümü ayrı bir videoda yer alır ve her sorunun videoda başladığı an ayrıca işaretlidir.',
  introEn: null,
  metaTitleTr: 'Örnek Deneme Kitabı Video Çözümleri',
  metaDescriptionTr:
    'Testler için yazılmış kurmaca bir deneme kitabı. Deneme çözümleri video olarak burada; her sorunun videoda başladığı an ayrı ayrı işaretli.',
  youtubePlaylistId: 'PLOrnek_Liste_00000000000000000',
  youtubeChannelId: 'UCOrnek_Kanal_1234567890',
  displayOrder: 1,
};

/** Enough for the suites that hand every case its own video (video-progress uses 16). */
export const FIXTURE_VIDEO_COUNT = 24;

/** An 11-character id of the `CHK_book_videos_youtube_video_id` alphabet, never a parking id. */
export function fixtureVideoId(orderNo: number): string {
  return `fixVid${String(orderNo).padStart(5, '0')}`;
}

/**
 * The etiket index in the measured source's own JSON shape (`videoId`, `deneme`, `title`,
 * `timestamps[].tag`), two or three marks per video at invented, strictly ascending seconds.
 */
export function fixtureArtifactRecords(videoCount: number = FIXTURE_VIDEO_COUNT): unknown[] {
  return Array.from({ length: videoCount }, (_value, index) => {
    const orderNo = index + 1;
    const markCount = 2 + (orderNo % 2);
    return {
      videoId: fixtureVideoId(orderNo),
      deneme: orderNo,
      title: `Örnek Deneme ${String(orderNo)}`,
      timestamps: Array.from({ length: markCount }, (_mark, position) => ({
        tag: `Soru ${String(position + 1)}`,
        startingSecond: orderNo + position * 60,
      })),
    };
  });
}

/**
 * The etiket index, reduced the way a committed artefact is: through `parseBookTimestampsArtifact`,
 * so the fixture passes the same seven refusals a real `timestamps.json` does.
 */
export function buildFixtureArtifact(
  videoCount: number = FIXTURE_VIDEO_COUNT,
): BookTimestampsArtifact {
  return parseBookTimestampsArtifact(fixtureArtifactRecords(videoCount), 'fixture-books');
}

/** Seeds {@link FIXTURE_BOOK} with its etiket index through the shipped `seedBooks`. */
export function seedFixtureBooks(dataSource: DataSource): Promise<SeedBooksResult> {
  return seedBooks(dataSource, {
    books: [FIXTURE_BOOK],
    artifact: buildFixtureArtifact(),
    ownerSlugTr: FIXTURE_BOOK.slugTr,
  });
}
