import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { generateTrScopeBoundary } from './generate-tr-scope-boundary';

/**
 * The generator's REFUSALS, which are the part that matters.
 *
 * A generator that quietly emits an empty boundary is the worst outcome available here: every
 * offshore event would fall out of scope, the page would simply carry fewer earthquakes, and
 * nothing anywhere would say why. So "nothing expected" fails loudly (`ENGINEERING.md` §8's
 * refusal class, applied to a generator rather than to a seed lane).
 */

function sourceWith(features: unknown[]): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-boundary-'));
  const path = join(directory, 'source.geojson');
  writeFileSync(path, JSON.stringify({ type: 'FeatureCollection', features }), 'utf8');
  return path;
}

function outputPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'tr-boundary-out-')), 'tr-boundary.generated.ts');
}

const SQUARE_TR = {
  type: 'Feature',
  properties: { iso: 'TR', name: 'Turkey' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [29, 39],
        [31, 39],
        [31, 41],
        [29, 41],
        [29, 39],
      ],
    ],
  },
};

describe('generateTrScopeBoundary', () => {
  it('emits rings, a bounding box and the source hash', () => {
    const output = outputPath();
    const result = generateTrScopeBoundary({
      sourcePath: sourceWith([SQUARE_TR, { properties: { iso: 'GR' }, geometry: null }]),
      outputPath: output,
      sourceLabel: 'somewhere/world-countries.geojson',
    });

    expect(result.ringCount).toBe(1);
    expect(result.vertexCount).toBe(5);
    expect(result.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.bbox).toEqual({ minLon: 29, minLat: 39, maxLon: 31, maxLat: 41 });

    const emitted = readFileSync(output, 'utf8');
    expect(emitted).toContain('GENERATED FILE — do not edit by hand');
    expect(emitted).toContain('somewhere/world-countries.geojson');
    expect(emitted).toContain(result.sourceSha256);
    // The licence line is provenance, not decoration: it is what tells the next reader that this
    // artifact owes nobody an attribution.
    expect(emitted).toContain('PUBLIC DOMAIN');
    expect(emitted).toContain('export const TR_BOUNDARY_RINGS');
  });

  it('refuses a source with no TR feature at all', () => {
    expect(() =>
      generateTrScopeBoundary({
        sourcePath: sourceWith([{ properties: { iso: 'GR' }, geometry: null }]),
        outputPath: outputPath(),
      }),
    ).toThrow(/exactly one feature with iso "TR"/);
  });

  it('refuses a source with two TR features rather than picking one', () => {
    expect(() =>
      generateTrScopeBoundary({
        sourcePath: sourceWith([SQUARE_TR, SQUARE_TR]),
        outputPath: outputPath(),
      }),
    ).toThrow(/exactly one feature with iso "TR"/);
  });

  it('refuses a ring too short to enclose anything', () => {
    const stub = {
      ...SQUARE_TR,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [29, 39],
            [31, 41],
          ],
        ],
      },
    };
    expect(() =>
      generateTrScopeBoundary({ sourcePath: sourceWith([stub]), outputPath: outputPath() }),
    ).toThrow(/only 2 positions/);
  });

  it('refuses a coordinate that is not a finite number', () => {
    const broken = {
      ...SQUARE_TR,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            ['x', 39],
            [31, 39],
            [31, 41],
            [29, 41],
            ['x', 39],
          ],
        ],
      },
    };
    expect(() =>
      generateTrScopeBoundary({ sourcePath: sourceWith([broken]), outputPath: outputPath() }),
    ).toThrow(/not a finite number/);
  });

  it('reads every ring of a MultiPolygon, holes included', () => {
    const multi = {
      ...SQUARE_TR,
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          SQUARE_TR.geometry.coordinates,
          [
            [
              [40, 39],
              [41, 39],
              [41, 40],
              [40, 39],
            ],
          ],
        ],
      },
    };
    const result = generateTrScopeBoundary({
      sourcePath: sourceWith([multi]),
      outputPath: outputPath(),
    });
    expect(result.ringCount).toBe(2);
    expect(result.bbox.maxLon).toBe(41);
  });
});
