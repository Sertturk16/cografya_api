/** The i18n error keys this module publishes; the sentence a reader sees is `cografya_web`'s. */
export const BOOK_ERROR_KEYS = {
  /** `GET /books/{slug}`, the slug is well-formed but matches no book. */
  notFound: 'errors.book.notFound',
} as const;

export type BookErrorKey = (typeof BOOK_ERROR_KEYS)[keyof typeof BOOK_ERROR_KEYS];
