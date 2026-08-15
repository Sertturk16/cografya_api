import { ExamTrack } from '../../book/book.types';

/**
 * The book künye rows — one today, hand-seeded from a künye somebody read (SPEC §7.3, PR B2).
 *
 * ## Every field is REQUIRED, and that is the retraction guard
 * `country.seed-data.ts` carries optional fields and pays for them with a `normalizeSeed` pass,
 * because TypeORM's `merge` reads `undefined` as "leave this column alone": dropping a
 * previously-published key would otherwise flag the row as drifted forever while the stale value
 * sat in the database. This type takes the cheaper route available to a table with four hand-written
 * rows — nothing is optional, so retracting a value means writing `null` explicitly, and forgetting
 * a field is a COMPILE error rather than a silent no-write. There is no normaliser here because
 * there is nothing for it to normalise.
 *
 * ## The three editorial strings, and how they got here
 * `metaTitleTr`, `metaDescriptionTr` and `introTr` are NOVA's approved v2 text (K-J, → DEC
 * 2026-08-15c §2), copied from `Owner's Inbox/kitap-video-cozumler/kitap-editoryal-metin.md`. Two
 * things about their FORM are load-bearing rather than stylistic:
 *
 * 1. **Each is ONE unbroken string literal.** No `+` concatenation appears anywhere in this file,
 *    and that is the point: playbook §8 names the concatenation join as the exact site of PR #43's
 *    dropped spaces. A join that does not exist cannot lose a space. Prettier never splits a string
 *    literal and this repo has no `max-len` rule, so nothing in the toolchain reintroduces one.
 *    This is what stands in place of a fifth `seed-transcription` lane for 657 characters of prose
 *    (Atlas ruling, B2 plan §4); the lane machinery was built for 191-country and 81-province waves
 *    and its fixed cost exceeds this corpus by an order of magnitude.
 * 2. **Their fidelity is asserted by hash, not by eye.** The SHA-256 of each string as extracted
 *    from the editorial source is recorded in `data/books/README.md` beside the command that
 *    re-derives it, so a reviewer compares two hex strings instead of reading Turkish prose
 *    character by character. Same trust model SPEC §7.1 already accepts for the timestamps
 *    artefact, applied to the prose half.
 *
 * `book-seed-invariants.ts` holds the structural ceilings (`CONTENT-STYLE.md` §2/§16/§17/§20) that
 * bind this row and every book row after it.
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
  /** How many denemeler the BOOK has — a künye fact, not a coverage figure. */
  readonly denemeCount: number;
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
 * The first book — `AYT Coğrafya Konu Özetli Branş Denemeleri`, Coğrafya Gurmesi Yayınları.
 *
 * Künye facts (title, publisher, authors in printed order, 144 pages, ISBN 9786259490069) come from
 * the seller's `schema.org/Product` JSON-LD, re-read 2026-08-15, with the owner confirming the
 * künye the same day; `denemeCount = 40` is the owner's own reading of the book (K-E, → DEC
 * 2026-08-15c §1). The ISBN's check digit was verified independently (13th digit 9, computed 9).
 *
 * **No price, currency, availability or stock code.** `CONVENTIONS.md` §4 bars pricing and the
 * ruling that authorised {@link BookSeed.purchaseUrl} authorised a bare address and nothing else —
 * the seller page also publishes a price and a stock code, and neither is copied here.
 */
export const SEED_BOOKS: readonly BookSeed[] = [
  {
    // Verified against `GLOSSARY.md` §5's four folding rules, whose folding function was
    // positive-controlled against all seven locked province/region examples (K-B, → DEC
    // 2026-08-15c). `slugEn` is the same string because a product name is not translated
    // (`SEO-POLICY.md` §B14 14.2) — a consequence, not a rule, which is why they stay two columns.
    slugTr: 'ayt-cografya-konu-ozetli-brans-denemeleri',
    slugEn: 'ayt-cografya-konu-ozetli-brans-denemeleri',
    titleTr: 'AYT Coğrafya Konu Özetli Branş Denemeleri',
    // Null by rule, not by omission: a field with no counterpart is omitted rather than
    // machine-filled (`SEO-POLICY.md` §B14 14.2). The EN twin renders the TR title.
    titleEn: null,
    publisherName: 'Coğrafya Gurmesi Yayınları',
    // PRINTED order. Alphabetising this array as a tidy-up changes what the credit says
    // (playbook §5). Also this repo's first column holding real people's names — the credit is
    // seeded exactly as the book prints it and the surface is not widened (FU-BOOKS-AUTHOR-PII).
    authorNames: ['Murat Çakır', 'Murat Karagöz'],
    isbn13: '9786259490069',
    pageCount: 144,
    examTrack: ExamTrack.Ayt,
    denemeCount: 40,
    // NULL because the file does not exist yet, and null is the state the contract defines for
    // that: `BookListItemDto.coverImagePath` says "null means there is no cover to render".
    // `cografya_web` has no `public/` directory at all today (measured 2026-08-15), so seeding a
    // path would publish an address for a file nobody can serve and the hub card would render
    // broken the day B3 lands. The owner supplies the file (K-K, → DEC 2026-08-15c §1); the PR
    // that lands it sets this to `/kitaplar/ayt-cografya-konu-ozetli-brans-denemeleri.jpg` — a
    // data change on a nullable column, not a contract change. The filename must stay inside
    // `CHK_books_cover_image_path`'s ASCII alphabet, so slugify before copying into `public/`.
    coverImagePath: null,
    // Outbound seller link, no price anywhere (→ DEC 2026-08-15c §1). `https://` is enforced by
    // `CHK_books_purchase_url` because this value becomes an `href` on a public page.
    purchaseUrl:
      'https://www.kitapisler.com/cografya-gurmesi-yayinlari-ayt-cografya-konu-ozetli-brans-denemeleri_106636.html',
    // ── The three editorial strings (K-J). One literal each, no concatenation. ──
    introTr:
      "Coğrafya Gurmesi Yayınları'nın AYT Coğrafya Konu Özetli Branş Denemeleri, Murat Çakır ve Murat Karagöz'ün hazırladığı 144 sayfalık bir deneme kitabıdır. Kitapta 40 branş denemesi yer alır ve her deneme yalnızca coğrafya sorularından oluşur.\n\nDenemelerin video çözümleri yayıncının kendi kanalında yayımlanıyor; her video bir denemeye ayrılmış. Bir videoda o denemenin soruları sırayla çözülüyor ve her çözümün videoda başladığı an ayrıca belirlendi.",
    // Null, and it stays null: the EN page carries no narrative rather than a machine-translated
    // one (`SEO-POLICY.md` §B14), and the EN twin is permanently `noindex` (K-C).
    introEn: null,
    metaTitleTr: 'AYT Coğrafya Konu Özetli Branş Denemeleri Video Çözümleri',
    metaDescriptionTr:
      "Coğrafya Gurmesi'nin 144 sayfalık AYT branş denemesi kitabı. Deneme çözümleri video olarak burada; her sorunun videoda başladığı an ayrı ayrı işaretli.",
    // Attribution link only — no code path queries it, which is what stops a playlist edit from
    // silently changing the page (SPEC §4.2). Both ids from `provenance/integrations.md`.
    youtubePlaylistId: 'PLeiAoU-22Kr8em2axwmDvHB48pqxQL2Po',
    youtubeChannelId: 'UCH7D1zOgHykrHfx5Q7WERmw',
    displayOrder: 1,
  },
];

/** The book the question-index artefact belongs to, keyed by its permanent TR slug. */
export const BOOK_TIMESTAMPS_OWNER_SLUG_TR = 'ayt-cografya-konu-ozetli-brans-denemeleri';
