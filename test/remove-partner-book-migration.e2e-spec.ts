import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { AccountRole, AccountStatus } from '../src/auth/account.types';
import { User } from '../src/auth/entities/user.entity';
import { buildDataSourceOptions } from '../src/database/data-source-options';
import {
  REMOVED_BOOK_SLUG_TR,
  RemovePartnerBook1790640000000,
} from '../src/database/migrations/1790640000000-RemovePartnerBook';
import { seedGeography } from '../src/database/seeds/seed-geography';
import { seedReference } from '../src/database/seeds/seed-reference';
import { District } from '../src/reference/entities/district.entity';

/**
 * `RemovePartnerBook` on a real Postgres: it deletes the removed book with everything that hangs
 * off it — videos, etiketler, YouTube snapshots and users' progress (whose FK is RESTRICT, so the
 * order matters) — leaves another book and the user untouched, and is a no-op when run again.
 *
 * The fixture is written with raw SQL BEFORE the migration runs: the subject is rewound by name
 * (so a later migration costs this suite nothing), the rows are inserted, and the runner applies
 * it again exactly as a deploy would. Geography and reference are seeded only because
 * `users.district_id` needs a real row to point at.
 */
describe('RemovePartnerBook migration (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;

  const SUBJECT = RemovePartnerBook1790640000000.name;
  const OTHER_SLUG = 'baska-kitap';

  async function lastAppliedMigration(): Promise<string | undefined> {
    const rows = await dataSource.query<{ name: string }[]>(
      `SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 1`,
    );
    return rows[0]?.name;
  }

  /** One book with `videoIds.length` videos, two etiketler each, a snapshot on the first video. */
  async function insertBook(slug: string, isbn: string, videoIds: string[]): Promise<string[]> {
    const [book] = await dataSource.query<{ id: string }[]>(
      `
        INSERT INTO "books" (
          "slug_tr", "slug_en", "title_tr", "publisher_name", "author_names", "isbn13",
          "page_count", "exam_track", "intro_tr", "meta_title_tr", "meta_description_tr",
          "youtube_channel_id", "display_order", "content_kind"
        ) VALUES (
          $1, $1, 'Fixture', 'Fixture Publisher', ARRAY['Fixture Author'], $2, 100, 'AYT',
          'fixture', 'fixture', 'fixture', 'UCfixturefixture1', 0, 'deneme'
        ) RETURNING "id"
      `,
      [slug, isbn],
    );
    if (!book) throw new Error(`fixture book ${slug} was not inserted`);

    const bookVideoIds: string[] = [];
    for (const [index, videoId] of videoIds.entries()) {
      const [video] = await dataSource.query<{ id: string }[]>(
        `INSERT INTO "book_videos" ("book_id", "order_no", "youtube_video_id")
         VALUES ($1, $2, $3) RETURNING "id"`,
        [book.id, index + 1, videoId],
      );
      if (!video) throw new Error(`fixture video ${videoId} was not inserted`);
      bookVideoIds.push(video.id);
      await dataSource.query(
        `INSERT INTO "book_video_tags" ("book_video_id", "order_no", "start_second")
         VALUES ($1, 1, 0), ($1, 2, 60)`,
        [video.id],
      );
    }

    await dataSource.query(
      `
        INSERT INTO "youtube_video_snapshots" (
          "youtube_video_id", "thumbnail_key", "thumbnail_url", "thumbnail_width",
          "thumbnail_height", "published_at_utc", "duration_iso", "duration_seconds",
          "embeddable", "privacy_status", "fetched_at_utc"
        ) VALUES (
          $1, 'high', 'https://i.ytimg.com/vi/fixture/hqdefault.jpg', 480, 360, now(), 'PT10M',
          600, true, 'public', now()
        )
      `,
      [videoIds[0]],
    );
    return bookVideoIds;
  }

  async function insertProgress(userId: string, bookVideoId: string): Promise<void> {
    await dataSource.query(
      `INSERT INTO "video_progress" ("user_id", "book_video_id", "last_position_seconds")
       VALUES ($1, $2, 30)`,
      [userId, bookVideoId],
    );
  }

  /** Every row the two fixture books own, per table, keyed by the book's slug. */
  async function rowsOf(slug: string): Promise<Record<string, number>> {
    const [counts] = await dataSource.query<Record<string, number>[]>(
      `
        WITH b AS (SELECT "id" FROM "books" WHERE "slug_tr" = $1),
             v AS (SELECT "id", "youtube_video_id" FROM "book_videos" WHERE "book_id" IN (SELECT "id" FROM b))
        SELECT
          (SELECT count(*)::int FROM b) AS books,
          (SELECT count(*)::int FROM v) AS videos,
          (SELECT count(*)::int FROM "book_video_tags" WHERE "book_video_id" IN (SELECT "id" FROM v)) AS tags,
          (SELECT count(*)::int FROM "youtube_video_snapshots"
             WHERE "youtube_video_id" IN (SELECT "youtube_video_id" FROM v)) AS snapshots,
          (SELECT count(*)::int FROM "video_progress" WHERE "book_video_id" IN (SELECT "id" FROM v)) AS progress
      `,
      [slug],
    );
    if (!counts) throw new Error('count query returned no row');
    return counts;
  }

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    dataSource = new DataSource(buildDataSourceOptions(container.getConnectionUri()));
    await dataSource.initialize();
    await dataSource.runMigrations();
    await seedGeography(dataSource);
    await seedReference(dataSource);
  }, 300_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    await container?.stop();
  });

  it('deletes the removed book with its videos, etiketler, snapshots and progress, and nothing else', async () => {
    // Step 1 — rewind to just before the subject, by name, so its `up()` runs on the fixture.
    for (let guard = 0; guard < 20; guard += 1) {
      const last = await lastAppliedMigration();
      if (!last) throw new Error('rewound past every migration without reaching the subject');
      await dataSource.undoLastMigration();
      if (last === SUBJECT) break;
    }
    expect(await lastAppliedMigration()).not.toBe(SUBJECT);

    // Step 2 — the fixture: the removed book and another book, each with progress from one user.
    const district = await dataSource.getRepository(District).findOneOrFail({ where: {} });
    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        firstName: 'Remove',
        lastName: 'Migration',
        phone: '+905000000007',
        email: 'remove-partner-book@example.test',
        // A properly-shaped, unreachable Argon2id hash — no live password behind it.
        passwordHash:
          '$argon2id$v=19$m=19456,p=1,t=2$APrKX34k6VE7WGm0QyxNUA$fUFGautIsXjwaF9PfALc5EeetF5UHJq43ElafSQOVPM',
        accountRole: AccountRole.Teacher,
        educationLevel: null,
        gradeLevel: null,
        studyStream: null,
        universityName: null,
        departmentName: null,
        districtId: district.id,
        status: AccountStatus.Active,
        emailVerifiedAt: new Date(),
      }),
    );

    const removedVideos = await insertBook(REMOVED_BOOK_SLUG_TR, '9780000000002', [
      'rmv00000001',
      'rmv00000002',
    ]);
    const keptVideos = await insertBook(OTHER_SLUG, '9780000000019', ['kpt00000001']);
    for (const bookVideoId of [...removedVideos, ...keptVideos]) {
      await insertProgress(user.id, bookVideoId);
    }

    // The precondition IS the control: every table holds rows for both books before the run, so
    // "gone afterwards" cannot be true for the wrong reason.
    expect(await rowsOf(REMOVED_BOOK_SLUG_TR)).toEqual({
      books: 1,
      videos: 2,
      tags: 4,
      snapshots: 1,
      progress: 2,
    });
    const keptBefore = await rowsOf(OTHER_SLUG);
    expect(keptBefore).toEqual({ books: 1, videos: 1, tags: 2, snapshots: 1, progress: 1 });

    // Step 3 — the runner applies the subject, as a deploy does.
    await dataSource.runMigrations();
    expect(await lastAppliedMigration()).toBe(SUBJECT);

    expect(await rowsOf(REMOVED_BOOK_SLUG_TR)).toEqual({
      books: 0,
      videos: 0,
      tags: 0,
      snapshots: 0,
      progress: 0,
    });
    // No orphan survives under the removed video ids either (the count above joins through the
    // book, which no longer exists, so it would read 0 even for orphans).
    const [orphans] = await dataSource.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM "video_progress" WHERE "book_video_id" = ANY($1::uuid[])`,
      [removedVideos],
    );
    expect(orphans?.count).toBe(0);
    expect(await rowsOf(OTHER_SLUG)).toEqual(keptBefore);
    expect(await dataSource.getRepository(User).countBy({ id: user.id })).toBe(1);

    // Step 4 — a second run (a database without the book) and `down()` both change nothing.
    const migration = new RemovePartnerBook1790640000000();
    const queryRunner = dataSource.createQueryRunner();
    try {
      await migration.up(queryRunner);
      await migration.down();
    } finally {
      await queryRunner.release();
    }
    expect(await rowsOf(OTHER_SLUG)).toEqual(keptBefore);
  }, 300_000);
});
