/**
 * Produces the single storage/lookup form for the first, ASCII-only email
 * contract. Syntax and length validation belong to UYELIK-02's request DTO;
 * this helper deliberately has one job so registration and login cannot drift.
 */
export function canonicalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
