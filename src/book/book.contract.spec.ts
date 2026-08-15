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

  /**
   * Every field the eight schemas publish, by schema — the FIELD-level half of this guard.
   *
   * The case below pins whole SCHEMAS, which leaves almost every field open: emptying
   * `BookVideoQuestionDto` to `{"type": "object"}` keeps the schema in `components.schemas` and
   * that case stays green. The same holds for a dropped FIELD whose type is registered separately —
   * `BookDetailDto.attribution` can disappear while `BookAttributionDto` stays in the artifact,
   * because `ROUTELESS_CONTRACT_MODELS` registers it independently.
   *
   * Every entry here is pinned on purpose: B1's deliverable is a FROZEN contract, so removing a
   * field is a breaking change that goes to Atlas (playbook §4). ADDING a field is additive and
   * needs no edit here. `BookDetailDto` repeats the nine inherited keys because swagger emits the
   * subclass FLAT — the artifact records no inheritance, so the published schema really does
   * declare them itself.
   */
  const PUBLISHED_FIELDS: Record<string, readonly string[]> = {
    // The core five (`DEC 2026-08-12k` §2), which is the whole reason this schema is pinned by
    // field rather than by presence: losing `hasMore` or `total` is a silent envelope defect.
    BookListDto: ['items', 'page', 'pageSize', 'total', 'hasMore'],
    BookListItemDto: [
      'slugTr',
      'slugEn',
      'titleTr',
      'publisherName',
      'examTrack',
      'coverImagePath',
      'videoCount',
      'questionCount',
      'displayOrder',
      'updatedAt',
    ],
    BookDetailDto: [
      'slugTr',
      'slugEn',
      'titleTr',
      'publisherName',
      'examTrack',
      'coverImagePath',
      'videoCount',
      'questionCount',
      'displayOrder',
      'updatedAt',
      'titleEn',
      'authorNames',
      'isbn13',
      'pageCount',
      'denemeCount',
      'introTr',
      'introEn',
      'metaTitleTr',
      'metaDescriptionTr',
      'youtubeChannelId',
      'youtubePlaylistId',
      'purchaseUrl',
      'coverage',
      'videos',
      'attribution',
    ],
    BookCoverageDto: ['videoCount', 'questionCount', 'denemeNumbers', 'denemeCount'],
    BookVideoDto: ['denemeNo', 'youtubeVideoId', 'questions', 'youtube'],
    BookVideoQuestionDto: ['questionNo', 'startSecond'],
    BookVideoYoutubeDto: [
      'thumbnailUrl',
      'thumbnailWidth',
      'thumbnailHeight',
      'publishedAtUtc',
      'durationIso',
      'durationSeconds',
      'embeddable',
      'dataFetchedAtUtc',
    ],
    BookAttributionDto: [
      'providerId',
      'providerName',
      'requiredNoticeTr',
      'licenceUrl',
      'channelUrl',
    ],
  };

  /**
   * The subset published as `nullable`, by schema. Every field NOT listed here must be
   * non-nullable, so a later edit widening a field to `T | null` is a red test rather than a
   * silent contract change the consumer has to discover at runtime.
   */
  const PUBLISHED_NULLABLE: Record<string, readonly string[]> = {
    BookListItemDto: ['coverImagePath'],
    BookDetailDto: ['coverImagePath', 'titleEn', 'introEn', 'youtubePlaylistId', 'purchaseUrl'],
    BookVideoDto: ['youtube'],
    BookAttributionDto: ['licenceUrl', 'channelUrl'],
  };

  it('publishes all 8 book schemas (the B1 frozen set)', () => {
    // B1 registers three of these through `ROUTELESS_CONTRACT_MODELS` and reaches the rest
    // transitively. A refactor that drops an `extraModels` entry, or that stops a nested DTO from
    // being referenced, removes a schema from the artifact while every other gate stays green.
    // `BookListItemDto` is the live case: it lost its own `extraModels` entry when
    // `DEC 2026-08-15e` moved the endpoint to the envelope, and now reaches the artifact ONLY
    // through `BookListDto.items`.
    for (const schema of [
      'BookListDto',
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

  it('publishes both book paths, with the list query contract on the hub', () => {
    // B1 shipped these schemas with NO route, and `build-document.ts` carried `BookListDto` and
    // `BookDetailDto` as `extraModels` to get them into the artifact at all. B3 landed the routes
    // and REMOVED those entries, so the schemas now reach the spec only through the scanner. This
    // case is what makes that removal safe to have made: if a route is ever renamed, moved behind a
    // different prefix, or dropped, the schemas silently leave the artifact with it, and the field
    // table below would then be asserting over `undefined`.
    const list = document.paths['/api/books'] as { get?: { parameters?: unknown[] } } | undefined;
    expect(`/api/books:${String(list?.get !== undefined)}`).toBe('/api/books:true');
    expect(`/api/books/{slug}:${String(document.paths['/api/books/{slug}'] !== undefined)}`).toBe(
      '/api/books/{slug}:true',
    );

    // The web repo pages until `hasMore` is false, so the CEILING and the DEFAULT are contract, not
    // implementation detail (`kitap-video-web/SPEC.md` §6 E2 asked for exactly this). A default
    // that lived only in a service expression would be invisible here.
    const parameters = (list?.get?.parameters ?? []) as {
      name?: string;
      in?: string;
      required?: boolean;
      schema?: { default?: number; maximum?: number; minimum?: number };
    }[];
    const byName = new Map(parameters.map((parameter) => [parameter.name, parameter]));
    expect([...byName.keys()].sort()).toEqual(['page', 'pageSize']);
    for (const [name, parameter] of byName) {
      expect(`${String(name)}.in=${String(parameter.in)}`).toBe(`${String(name)}.in=query`);
      // Optional, with a published default — a required query parameter would be a BREAKING
      // request change, which is the one class §15 says this leg must not ship.
      expect(`${String(name)}.required=${String(parameter.required === true)}`).toBe(
        `${String(name)}.required=false`,
      );
      expect(`${String(name)}.hasDefault=${String(parameter.schema?.default !== undefined)}`).toBe(
        `${String(name)}.hasDefault=true`,
      );
      expect(`${String(name)}.hasMaximum=${String(parameter.schema?.maximum !== undefined)}`).toBe(
        `${String(name)}.hasMaximum=true`,
      );
    }
  });

  it('every published FIELD is still present, required and nullable exactly as frozen', () => {
    // The case above is satisfied by `null`, `{}` or a schema whose properties were emptied, so on
    // its own it pins presence and nothing else. This one closes that: 61 published entries across
    // the eight schemas, each asserted for presence, required-ness and nullability.
    const entries = Object.entries(PUBLISHED_FIELDS);
    // The "nothing expected" refusal (playbook §8): an emptied table must FAIL, never report that
    // it checked zero fields and pass.
    expect(entries.length).toBeGreaterThan(0);
    for (const [schemaName, fields] of entries) {
      expect(`${schemaName}:fields=${String(fields.length > 0)}`).toBe(`${schemaName}:fields=true`);
      const schema = schemaOf(schemaName);
      const properties = schema.properties ?? {};
      const required = new Set(schema.required ?? []);
      const nullable = new Set(PUBLISHED_NULLABLE[schemaName] ?? []);
      // A nullable entry naming a field the table above does not carry would assert nothing at
      // all — the same dead-guard class this whole case exists to close.
      for (const name of nullable) {
        expect(`${schemaName}.${name}:inFieldTable=${String(fields.includes(name))}`).toBe(
          `${schemaName}.${name}:inFieldTable=true`,
        );
      }
      for (const field of fields) {
        const published = properties[field];
        expect(`${schemaName}.${field}:present=${String(published !== undefined)}`).toBe(
          `${schemaName}.${field}:present=true`,
        );
        expect(`${schemaName}.${field}:required=${String(required.has(field))}`).toBe(
          `${schemaName}.${field}:required=true`,
        );
        expect(`${schemaName}.${field}:nullable=${String(published?.nullable === true)}`).toBe(
          `${schemaName}.${field}:nullable=${String(nullable.has(field))}`,
        );
      }
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
    // has to be asserted. What this case catches is DE-INHERITANCE — a broken `extends`, an
    // `OmitType`, a hand-written detail schema. It does NOT catch a key removed from the BASE:
    // that key then disappears from both sides and the comparison still passes, which is the
    // field-level table's job above.
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
    // UNANCHORED, like the air-quality sibling's own scan and for the same reason: an anchored
    // pattern passes `listPrice`, `salePrice`, `priceTry`, `availabilityStatus`, `offerUrl` and
    // `stockCount`, and a compound name is precisely the accident the docblock's "not even by
    // accident" claim is about. `priceCurrency`, `offers` and `inStock` are gone from the
    // alternation because unanchored they are subsumed by `price`, `offer` and `stock` — the ban
    // is wider than it was, not narrower.
    const banned = /price|currency|availability|offer|stock/i;
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
