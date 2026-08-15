import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Contract scans over the COMMITTED OpenAPI artifact — the guard B1's exit condition needs.
 *
 * ## Why `openapi:check` is not this guard
 * The CI job regenerates the spec and diffs it, so it proves the artifact MATCHES THE CODE. It is
 * green by construction for anyone who deletes a DTO and regenerates: the contract and the code
 * agree that the schema is gone. B1's whole deliverable is a FROZEN contract the web repo codegens
 * from before any endpoint exists, so what needs pinning is the opposite direction — that the
 * committed contract still CONTAINS what Vera generates types from. The air-quality sibling
 * (`src/air-quality/air-quality.contract.spec.ts`) was built for this exact hazard on the A1
 * contract PR; this is the same guard for the book leg.
 *
 * ## Structural only
 * No literal fact is asserted (`CONVENTIONS.md` §2): not a count of books, not a duration, not a
 * title. Every case here is about the SHAPE of the published contract, so a legitimate content
 * revision in B2 can never turn it red.
 */
describe('openapi/openapi.json — book contract', () => {
  const spec = readFileSync(join(__dirname, '..', '..', 'openapi', 'openapi.json'), 'utf8');
  const document = JSON.parse(spec) as {
    paths: Record<string, unknown>;
    components: { schemas: Record<string, unknown> };
  };

  type SchemaObject = {
    properties?: Record<string, { type?: string; nullable?: boolean }>;
    required?: string[];
  };

  const schemaOf = (name: string): SchemaObject =>
    document.components.schemas[name] as SchemaObject;

  it('publishes all 7 book schemas (the B1 frozen set)', () => {
    // B1 registers three of these through `ROUTELESS_CONTRACT_MODELS` and reaches the rest
    // transitively. A refactor that drops an `extraModels` entry, or that stops a nested DTO from
    // being referenced, removes a schema from the artifact while every other gate stays green.
    for (const schema of [
      'BookListItemDto',
      'BookDetailDto',
      'BookCoverageDto',
      'BookVideoDto',
      'BookVideoQuestionDto',
      'BookVideoYoutubeDto',
      'BookAttributionDto',
    ]) {
      expect(`${schema}:${String(document.components.schemas[schema] !== undefined)}`).toBe(
        `${schema}:true`,
      );
    }
  });

  it('BookVideoDto.youtube is published as REQUIRED and NULLABLE, both halves', () => {
    // The provider-sourced object is absent in three normal states (never synced, aged past the
    // soft threshold, video no longer returned) and the contract expresses all three as `null`.
    // Both halves are asserted on purpose — the lesson the air-quality spec records at
    // `analysisEndUtc`: pinning only `nullable` leaves the other half untested, so a later edit
    // marking the field optional would pass `openapi:check` AND this test while the generated web
    // type silently weakened from `T | null` to `T | null | undefined`.
    const video = schemaOf('BookVideoDto');
    expect(video.properties?.youtube?.nullable).toBe(true);
    expect(video.required).toContain('youtube');
  });

  it('BookListItemDto exists as its own schema and every key it declares is on BookDetailDto', () => {
    // `BookDetailDto extends BookListItemDto` and swagger emits a subclass FLAT — no `allOf`, no
    // `$ref` to the base — so the two schemas are related by nothing the artifact records. The
    // inheritance is real only in TypeScript; in the published contract it is an invariant that
    // has to be asserted, or a key removed from the list item stops being served by the detail
    // response with no gate noticing.
    const listItem = schemaOf('BookListItemDto');
    const detail = schemaOf('BookDetailDto');
    const listKeys = Object.keys(listItem.properties ?? {});
    expect(listKeys.length).toBeGreaterThan(0);
    const detailKeys = new Set(Object.keys(detail.properties ?? {}));
    for (const key of listKeys) {
      expect(`BookDetailDto.${key}:${String(detailKeys.has(key))}`).toBe(
        `BookDetailDto.${key}:true`,
      );
    }
  });

  it('no book schema publishes a price, currency, availability or offer key', () => {
    // `CONVENTIONS.md` §4 bars commercial packages and pricing; `DEC 2026-08-15c` §1 authorised one
    // outbound purchase link and NOTHING else. The consequence this pins is that `Product`/`offers`
    // structured data cannot be assembled from this contract even by accident — the claim the
    // detail DTO's docblock makes, asserted rather than asserted-in-prose. Scoped to `Book*` like
    // the air-quality sibling's own scan: another domain may legitimately need the word
    // "availability" one day, and a repo-wide ban would be a rule nobody agreed to.
    const bookSchemas = Object.entries(document.components.schemas).filter(([name]) =>
      name.startsWith('Book'),
    );
    expect(bookSchemas.length).toBeGreaterThan(0);
    const banned = /^(price|priceCurrency|currency|availability|offer|offers|stock|inStock)$/i;
    for (const [schemaName, schema] of bookSchemas) {
      const properties = (schema as SchemaObject).properties ?? {};
      for (const fieldName of Object.keys(properties)) {
        // The FIELD NAME is what the pattern is anchored to; the schema name rides along in the
        // assertion string so a failure names the site. Matching the composed `Schema.field`
        // string against an anchored pattern would never fire — a gate that cannot fail.
        expect(`${schemaName}.${fieldName}:banned=${String(banned.test(fieldName))}`).toBe(
          `${schemaName}.${fieldName}:banned=false`,
        );
      }
    }
  });
});
