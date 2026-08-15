import { describe, expect, it } from '@jest/globals';
import { ExamTrack } from '../../book/book.types';
import { isEndorsementClaim } from '../../common/attribution/endorsement-guard';
import {
  assertArtifactMatchesBook,
  assertBookSeedInvariants,
  BookSeedInvariantError,
  collectBookSeedNotes,
  validateBookSeedCorpus,
} from './book-seed-invariants';
import type { BookTimestampsArtifact } from './book-timestamps.artifact';
import { SEED_BOOKS, type BookSeed } from './books.seed-data';

/**
 * The structural gate that stands in place of a fifth transcription lane (Atlas ruling, B2 plan §4)
 * — plus §13 invariant 16 for the strings this seed publishes.
 *
 * ## What these tests assert, and what they refuse to assert
 * They assert RULES: `CONTENT-STYLE.md`'s §2/§16/§17/§20 ceilings, the künye shapes the schema
 * cannot express, and the artefact↔künye join the migration hands to B2 by name. Every one of them
 * binds book #2 exactly as it binds book #1.
 *
 * They assert no FACT. Nothing here pins what the prose says, how long it is, or which second a
 * question starts at — a spec that did would freeze an editorial decision the owner already ruled
 * on, and would go red the day the text is legitimately revised. The one deliberate exception is
 * "the committed corpus passes", which is a positive control rather than a fact: without it every
 * refusal below would be satisfied by a gate that rejects everything.
 */

function book(overrides: Partial<BookSeed> = {}): BookSeed {
  return {
    slugTr: 'ornek-kitap',
    slugEn: 'ornek-kitap',
    titleTr: 'Örnek Kitap',
    titleEn: null,
    publisherName: 'Örnek Yayınları',
    authorNames: ['Ada Lovelace'],
    isbn13: '1234567890123',
    pageCount: 100,
    examTrack: ExamTrack.Ayt,
    denemeCount: 10,
    coverImagePath: null,
    purchaseUrl: null,
    introTr: 'Bu bir örnek anlatıdır. İkinci cümle biraz daha uzun olsun diye buraya kondu.',
    introEn: null,
    // In-band on purpose (A1 25-60, A2 110-165), so the note tests below isolate the field they
    // mutate instead of counting a note the fixture itself produced.
    metaTitleTr: 'Örnek Kitap Video Çözümleri',
    metaDescriptionTr:
      'Örnek yayınevinin 100 sayfalık örnek deneme kitabı. Deneme çözümleri video olarak burada; her sorunun başladığı an ayrı ayrı işaretli.',
    youtubePlaylistId: null,
    // UC + 22 characters, the shape every YouTube channel id has. The fixture carried a 22-character
    // value before the id shape was pinned, which is the fixture-side half of why it was pinned.
    youtubeChannelId: 'UC0000000000000000000000',
    displayOrder: 1,
    ...overrides,
  };
}

/**
 * A genuinely SECOND book — different slug, different ISBN and different prose.
 *
 * Two rows built from one `book()` share their three editorial strings byte for byte, which is now
 * a refusal in its own right (two indexable pages must not ship one `<title>`). A fixture for
 * "two valid books" therefore has to look like two books.
 */
function secondBook(overrides: Partial<BookSeed> = {}): BookSeed {
  return book({
    slugTr: 'ikinci-kitap',
    slugEn: 'ikinci-kitap',
    isbn13: '9999999999999',
    introTr: 'Bu ikinci örnek anlatıdır ve ilkinden başka sözcüklerle yazılmıştır.',
    metaTitleTr: 'İkinci Örnek Kitap Video Çözümleri',
    metaDescriptionTr:
      'İkinci yayınevinin 120 sayfalık örnek deneme kitabı. Çözümler video olarak burada; her sorunun başladığı an ayrı ayrı işaretli.',
    ...overrides,
  });
}

function artifact(denemeNumbers: readonly number[]): BookTimestampsArtifact {
  const videos = denemeNumbers.map((denemeNo) => ({
    denemeNo,
    youtubeVideoId: 'aaaaaaaaaaa',
    questions: [{ questionNo: 1, startSecond: 0 }],
  }));

  return { videos, questionCount: videos.length };
}

describe('assertBookSeedInvariants — positive controls', () => {
  it('accepts the synthetic fixture every case below mutates', () => {
    expect(() => {
      assertBookSeedInvariants([book()]);
    }).not.toThrow();
  });

  it('accepts the COMMITTED corpus — the gate is not one that rejects everything', () => {
    expect(() => {
      assertBookSeedInvariants(SEED_BOOKS);
    }).not.toThrow();
  });
});

describe('assertBookSeedInvariants — künye shape', () => {
  it('refuses an empty corpus instead of reporting nothing checked', () => {
    expect(() => {
      assertBookSeedInvariants([]);
    }).toThrow(BookSeedInvariantError);
  });

  it.each([
    ['an uppercase letter', 'Ornek-Kitap'],
    ['a Turkish diacritic', 'örnek-kitap'],
    ['a space', 'ornek kitap'],
    ['a leading hyphen', '-ornek'],
    ['empty', ''],
  ])('refuses a slug containing %s', (_label, slugTr) => {
    expect(() => {
      assertBookSeedInvariants([book({ slugTr })]);
    }).toThrow(/is not a slug/);
  });

  it.each([
    ['twelve digits', '123456789012'],
    ['fourteen digits', '12345678901234'],
    ['a hyphen', '978-625949006'],
  ])('refuses an isbn13 with %s', (_label, isbn13) => {
    expect(() => {
      assertBookSeedInvariants([book({ isbn13 })]);
    }).toThrow(/thirteen digits/);
  });

  it('refuses an empty author credit', () => {
    expect(() => {
      assertBookSeedInvariants([book({ authorNames: [] })]);
    }).toThrow(/authorNames is empty/);
  });

  // `CHK_books_author_names` ACCEPTS these — measured on Postgres 16.15 by three review legs — so
  // the migration names them a B2 seeding defect. This is B2 refusing them.
  it.each([
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['a padded name', ' Ada Lovelace '],
  ])('refuses an author entry that is %s, which the database would accept', (_label, author) => {
    expect(() => {
      assertBookSeedInvariants([book({ authorNames: [author] })]);
    }).toThrow(/blank or padded/);
  });

  it.each([
    ['protocol-relative', '//cdn.example.com/kapak.jpg'],
    ['backslash-prefixed', '/\\cdn.example.com/kapak.jpg'],
    ['a remote URL', 'https://cdn.example.com/kapak.jpg'],
    ['relative', 'kitaplar/kapak.jpg'],
    ['carrying a Turkish diacritic', '/kitaplar/ağrı-kapak.jpg'],
    ['carrying a space', '/kitaplar/kapak 1.jpg'],
  ])('refuses a coverImagePath that is %s', (_label, coverImagePath) => {
    expect(() => {
      assertBookSeedInvariants([book({ coverImagePath })]);
    }).toThrow(/outside the allowlist/);
  });

  it('accepts a slugified cover path and a null one', () => {
    expect(() => {
      assertBookSeedInvariants([
        book({ coverImagePath: '/kitaplar/ornek-kitap.jpg' }),
        secondBook({ coverImagePath: null }),
      ]);
    }).not.toThrow();
  });

  it.each([
    ['http', 'http://example.com/kitap'],
    ['javascript', 'javascript:alert(1)'],
    ['protocol-relative', '//example.com/kitap'],
  ])('refuses a %s purchaseUrl', (_label, purchaseUrl) => {
    expect(() => {
      assertBookSeedInvariants([book({ purchaseUrl })]);
    }).toThrow(/must be https/);
  });

  it('refuses two books claiming one slug', () => {
    expect(() => {
      assertBookSeedInvariants([book(), book({ isbn13: '9999999999999' })]);
    }).toThrow(/claimed by two books/);
  });

  it("refuses one book's TR slug colliding with another book's EN slug", () => {
    expect(() => {
      assertBookSeedInvariants([
        book(),
        book({ slugTr: 'ikinci', slugEn: 'ornek-kitap', isbn13: '9999999999999' }),
      ]);
    }).toThrow(/claimed by two books/);
  });

  it('accepts one book carrying the same string in both slug columns', () => {
    // The live corpus does exactly this — a product name is not translated — so a check that read
    // it as a collision would be red on the only row that exists.
    expect(() => {
      assertBookSeedInvariants([book({ slugTr: 'ayni-dize', slugEn: 'ayni-dize' })]);
    }).not.toThrow();
  });

  it('refuses two books claiming one isbn13', () => {
    expect(() => {
      assertBookSeedInvariants([book(), book({ slugTr: 'ikinci', slugEn: 'ikinci' })]);
    }).toThrow(/is claimed by rows/);
  });

  it('accepts two genuinely different books (positive control for the cross-row refusals)', () => {
    expect(() => {
      assertBookSeedInvariants([book(), secondBook()]);
    }).not.toThrow();
  });

  it.each<[string, BookSeed]>([
    ['metaTitleTr', secondBook({ metaTitleTr: book().metaTitleTr })],
    ['metaDescriptionTr', secondBook({ metaDescriptionTr: book().metaDescriptionTr })],
    ['introTr', secondBook({ introTr: book().introTr })],
  ])('refuses two books shipping a byte-identical %s', (_field, second) => {
    expect(() => {
      assertBookSeedInvariants([book(), second]);
    }).toThrow(/byte-identical on rows/);
  });
});

describe('assertBookSeedInvariants — required strings and column lengths', () => {
  // The database accepts every one of these. `CHK_books_*` mirrors shapes, not emptiness, so an
  // empty `metaTitleTr` publishes an empty `<title>` on an indexable page with nothing red anywhere.
  it.each<[string, BookSeed]>([
    ['titleTr', book({ titleTr: '' })],
    ['publisherName', book({ publisherName: '' })],
    ['introTr', book({ introTr: '' })],
    ['metaTitleTr', book({ metaTitleTr: '' })],
    ['metaDescriptionTr', book({ metaDescriptionTr: '' })],
    ['youtubeChannelId', book({ youtubeChannelId: '' })],
  ])('refuses an empty %s, which the database would accept', (field, seed) => {
    expect(() => {
      assertBookSeedInvariants([seed]);
    }).toThrow(new RegExp(`${field} is empty`));
  });

  it.each<[string, BookSeed]>([
    ['titleTr', book({ titleTr: 'a'.repeat(201) })],
    ['publisherName', book({ publisherName: 'a'.repeat(121) })],
    ['metaTitleTr', book({ metaTitleTr: 'a'.repeat(201) })],
    ['metaDescriptionTr', book({ metaDescriptionTr: 'a'.repeat(401) })],
  ])('refuses a %s longer than its column', (_field, seed) => {
    expect(() => {
      assertBookSeedInvariants([seed]);
    }).toThrow(/the column holds/);
  });

  it('measures column length in CODE POINTS, as Postgres varchar does', () => {
    // 200 multi-byte letters is 200 characters to `varchar(200)` and 400 bytes. A byte reading
    // would refuse a value the column accepts.
    expect(() => {
      assertBookSeedInvariants([book({ titleTr: 'ğ'.repeat(200) })]);
    }).not.toThrow();
  });

  it('refuses an empty string in a NULLABLE column, where the contract defines null', () => {
    expect(() => {
      assertBookSeedInvariants([book({ youtubePlaylistId: '' })]);
    }).toThrow(/is an empty string/);
  });

  it.each([
    ['too short', 'UC000000000000000000000'],
    ['too long', 'UC00000000000000000000000'],
    ['not a channel id at all', 'PLeiAoU-22Kr8em2axwmDvHB48pqxQL2Po'],
  ])('refuses a youtubeChannelId that is %s', (_label, youtubeChannelId) => {
    expect(() => {
      assertBookSeedInvariants([book({ youtubeChannelId })]);
    }).toThrow(/is not a channel id/);
  });

  it('accepts a playlist id of any family, which is why no pattern is pinned on it', () => {
    expect(() => {
      assertBookSeedInvariants([book({ youtubePlaylistId: 'UUH7D1zOgHykrHfx5Q7WERmw' })]);
    }).not.toThrow();
  });
});

describe('assertBookSeedInvariants — CONTENT-STYLE ceilings', () => {
  it('refuses ALL CAPS emphasis (§2)', () => {
    expect(() => {
      assertBookSeedInvariants([
        book({ introTr: 'Bu kitap ilin bütününü kapsar, YALNIZCA bir bölümünü değil.' }),
      ]);
    }).toThrow(/ALL CAPS/);
  });

  it('accepts a three-letter abbreviation, which is a term rather than emphasis', () => {
    expect(() => {
      assertBookSeedInvariants([book({ introTr: 'AYT ve TYT için hazırlanmış bir kitaptır.' })]);
    }).not.toThrow();
  });

  it('refuses a second semicolon in one paragraph (§16)', () => {
    expect(() => {
      assertBookSeedInvariants([book({ introTr: 'Bir olgu; ikinci olgu; üçüncü olgu.' })]);
    }).toThrow(/semicolons; the ceiling is 1/);
  });

  it('accepts one semicolon per paragraph', () => {
    expect(() => {
      assertBookSeedInvariants([
        book({ introTr: 'Bir olgu; ikinci olgu.\n\nBaşka bir olgu; ve bir tane daha.' }),
      ]);
    }).not.toThrow();
  });

  it('refuses a second em-dash in one paragraph (§17)', () => {
    expect(() => {
      assertBookSeedInvariants([
        book({ introTr: 'Bir olgu — açıklama. Başka bir olgu — ikinci açıklama.' }),
      ]);
    }).toThrow(/em-dashes; the ceiling is 1/);
  });

  it('refuses more than four em-dashes across the whole row (§17 page ceiling)', () => {
    const paragraphs = ['a — b', 'c — d', 'e — f', 'g — h', 'i — j'].join('\n\n');

    expect(() => {
      assertBookSeedInvariants([book({ introTr: paragraphs })]);
    }).toThrow(/page ceiling is 4/);
  });

  it('refuses a lone newline, which is not a paragraph break (§20)', () => {
    expect(() => {
      assertBookSeedInvariants([book({ introTr: 'Birinci paragraf.\nİkinci paragraf.' })]);
    }).toThrow(/single newline/);
  });

  it('accepts a blank-line paragraph break', () => {
    expect(() => {
      assertBookSeedInvariants([book({ introTr: 'Birinci paragraf.\n\nİkinci paragraf.' })]);
    }).not.toThrow();
  });

  it('refuses an empty paragraph, which an even run of newlines slips past the lone-\\n check', () => {
    // Four newlines are consumed as two `\n\n` pairs, so the lone-newline check passes them while
    // `paragraphsOf` yields an empty paragraph and `ProseNote` renders an empty block.
    expect(() => {
      assertBookSeedInvariants([book({ introTr: 'Birinci.\n\n\n\nİkinci.' })]);
    }).toThrow(/empty paragraph/);
  });

  it('accepts ALL CAPS in titleTr, because a printed title is quoted and not restyled', () => {
    // The boundary is deliberate: `PROSE_FIELDS` binds the three editorial strings and not the
    // künye's quoted names. Asserted so the next reader meets a decision rather than an omission —
    // and paired with its opposite, so the assertion is not vacuous.
    expect(() => {
      assertBookSeedInvariants([book({ titleTr: 'ÖRNEK KİTAP' })]);
    }).not.toThrow();

    expect(() => {
      assertBookSeedInvariants([book({ metaTitleTr: 'ÖRNEK KİTAP Video Çözümleri' })]);
    }).toThrow(/ALL CAPS/);
  });

  it('refuses a newline inside metaTitleTr, which becomes an HTML head value', () => {
    expect(() => {
      assertBookSeedInvariants([book({ metaTitleTr: 'Birinci satır\nİkinci satır' })]);
    }).toThrow(/single line/);
  });

  it('refuses a newline inside metaDescriptionTr for the same reason', () => {
    expect(() => {
      assertBookSeedInvariants([book({ metaDescriptionTr: 'Birinci satır\nİkinci satır' })]);
    }).toThrow(/single line/);
  });

  it('refuses padded prose', () => {
    expect(() => {
      assertBookSeedInvariants([book({ introTr: ' Baştaki boşluk.' })]);
    }).toThrow(/leading or trailing whitespace/);
  });

  it('refuses the ISBN inside prose (§6)', () => {
    expect(() => {
      assertBookSeedInvariants([
        book({
          isbn13: '1234567890123',
          introTr: 'Kitabın ISBN numarası 1234567890123 olarak basılmıştır.',
        }),
      ]);
    }).toThrow(/carries the ISBN/);
  });
});

describe('assertArtifactMatchesBook', () => {
  it('accepts an index that fits inside the book (positive control)', () => {
    expect(() => {
      assertArtifactMatchesBook(book({ denemeCount: 10 }), artifact([1, 5, 10]));
    }).not.toThrow();
  });

  // The check `1786752000000-InitBookCatalogue.ts` hands to B2 by name: a CHECK constraint sees one
  // row of one table, so the cross-table bound lives here.
  it("refuses a deneme number beyond the book's deneme count", () => {
    expect(() => {
      assertArtifactMatchesBook(book({ denemeCount: 10 }), artifact([1, 11]));
    }).toThrow(/greater than the book's denemeCount/);
  });

  it('refuses more videos than the book has denemeler', () => {
    // Reachable only through the INJECTED-artefact seam: a duplicate deneme is refused earlier on
    // the parsed path, which is why this fixture has to carry one.
    expect(() => {
      assertArtifactMatchesBook(book({ denemeCount: 2 }), artifact([1, 2, 2]));
    }).toThrow(/coverage cannot exceed the book/);
  });

  it('refuses an artefact carrying no videos, because that means "delete the whole index"', () => {
    // `parseBookTimestampsArtifact` refuses an empty artefact by schema, but the injected seam
    // bypasses the parser — and down that seam an empty artefact makes every deneme stale.
    expect(() => {
      assertArtifactMatchesBook(book({ denemeCount: 10 }), artifact([]));
    }).toThrow(/no videos at all/);
  });
});

describe('validateBookSeedCorpus — one list for `--check` and the write path', () => {
  /**
   * The refusals this function composes were two hand-written lists that had already diverged:
   * `--check` ran the corpus invariants and the artefact read, and the write path additionally ran
   * the owner lookup and the artefact↔künye join. The cases below drive the two refusals that used
   * to be write-path-only, through the function BOTH paths now call.
   */
  it('accepts the committed corpus against the committed artefact', async () => {
    await expect(validateBookSeedCorpus()).resolves.toMatchObject({
      owner: { slugTr: SEED_BOOKS[0]?.slugTr },
    });
  });

  it('refuses a corpus that does not contain the artefact owner', async () => {
    await expect(
      validateBookSeedCorpus({
        books: [book()],
        ownerSlugTr: 'baska-kitap',
        artifact: artifact([1]),
      }),
    ).rejects.toThrow(/which is not in the seed corpus/);
  });

  it('refuses an artefact that does not fit the owner it belongs to', async () => {
    await expect(
      validateBookSeedCorpus({
        books: [book({ denemeCount: 2 })],
        ownerSlugTr: 'ornek-kitap',
        artifact: artifact([1, 5]),
      }),
    ).rejects.toThrow(/greater than the book's denemeCount/);
  });

  it('refuses a defective corpus before it ever reaches the artefact', async () => {
    await expect(validateBookSeedCorpus({ books: [] })).rejects.toThrow(/corpus is empty/);
  });
});

describe('collectBookSeedNotes', () => {
  // The A1/A2 bands are NOTES by rule (SEO-POLICY §0.2, SPEC §5.1), so they are reported and never
  // thrown. A test that made them fail would turn an editorial default into a veto.
  it('reports an out-of-band title without failing', () => {
    const notes = collectBookSeedNotes([book({ metaTitleTr: 'Kısa' })]);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/A1 editorial band/);
    expect(() => {
      assertBookSeedInvariants([book({ metaTitleTr: 'Kısa' })]);
    }).not.toThrow();
  });

  it('reports an out-of-band description without failing', () => {
    const notes = collectBookSeedNotes([book({ metaDescriptionTr: 'Çok kısa.' })]);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/A2 editorial band/);
  });

  it('measures length in CODE POINTS, so Turkish letters are not counted twice', () => {
    // 60 code points, all of them multi-byte: a byte-length reading would call this 120 and report
    // a band violation that is not there.
    const sixtyTurkishLetters = 'ğ'.repeat(60);

    expect(collectBookSeedNotes([book({ metaTitleTr: sixtyTurkishLetters })])).toHaveLength(0);
  });
});

describe('the No-Endorsement guard over every string this seed publishes (§13 invariant 16)', () => {
  const publishedStrings = SEED_BOOKS.flatMap((seed) => [
    seed.titleTr,
    seed.publisherName,
    seed.introTr,
    seed.metaTitleTr,
    seed.metaDescriptionTr,
  ]);

  it.each(publishedStrings)('is free of endorsement phrasing: %s', (value) => {
    // Compared as a formatted string so a failure PRINTS the offending value instead of `false`.
    expect(`${value} → ${String(isEndorsementClaim(value))}`).toBe(`${value} → false`);
  });

  it('catches a claim of the banned kind (positive control — the guard is wired up)', () => {
    expect(isEndorsementClaim('YouTube onaylı video çözümler')).toBe(true);
  });
});
