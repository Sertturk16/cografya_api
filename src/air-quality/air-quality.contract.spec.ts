import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Contract scans over the COMMITTED OpenAPI artifact (acceptance criterion 10 + SPEC §13.1).
 * CI's `openapi:check` guarantees the committed file matches the code; these tests pin what
 * the committed contract must and must NOT contain.
 */
describe('openapi/openapi.json — air-quality contract', () => {
  const spec = readFileSync(join(__dirname, '..', '..', 'openapi', 'openapi.json'), 'utf8');
  const document = JSON.parse(spec) as {
    paths: Record<string, unknown>;
    components: { schemas: Record<string, unknown> };
  };

  it('publishes the index-system path and the full frozen DTO set (the A1 contract PR)', () => {
    expect(Object.keys(document.paths)).toContain('/api/air-quality/index-system');

    for (const schema of [
      'AirQualityIndexSystemDto',
      'AirQualityIndexSystemCategoryDto',
      'AirQualityIndexSystemPollutantDto',
      'AirQualityIndexDto',
      'AirQualityPollutantValueDto',
      'AirQualitySeriesDto',
      'AirQualitySeriesConcentrationsDto',
      'AirQualityProvinceDto',
      'AirQualityProvinceListItemDto',
      'AirQualityAttributionDto',
    ]) {
      expect(document.components.schemas[schema]).toBeDefined();
    }
  });

  it('publishes the two A2b province paths (A1 kept them ABSENT until they worked)', () => {
    // TRANSLATED from A1's "these paths must NOT exist" case, on purpose and with a ruling behind
    // it: A1 deliberately left them absent rather than stubbing a 501, because an advertised path
    // that cannot work is worse than an absent one. A2b implements them, so the case flips to
    // asserting their presence. No gate is weakened — the absent-vs-stub rule is unchanged, and
    // the ban on measurement vocabulary below still applies to the newly published surface.
    expect(Object.keys(document.paths)).toContain('/api/air-quality/provinces');
    expect(Object.keys(document.paths)).toContain('/api/air-quality/provinces/{plateCode}');
  });

  it('the 8 step-aligned arrays are nullable at the ITEM level, never the array level', () => {
    // Unrepeatable-class guard for the array-vs-item nullability inversion: `nullable` as a
    // SIBLING of `type: array` publishes `T[] | null` while the DTO invariant is `(T|null)[]`
    // (the trap the marine sibling DTO documents). Every one of the 8 series fields must pin
    // `items.nullable === true` and carry NO array-level nullable.
    const fields: [string, string][] = [
      ['AirQualitySeriesDto', 'bands'],
      ['AirQualitySeriesDto', 'categories'],
      ['AirQualitySeriesDto', 'dominantPollutants'],
      ['AirQualitySeriesConcentrationsDto', 'pm2_5'],
      ['AirQualitySeriesConcentrationsDto', 'pm10'],
      ['AirQualitySeriesConcentrationsDto', 'no2'],
      ['AirQualitySeriesConcentrationsDto', 'o3'],
      ['AirQualitySeriesConcentrationsDto', 'so2'],
    ];
    for (const [schemaName, fieldName] of fields) {
      const schema = document.components.schemas[schemaName] as {
        properties?: Record<
          string,
          { type?: string; nullable?: boolean; items?: { nullable?: boolean } }
        >;
      };
      const property = schema.properties?.[fieldName];
      expect(`${schemaName}.${fieldName}:${String(property?.type)}`).toBe(
        `${schemaName}.${fieldName}:array`,
      );
      expect(`${schemaName}.${fieldName}:arrayNullable=${String(property?.nullable)}`).toBe(
        `${schemaName}.${fieldName}:arrayNullable=undefined`,
      );
      expect(`${schemaName}.${fieldName}:itemsNullable=${String(property?.items?.nullable)}`).toBe(
        `${schemaName}.${fieldName}:itemsNullable=true`,
      );
    }
    // The band range must survive the raw-items form: with auto-descent gone, `minimum`/
    // `maximum` exist only if written explicitly inside `items`.
    const bands = (
      document.components.schemas.AirQualitySeriesDto as {
        properties: Record<string, { items?: { minimum?: number; maximum?: number } }>;
      }
    ).properties.bands;
    expect(bands?.items?.minimum).toBe(1);
    expect(bands?.items?.maximum).toBe(6);
  });

  it('publishes analysisEndUtc as an ADDITIVE nullable field with an honest description', () => {
    // TRANSLATED from A1's "this field must not exist anywhere" case. A1 froze the contract
    // without it because Faz-1 was a forecast-only leg, and its own docblock recorded the escape
    // clause: "if a product decision (S2) later adds the analysis job, the field returns
    // ADDITIVELY with an honest definition". DEC 2026-08-02b took that decision, A2a shipped the
    // two-job ingest, A2b publishes the boundary. What the original case actually protected — no
    // forecast hour may be presented as analysis — is asserted here instead of by absence.
    const series = document.components.schemas.AirQualitySeriesDto as {
      properties: Record<string, { type?: string; nullable?: boolean; description?: string }>;
    };
    const field = series.properties.analysisEndUtc;
    expect(field).toBeDefined();
    expect(field?.nullable).toBe(true);
    expect(field?.type).toBe('string');
    // The honesty sentence is part of the contract, not decoration: a consumer reading only the
    // spec must learn that BOTH halves are model output.
    expect(field?.description).toContain('ANALYSIS');
    expect(field?.description).toContain('FORECAST');
    expect(field?.description).toContain('model output');
  });

  it('publishes the CAMS attribution example with a LOWERCASE "information"', () => {
    // Gate item 2, at the artifact level: the licensor's own template is lowercase
    // (DEC 2026-08-02c-1) and the committed spec is what the web codegens from.
    expect(spec).not.toContain('Copernicus Atmosphere Monitoring Service Information');
    expect(spec).toContain('Copernicus Atmosphere Monitoring Service information');
  });

  it('no air-quality FIELD NAME contains measurement/observation/station vocabulary (SPEC §13.1)', () => {
    const schemas = Object.entries(document.components.schemas).filter(([name]) =>
      name.startsWith('AirQuality'),
    );
    expect(schemas.length).toBeGreaterThan(0);
    const banned = /measurement|observation|station|olcum|istasyon/i;
    for (const [schemaName, schema] of schemas) {
      const properties = (schema as { properties?: Record<string, unknown> }).properties ?? {};
      for (const fieldName of Object.keys(properties)) {
        expect(`${schemaName}.${fieldName}`).not.toMatch(banned);
      }
    }
  });
});
