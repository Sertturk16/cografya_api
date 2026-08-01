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

  it('does NOT publish the A1-absent province endpoints (absent beats stubbed-501)', () => {
    expect(Object.keys(document.paths)).not.toContain('/api/air-quality/provinces');
    expect(Object.keys(document.paths)).not.toContain('/api/air-quality/provinces/{plateCode}');
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

  it('contains NO field named analysisEndUtc anywhere (Atlas checkpoint A-7)', () => {
    expect(spec).not.toContain('analysisEndUtc');
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
