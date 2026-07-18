/**
 * Deterministic emitter: prose value -> the seed file's `+`-concatenation idiom.
 *
 * THE INVARIANT THAT KILLS THE BUG CLASS:
 * a chunk boundary NEVER falls between two words. The wrapper splits the paragraph on
 * spaces and appends the separating space to the END of the chunk that precedes it, so
 * every chunk except a paragraph-final one terminates in the space it owns. Concatenating
 * the chunks is therefore the identity operation on the value — `chunks.join('') === value`
 * holds by construction, not by inspection. There is no boundary at which a space *could*
 * be dropped, which is precisely what happened in PR #43 when a human chose the
 * boundaries.
 *
 * This is asserted at runtime (see `emitConcat`) and property-tested in `emit.spec.ts`.
 */

/** Prettier's `printWidth` for this repo (`.prettierrc`). */
export const PRINT_WIDTH = 100;

/**
 * Quote selection mirrors Prettier's rule so the emitted source is already
 * Prettier-stable and `format:check` stays green: pick the quote character that requires
 * fewer escapes; on a tie prefer the configured `singleQuote`. Turkish prose is full of
 * apostrophes (`Türkiye'nin`), so most chunks come out double-quoted — exactly what the
 * committed seed files already look like.
 */
export function quoteLiteral(value: string): string {
  const singles = (value.match(/'/gu) ?? []).length;
  const doubles = (value.match(/"/gu) ?? []).length;
  const quote = doubles < singles ? '"' : "'";
  const escaped = value
    .split('\\')
    .join('\\\\')
    .split(quote)
    .join(`\\${quote}`)
    // Paragraph breaks travel as their own `'\n\n'` chunk; a raw newline inside a
    // single-quoted literal is a syntax error, so control characters are always escaped.
    .split('\n')
    .join('\\n')
    .split('\r')
    .join('\\r')
    .split('\t')
    .join('\\t');
  return `${quote}${escaped}${quote}`;
}

/**
 * Split a value into the literal chunks of the concatenation.
 *
 * `indent` is the column the continuation lines start at (6 in the seed files: a property
 * inside an object inside an array). A chunk's rendered line is
 * `indent + quoteLiteral(chunk) + ' +'`, and we greedily fit as many words as that budget
 * allows. A word longer than the budget still gets its own chunk — we never break inside
 * a word, since that would put a boundary in a place a reader could not verify.
 */
export function chunkValue(value: string, indent: number, printWidth = PRINT_WIDTH): string[] {
  const chunks: string[] = [];
  const paragraphs = value.split('\n\n');

  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (paragraphIndex > 0) chunks.push('\n\n');

    const words = paragraph.split(' ');
    let current = '';

    for (const word of words) {
      if (current === '') {
        current = word;
        continue;
      }
      // The candidate keeps the trailing space, because that space is what this chunk
      // would own if we broke here. Measuring without it would let a line overflow by one.
      const candidate = `${current} ${word}`;
      const rendered = indent + quoteLiteral(`${candidate} `).length + ' +'.length;
      if (rendered > printWidth) {
        chunks.push(`${current} `);
        current = word;
      } else {
        current = candidate;
      }
    }

    if (current !== '') chunks.push(current);
  });

  return chunks;
}

/**
 * Render the right-hand side of a property assignment.
 *
 * Single-chunk values stay on one line when they fit (`introTr: 'short'`), matching the
 * existing idiom for short fields; anything longer becomes the wrapped concatenation.
 */
export function emitConcat(value: string, propertyIndent: number, propertyName: string): string {
  const continuationIndent = propertyIndent + 2;
  const chunks = chunkValue(value, continuationIndent);

  // Structural guarantee, checked rather than assumed. If this ever throws, the emitter
  // is wrong and the tool refuses to produce output — it never writes a lossy seed.
  const rejoined = chunks.join('');
  if (rejoined !== value) {
    throw new Error(
      `emitConcat: chunking is not lossless for "${propertyName}". ` +
        `Rejoined length ${rejoined.length} vs original ${value.length}.`,
    );
  }

  const singleLine = `${propertyName}: ${quoteLiteral(value)},`;
  if (chunks.length === 1 && propertyIndent + singleLine.length <= PRINT_WIDTH) {
    return `${' '.repeat(propertyIndent)}${singleLine}`;
  }

  const pad = ' '.repeat(continuationIndent);
  const body = chunks
    .map((chunk) => `${pad}${quoteLiteral(chunk)}`)
    .join(' +\n')
    .concat(',');
  return `${' '.repeat(propertyIndent)}${propertyName}:\n${body}`;
}
