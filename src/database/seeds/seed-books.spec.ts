import { describe, expect, it, jest } from '@jest/globals';
import type { DataSource } from 'typeorm';
import { BookSeedInvariantError } from './book-seed-invariants';
import { FIXTURE_BOOK } from '../../../test/fixtures/books/fixture-books';
import { seedBooks } from './seed-books';

/**
 * The write path's empty-corpus and missing-index answers, which need no Postgres: both are decided
 * before a transaction opens. Everything that writes is covered by `test/book-seed.e2e-spec.ts`.
 */
describe('seedBooks', () => {
  function stubDataSource(): { dataSource: DataSource; transaction: jest.Mock } {
    const transaction = jest.fn(() => {
      throw new Error('seedBooks opened a transaction');
    });
    return { dataSource: { transaction } as unknown as DataSource, transaction };
  }

  it('answers an empty corpus with all-zero counts and opens no transaction', async () => {
    const { dataSource, transaction } = stubDataSource();

    await expect(seedBooks(dataSource, { books: [] })).resolves.toEqual({
      books: { inserted: 0, updated: 0, unchanged: 0 },
      videos: { inserted: 0, updated: 0, unchanged: 0, removed: 0 },
      tags: { inserted: 0, updated: 0, unchanged: 0, removed: 0 },
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('refuses a book without its etiket index before opening a transaction', async () => {
    const { dataSource, transaction } = stubDataSource();

    await expect(seedBooks(dataSource, { books: [FIXTURE_BOOK] })).rejects.toThrow(
      BookSeedInvariantError,
    );
    expect(transaction).not.toHaveBeenCalled();
  });
});
