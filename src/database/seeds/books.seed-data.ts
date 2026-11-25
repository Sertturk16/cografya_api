import { BookContentKind, ExamTrack } from '../../book/book.types';

/**
 * One book künye row, hand-seeded from a künye somebody read (SPEC §7.3).
 *
 * ## Every field is REQUIRED, and that is the retraction guard
 * `country.seed-data.ts` carries optional fields and pays for them with a `normalizeSeed` pass,
 * because TypeORM's `merge` reads `undefined` as "leave this column alone": dropping a
 * previously-published key would otherwise flag the row as drifted forever while the stale value
 * sat in the database. This type takes the cheaper route available to a table of hand-written
 * rows — nothing is optional, so retracting a value means writing `null` explicitly, and forgetting
 * a field is a COMPILE error rather than a silent no-write.
 *
 * ## The three editorial strings
 * `metaTitleTr`, `metaDescriptionTr` and `introTr` are each ONE unbroken string literal, with no
 * `+` concatenation: a concatenation join is where spaces get dropped, and a join that does not
 * exist cannot lose one. Prettier never splits a string
 * literal and this repo has no `max-len` rule, so nothing in the toolchain reintroduces one.
 *
 * `book-seed-invariants.ts` holds the structural ceilings (`CONTENT-STYLE.md` §2/§16/§17/§20) that
 * bind every book row.
 */
export interface BookSeed {
  readonly slugTr: string;
  readonly slugEn: string;
  readonly titleTr: string;
  readonly titleEn: string | null;
  readonly publisherName: string;
  /** Published credit order — never sorted (playbook §5, the `neighborIsoCodes` rule). */
  readonly authorNames: readonly string[];
  readonly isbn13: string;
  readonly pageCount: number;
  readonly examTrack: ExamTrack;
  readonly contentKind: BookContentKind;
  readonly coverImagePath: string | null;
  readonly purchaseUrl: string | null;
  readonly introTr: string;
  readonly introEn: string | null;
  readonly metaTitleTr: string;
  readonly metaDescriptionTr: string;
  readonly youtubePlaylistId: string | null;
  readonly youtubeChannelId: string;
  readonly displayOrder: number;
}

/**
 * The committed book corpus — empty today.
 *
 * An empty corpus is a working state: `pnpm db:seed:books` reports "nothing to seed" and exits 0,
 * the hub answers an empty list and every slug answers 404. A book added here must land in the
 * same PR as its committed etiket index, wired into `books.cli.ts` (see `validateBookSeedCorpus`),
 * and the seed refuses a non-empty corpus without one.
 */
export const SEED_BOOKS: readonly BookSeed[] = [];
