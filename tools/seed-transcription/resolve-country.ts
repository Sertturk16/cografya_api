/**
 * Resolves a draft's `##` section heading to a seeded `isoCode`.
 *
 * The join key is the country NAME, because that is what the drafts actually carry — no
 * new format is imposed on NOVA (see `draft-parser.ts`). Headings vary across waves:
 *
 *   `3. TANZANYA (Tanzania)`
 *   `7. ANGOLA`
 *   `8. KONGO DEMOKRATİK CUMHURİYETİ / DR KONGO (Democratic Republic of the Congo)`
 *   `2. KKTC (KUZEY KIBRIS TÜRK CUMHURİYETİ)`
 *
 * so each heading yields several candidate names (before the parentheses, inside them,
 * and either side of a `/`), any one of which may match the seed's `nameTr` or `nameEn`.
 *
 * FAIL LOUDLY, NEVER GUESS. A heading that matches nothing, or matches two different
 * countries, is an error the caller must surface — a silently skipped country is how a
 * wave "lands" with a field still empty, and a silently mis-matched one would write
 * Tanzania's climate onto Zambia. Fuzzy/nearest-name matching is deliberately absent.
 */
import type { SeededCountry } from './seed-reader.ts';

/**
 * Locale-independent fold for matching only (never for output). Turkish `İ`/`ı` do not
 * round-trip through `toLowerCase()` consistently across locales, so they are mapped
 * explicitly before the generic diacritic strip.
 */
export function foldName(value: string): string {
  return value
    .replace(/İ/gu, 'i')
    .replace(/I/gu, 'i')
    .replace(/ı/gu, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/gu, '');
}

/** Split a heading into every plausible country name it contains. */
export function headingCandidates(heading: string): string[] {
  // Drop the leading ordinal (`3. `), which is wave-local numbering, not part of the name.
  const withoutOrdinal = heading.replace(/^\d+[.)]\s*/u, '');
  const parts: string[] = [];

  const parenthesised = /\(([^)]*)\)/gu;
  let match = parenthesised.exec(withoutOrdinal);
  while (match !== null) {
    if (match[1] !== undefined) parts.push(match[1]);
    match = parenthesised.exec(withoutOrdinal);
  }
  parts.push(withoutOrdinal.replace(/\([^)]*\)/gu, ''));

  // `A / B` headings name the same country twice (a long form and a common short form).
  const alternates = parts.flatMap((part) => part.split('/'));

  return alternates.map((part) => part.trim()).filter((part) => part !== '');
}

/**
 * A seeded name yields itself plus, when it carries a parenthetical, the two halves —
 * `Çin Cumhuriyeti (Tayvan)` also answers to `Çin Cumhuriyeti` and `Tayvan`.
 */
export function nameVariants(name: string): string[] {
  const variants = [name];
  const parenthetical = /\(([^)]*)\)/u.exec(name);
  if (parenthetical?.[1] !== undefined) {
    variants.push(parenthetical[1].trim());
    variants.push(name.replace(/\([^)]*\)/gu, '').trim());
  }
  return variants.filter((variant) => variant !== '');
}

export type Resolution =
  | { readonly ok: true; readonly isoCode: string; readonly matchedOn: string }
  | { readonly ok: false; readonly reason: string };

export function resolveCountry(heading: string, countries: readonly SeededCountry[]): Resolution {
  const candidates = headingCandidates(heading);

  // An explicit ISO code in the heading (`## 5. ÇİN CUMHURİYETİ / TAYVAN (TW)`) is exact
  // and beats every name heuristic. It is the escape hatch for any country whose seeded
  // name does not match how a wave chose to head the section, and it is already the
  // convention some drafts use — so it is honoured, not merely tolerated.
  for (const candidate of candidates) {
    if (!/^[A-Z]{2}$/u.test(candidate)) continue;
    const exact = countries.find((country) => country.isoCode === candidate);
    if (exact !== undefined) return { ok: true, isoCode: exact.isoCode, matchedOn: candidate };
  }

  const hits = new Map<string, string>();
  for (const candidate of candidates) {
    const folded = foldName(candidate);
    if (folded === '') continue;
    for (const country of countries) {
      // The seed's own names carry parentheticals too (`Çin Cumhuriyeti (Tayvan)`), so
      // both sides are split the same deterministic way — this is symmetry, not fuzzing.
      const seedNames = [...nameVariants(country.nameTr), ...nameVariants(country.nameEn)];
      if (seedNames.some((name) => foldName(name) === folded)) {
        hits.set(country.isoCode, candidate);
      }
    }
  }

  if (hits.size === 1) {
    const [isoCode, matchedOn] = [...hits.entries()][0] ?? ['', ''];
    return { ok: true, isoCode, matchedOn };
  }
  if (hits.size === 0) {
    return {
      ok: false,
      reason:
        `no seeded country matches heading "${heading}" ` +
        `(tried: ${candidates.map((c) => `"${c}"`).join(', ')})`,
    };
  }
  return {
    ok: false,
    reason: `heading "${heading}" is ambiguous — matches ${[...hits.keys()].sort().join(', ')}`,
  };
}
