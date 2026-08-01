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
