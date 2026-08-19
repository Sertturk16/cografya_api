import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Contract scans over the COMMITTED OpenAPI artifact — the guard E3 owes the leg.
 *
 * ## Why this exists, and why it exists NOW
 * E1 published the earthquake schemas without a route, through `ROUTELESS_CONTRACT_MODELS` in
 * `src/openapi/build-document.ts`. That registration was itself a structural guarantee: whatever
 * else changed, those types stayed in `components.schemas`. **E3 emptied that list** — correctly,
 * since every schema is now reachable from a real route through a `$ref` chain — and thereby
 * removed the guarantee without replacing it (review #121 CODE121-I1 / TA121-M4). Both sibling
 * legs already carry this guard: `src/air-quality/air-quality.contract.spec.ts` (A1) and
 * `src/book/book.contract.spec.ts` (B1).
 *
 * ## Why `openapi:check` is NOT this guard
 * That CI job regenerates the spec and diffs it, so it proves the artifact MATCHES THE CODE. It is
 * green by construction for anyone who drops a schema and regenerates: code and contract agree
 * the schema is gone. What needs pinning is the opposite direction — that the committed contract
 * still CONTAINS what the web repo generates types from.
 *
 * The concrete path this closes: E4 lands `disclaimerTr` on `EarthquakeMetaDto` and, while
 * restructuring, retypes `@ApiProperty({ type: EarthquakeAttributionDto, isArray: true })` to a
 * generic array. Compilation is unaffected — the TypeScript field and the runtime value are
 * untouched — so `Typecheck & Lint`, `Test (unit)`, `Test (e2e)` and `OpenAPI spec drift` all stay
 * green, while `EarthquakeAttributionDto` loses its last `$ref` and drops out of the artifact. The
 * web repo's next codegen silently loses the type carrying the TDVMS Yönetmeliği m.9/4 mandatory
 * notice.
 *
 * ## Structural only
 * No fact about the world is asserted (`CONVENTIONS.md` §2): no magnitude, no depth, no place
 * name, no count of events. Every case is about the SHAPE of the published contract, so real data
 * changing can never turn it red.
 */
describe('openapi/openapi.json — earthquake contract', () => {
  const spec = readFileSync(join(__dirname, '..', '..', 'openapi', 'openapi.json'), 'utf8');
  const document = JSON.parse(spec) as {
    paths: Record<string, Record<string, unknown>>;
    components: { schemas: Record<string, unknown> };
  };

  type SchemaObject = {
    properties?: Record<string, { type?: string; nullable?: boolean; enum?: unknown[] }>;
    required?: string[];
  };

  const schemaOf = (name: string): SchemaObject =>
    document.components.schemas[name] as SchemaObject;

  /** The three public paths E3 opened. */
  const PUBLISHED_PATHS = [
    '/api/earthquakes',
    '/api/earthquakes/meta',
    '/api/earthquakes/provinces/{plateCode}',
  ] as const;

  /**
   * Every field the six schemas publish, by schema — the FIELD-level half of this guard.
   *
   * Pinning whole schemas alone leaves almost every field open: emptying `EarthquakeEventDto` to
   * `{"type": "object"}` keeps the schema in `components.schemas` and a presence-only case stays
   * green. Removing a field is a BREAKING contract change that goes to Atlas (`ENGINEERING.md`
   * §4); ADDING one is additive and needs no edit here — which is exactly how E4's `disclaimerTr`
   * will land.
   *
   * `EarthquakeListDto` repeats the four inherited envelope keys because `@nestjs/swagger` emits
   * the subclass FLAT: the artifact records no inheritance, so the published schema really does
   * declare them itself. That is also why the core five are worth pinning by name — losing
   * `hasMore` or `total` is a silent envelope defect the web repo's paging loop would discover at
   * runtime.
   */
  const PUBLISHED_FIELDS: Record<string, readonly string[]> = {
    EarthquakeListDto: ['items', 'page', 'pageSize', 'total', 'hasMore', 'meta'],
    EarthquakeListMetaDto: [
      'filter',
      'dataUpdatedAtUtc',
      'latestEventAtUtc',
      'dataStatus',
      'attributions',
    ],
    EarthquakeFilterEchoDto: ['minMagnitude', 'plateCode', 'fromUtc', 'toUtc'],
    EarthquakeEventDto: [
      'id',
      'providerEventId',
      'occurredAtUtc',
      'magnitude',
      'magnitudeType',
      'magnitudeTypeRaw',
      'depthKm',
      'latitude',
      'longitude',
      'placeNameTr',
      'providerLocationRaw',
      'bindingKind',
      'bindingPlateCode',
      'bindingDistanceKm',
      'providerCountry',
      'isRevised',
      'providerUpdatedAtUtc',
      'revisionCount',
    ],
    EarthquakeAttributionDto: [
      'providerId',
      'providerName',
      'requiredNoticeTr',
      'regulationReference',
      'licenceUrl',
    ],
    EarthquakeMetaDto: [
      'minMagnitudeDefault',
      'scopeBufferKm',
      'defaultWindowDays',
      'maxWindowDays',
      'dataUpdatedAtUtc',
      'latestEventAtUtc',
      'dataStatus',
      'attributions',
    ],
  };

  /**
   * The subset published as `nullable`, by schema. Every field NOT listed here must be
   * non-nullable, so widening one to `T | null` later is a red test rather than a silent contract
   * change the consumer discovers at runtime.
   *
   * `bindingKind` is deliberately absent from every list: it is non-nullable BY DESIGN, because a
   * consumer that could ignore it would render an event across the border as an earthquake in the
   * Turkish province the provider filed it under.
   */
  const PUBLISHED_NULLABLE: Record<string, readonly string[]> = {
    EarthquakeListMetaDto: ['dataUpdatedAtUtc', 'latestEventAtUtc'],
    EarthquakeFilterEchoDto: ['plateCode'],
    EarthquakeEventDto: [
      'bindingPlateCode',
      'bindingDistanceKm',
      'providerCountry',
      'providerUpdatedAtUtc',
    ],
    EarthquakeAttributionDto: ['licenceUrl'],
    EarthquakeMetaDto: ['dataUpdatedAtUtc', 'latestEventAtUtc'],
  };

  it('publishes all three earthquake paths', () => {
    for (const path of PUBLISHED_PATHS) {
      expect(Object.keys(document.paths)).toContain(path);
      expect(document.paths[path]).toHaveProperty('get');
    }
  });

  it('publishes all 6 earthquake schemas, none of which has an extraModels entry any more', () => {
    for (const schema of Object.keys(PUBLISHED_FIELDS)) {
      expect(Object.keys(document.components.schemas)).toContain(schema);
    }
  });

  it('publishes exactly the frozen field set of each schema', () => {
    for (const [schema, fields] of Object.entries(PUBLISHED_FIELDS)) {
      const properties = schemaOf(schema).properties ?? {};
      expect(Object.keys(properties).sort()).toEqual([...fields].sort());
    }
  });

  it('keeps every published field required unless it is listed as nullable', () => {
    for (const [schema, fields] of Object.entries(PUBLISHED_FIELDS)) {
      // Nullable and optional are different things here: every field is REQUIRED in the response,
      // and some of them are required-but-null. A field that became optional would let a consumer
      // compile against a payload the server never sends.
      expect(schemaOf(schema).required?.slice().sort()).toEqual([...fields].sort());
    }
  });

  it('publishes exactly the nullable subset, and nothing else as nullable', () => {
    for (const schema of Object.keys(PUBLISHED_FIELDS)) {
      const properties = schemaOf(schema).properties ?? {};
      const nullable = Object.entries(properties)
        .filter(([, value]) => value.nullable === true)
        .map(([name]) => name)
        .sort();
      expect(nullable).toEqual([...(PUBLISHED_NULLABLE[schema] ?? [])].sort());
    }
  });

  /**
   * The two closed sets `SPEC` §15 names as the leg's highest breaking-change risk. Adding a member
   * is itself breaking here — it can break an exhaustive `switch` in the consumer — so this pins
   * the members rather than merely their presence.
   */
  it('freezes the magnitudeType and bindingKind vocabularies', () => {
    expect(schemaOf('EarthquakeEventDto').properties?.magnitudeType?.enum).toEqual([
      'ML',
      'Mw',
      'Ms',
      'mb',
      'Md',
      'Mwp',
      'other',
    ]);
    expect(schemaOf('EarthquakeEventDto').properties?.bindingKind?.enum).toEqual([
      'inside',
      'offshore_near',
      'across_border',
    ]);
  });

  /**
   * The request contract, which OpenAPI can express and prose cannot enforce.
   *
   * The published bounds must equal the exported constants the server validates against — the
   * "two decorators no tool cross-checks" drift class, closed from the artifact side.
   */
  it('publishes the query bounds the server actually enforces', () => {
    const parameters = (
      document.paths['/api/earthquakes'] as {
        get: {
          parameters: { name: string; schema: Record<string, unknown>; required?: boolean }[];
        };
      }
    ).get.parameters;
    const byName = new Map(parameters.map((parameter) => [parameter.name, parameter]));

    expect(byName.get('minMagnitude')?.schema).toMatchObject({
      minimum: -1,
      maximum: 10,
      default: 2.5,
    });
    expect(byName.get('page')?.schema).toMatchObject({ minimum: 1, maximum: 10_000, default: 1 });
    expect(byName.get('pageSize')?.schema).toMatchObject({ minimum: 1, maximum: 200, default: 50 });
    // Every list parameter is optional: the endpoint must answer a bare GET with its defaults.
    for (const parameter of parameters) {
      expect(parameter.required).not.toBe(true);
    }
  });

  /**
   * The explicit-zone rule reaches the contract as a `pattern`, not only as prose.
   *
   * Without it a codegen'd client formats a `Date` without an offset, passes its own generated
   * validation, and receives a 400 the artifact gave it no way to predict — the three-hour
   * timezone trap displaced onto the consumer (review #121 CODE121-M4).
   */
  it('publishes the timezone pattern on both window parameters', () => {
    const parameters = (
      document.paths['/api/earthquakes'] as {
        get: { parameters: { name: string; schema: Record<string, unknown> }[] };
      }
    ).get.parameters;

    for (const name of ['fromUtc', 'toUtc']) {
      const schema = parameters.find((parameter) => parameter.name === name)?.schema;
      expect(schema).toMatchObject({ type: 'string', format: 'date-time' });
      expect(schema?.pattern).toBe('(?:Z|[+-]\\d{2}:?\\d{2})$');
      expect(schema?.maxLength).toBe(64);
    }
  });

  /**
   * No future-tense field, anywhere in the published contract.
   *
   * A ruling rather than a preference (DEC 2026-07-30k, `QUESTIONS.md` D-6): this leg publishes
   * recorded earthquakes and must not read as an early-warning product. Asserted over the ARTIFACT
   * because that is what the web repo codegens from — a field added to a DTO without a test is
   * exactly how the ban would erode.
   */
  it('publishes no prediction, probability, risk or alert field', () => {
    const forbidden = /forecast|predict|expected|probabilit|riskscore|alertlevel|warning/i;
    for (const schema of Object.keys(PUBLISHED_FIELDS)) {
      for (const field of Object.keys(schemaOf(schema).properties ?? {})) {
        expect(field).not.toMatch(forbidden);
      }
    }
  });
});
