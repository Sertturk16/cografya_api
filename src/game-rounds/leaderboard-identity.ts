/**
 * The leaderboard's display-identity derivation (P1 PR-C plan §5.3) — `GLOSSARY.md` §7's
 * "skor tablosu adı" row: first name verbatim plus the surname's initial, never the full
 * surname. That row directly supersedes the retired `rumuz` rule ("gerçek ad asla
 * yayımlanmaz") by explicit owner decision (`DEC 2026-09-09d` md.1) — this function is what
 * makes the surname half of that boundary real: everything past one grapheme of `lastName`
 * stops here and never reaches a response DTO.
 *
 * Two details are load-bearing, and both are pinned by the sibling `.spec.ts`:
 *
 *  - `Array.from(lastName)` iterates by Unicode code point, never `lastName[0]`, which
 *    indexes by UTF-16 code UNIT — a first character outside the Basic Multilingual Plane
 *    would come back as a broken, unpaired surrogate half instead of the real grapheme.
 *  - `toLocaleUpperCase('tr')`, not the invariant `.toUpperCase()`: Turkish casing
 *    special-cases the dotted/dotless "i" pair (`i` upper-cases to `İ` in Turkish, to the
 *    plain `I` under the invariant/default mapping), so the invariant form can silently drop
 *    the dot on a real Turkish surname's initial.
 *
 * In production this function's one caller (`GameRoundsService.getLeaderboard`) now already
 * passes an already-narrowed one-character value — the page query itself applies
 * `LEFT(u."last_name", 1)` in SQL, so the full surname never reaches this process. The
 * extraction/casing contract below is unchanged and is still exercised directly against full
 * multi-character strings by this file's own unit spec, which remains where that behaviour is
 * pinned in isolation.
 */
export function toLastNameInitial(lastName: string): string {
  const [firstGrapheme] = Array.from(lastName);
  if (firstGrapheme === undefined) {
    // `users.last_name` is `CHK_users_last_name`-constrained non-empty and trimmed
    // (`user.entity.ts`), so this branch cannot be reached against a real `users` row — kept
    // as a fail-closed guard, mirroring this repo's own `noUncheckedIndexedAccess` precedent
    // in `game-rounds.service.ts`'s and `favorites.service.ts`'s identical `row === undefined`
    // guards.
    throw new Error('leaderboard-identity: lastName is empty');
  }
  return firstGrapheme.toLocaleUpperCase('tr');
}
