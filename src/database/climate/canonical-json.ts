/**
 * Order-independent JSON serialization, for comparing a value we hold in memory against the
 * same value after a Postgres `jsonb` round-trip.
 *
 * ## Why this exists (the defect it replaces)
 * The load phase decides "has this province's series actually changed?" so that an unchanged
 * province is not written and its `updated_at` — the source of the page's `dateModified` and
 * the sitemap's `lastmod` — does not move. That decision used to be `JSON.stringify(a) ===
 * JSON.stringify(b)`, justified by "both sides are produced by this codebase from the same
 * interface, so key order is stable".
 *
 * **That justification is wrong, and only one of the two sides is ours.** Postgres `jsonb` is
 * not a text format: it decomposes the document and re-serializes its keys by (length, then
 * lexical) order, discarding insertion order. Verified directly against `postgres:16-alpine`:
 * a document written with `source` first comes back with `months` first, and the nested
 * per-month and `records` objects are reordered too. So the stored side comes back sorted
 * while the artifact side keeps declaration order, the two strings differ even when the
 * content is identical, and EVERY re-run would report all 81 provinces as updated — telling
 * Google 81 pages changed when nothing did. Silently, with exit code 0.
 *
 * Sorting both sides removes order from the comparison entirely, so it no longer matters which
 * side went through the database.
 *
 * ## Why this is equivalent to asking Postgres itself
 * `jsonb` equality is the ground truth for "would this write change the row", and this
 * function is a model of it. The model holds because both operands are plain JSON parsed from
 * the same shape: no duplicate keys are reachable (both sides come from the typed
 * `ClimateNormals` interface), and the numbers survive unchanged (`jsonb` keeps `numeric`
 * digits verbatim, and `JSON.stringify` re-emits `10.4` as `10.4`). Comparing in TypeScript
 * keeps the check pure and unit-testable and costs no extra query.
 *
 * Array order is deliberately PRESERVED — `months[0]` is January, and a reordered months array
 * is a real change, not a formatting difference.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => canonicalize(item));
  }
  if (typeof value === 'object' && value !== null) {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = canonicalize(source[key]);
    }
    return sorted;
  }
  return value;
}
