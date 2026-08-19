import { describe, expect, it } from '@jest/globals';
import {
  distanceToRingKm,
  distanceToSegmentKm,
  distanceToTrBoundaryKm,
  isWithinTrScope,
  pointInRing,
} from './tr-boundary';
import { TR_BOUNDARY_BBOX, TR_BOUNDARY_RINGS } from './tr-boundary.generated';

/**
 * Geometry is tested on SYNTHETIC rings; the committed outline is tested only for STRUCTURE.
 *
 * That split is `CONVENTIONS.md` §2 applied literally: "Athens is more than 200 km from Türkiye"
 * is a geographic fact, and a fact belongs in the measurement record of the PR, not in an
 * assertion that will silently rot when a boundary snapshot is refreshed.
 */

/** A 2°×2° square centred on (30, 40) — big enough to be measurable, small enough to reason about. */
const SQUARE = [29, 39, 31, 39, 31, 41, 29, 41, 29, 39];

describe('pointInRing', () => {
  it('finds a point inside', () => {
    expect(pointInRing(30, 40, SQUARE)).toBe(true);
  });

  it.each([
    [28, 40, 'west of it'],
    [32, 40, 'east of it'],
    [30, 38, 'south of it'],
    [30, 42, 'north of it'],
  ])('rejects (%s, %s), %s', (lon, lat) => {
    expect(pointInRing(lon, lat, SQUARE)).toBe(false);
  });

  it('ignores a ring too short to enclose anything', () => {
    expect(pointInRing(30, 40, [29, 39])).toBe(false);
  });
});

describe('distanceToSegmentKm', () => {
  it('measures a degree of latitude as about 110.6 km', () => {
    // The one calibration point: if the projection constants were ever swapped or scaled wrong,
    // every distance in this leg would be wrong by the same factor and nothing else would notice.
    const distance = distanceToSegmentKm(30, 40, 29, 41, 31, 41);
    expect(distance).toBeGreaterThan(109);
    expect(distance).toBeLessThan(112);
  });

  it('clamps to the segment ENDS rather than to its infinite line', () => {
    // A point beyond the end of a segment must measure to the endpoint. Without the clamp this
    // returns the perpendicular distance to the line, which understates it badly near coastlines.
    const beyondEnd = distanceToSegmentKm(35, 40, 29, 40, 31, 40);
    const toEndpoint = distanceToSegmentKm(35, 40, 31, 40, 31, 40);
    expect(beyondEnd).toBeCloseTo(toEndpoint, 6);
  });

  it('returns the point distance for a degenerate segment', () => {
    expect(distanceToSegmentKm(30, 40, 30, 40, 30, 40)).toBe(0);
  });

  it('is symmetric in the segment endpoints', () => {
    expect(distanceToSegmentKm(30, 42, 29, 41, 31, 41)).toBeCloseTo(
      distanceToSegmentKm(30, 42, 31, 41, 29, 41),
      9,
    );
  });
});

describe('distanceToRingKm', () => {
  it('is never negative and reaches zero on the ring itself', () => {
    expect(distanceToRingKm(29, 39, SQUARE)).toBeCloseTo(0, 6);
    expect(distanceToRingKm(35, 45, SQUARE)).toBeGreaterThan(0);
  });
});

describe('the committed TR outline — structure only', () => {
  it('carries rings, and every ring is closed', () => {
    expect(TR_BOUNDARY_RINGS.length).toBeGreaterThan(0);
    for (const ring of TR_BOUNDARY_RINGS) {
      expect(ring.length % 2).toBe(0);
      expect(ring.length).toBeGreaterThanOrEqual(8);
      expect(ring[0]).toBe(ring[ring.length - 2]);
      expect(ring[1]).toBe(ring[ring.length - 1]);
    }
  });

  it('holds only coordinates that exist on Earth', () => {
    for (const ring of TR_BOUNDARY_RINGS) {
      for (let index = 0; index + 1 < ring.length; index += 2) {
        const lon = ring[index] ?? Number.NaN;
        const lat = ring[index + 1] ?? Number.NaN;
        expect(lon).toBeGreaterThanOrEqual(-180);
        expect(lon).toBeLessThanOrEqual(180);
        expect(lat).toBeGreaterThanOrEqual(-90);
        expect(lat).toBeLessThanOrEqual(90);
      }
    }
  });

  it('declares a bounding box that actually bounds its own rings', () => {
    for (const ring of TR_BOUNDARY_RINGS) {
      for (let index = 0; index + 1 < ring.length; index += 2) {
        expect(ring[index]).toBeGreaterThanOrEqual(TR_BOUNDARY_BBOX.minLon);
        expect(ring[index]).toBeLessThanOrEqual(TR_BOUNDARY_BBOX.maxLon);
        expect(ring[index + 1]).toBeGreaterThanOrEqual(TR_BOUNDARY_BBOX.minLat);
        expect(ring[index + 1]).toBeLessThanOrEqual(TR_BOUNDARY_BBOX.maxLat);
      }
    }
  });
});

describe('isWithinTrScope', () => {
  const bufferKm = 200;

  it('accepts every vertex of the outline itself', () => {
    // Structural, not factual: a point ON the boundary is at distance 0 by definition, whatever
    // the boundary happens to be.
    for (const ring of TR_BOUNDARY_RINGS) {
      const lon = ring[0];
      const lat = ring[1];
      if (lon === undefined || lat === undefined) continue;
      expect(isWithinTrScope(lon, lat, bufferKm)).toBe(true);
    }
  });

  it('rejects the far side of the planet', () => {
    expect(isWithinTrScope(-120, 35, bufferKm)).toBe(false);
    expect(isWithinTrScope(140, -35, bufferKm)).toBe(false);
  });

  it('never rejects a point the full computation would have accepted', () => {
    // The pre-filter's one dangerous direction. A box that is too tight silently drops real
    // events, so this walks a grid across and well beyond the bounding box and asserts the
    // pre-filtered answer agrees with the unfiltered distance everywhere.
    for (let lon = TR_BOUNDARY_BBOX.minLon - 6; lon <= TR_BOUNDARY_BBOX.maxLon + 6; lon += 0.5) {
      for (let lat = TR_BOUNDARY_BBOX.minLat - 6; lat <= TR_BOUNDARY_BBOX.maxLat + 6; lat += 0.5) {
        const byDistance = distanceToTrBoundaryKm(lon, lat) <= bufferKm;
        expect(isWithinTrScope(lon, lat, bufferKm)).toBe(byDistance);
      }
    }
  });

  it('grows with the buffer rather than shrinking', () => {
    const wider = (lon: number, lat: number): void => {
      if (isWithinTrScope(lon, lat, 100)) expect(isWithinTrScope(lon, lat, 300)).toBe(true);
    };
    for (let lon = 20; lon <= 50; lon += 1) for (let lat = 30; lat <= 46; lat += 1) wider(lon, lat);
  });

  it('refuses a non-finite coordinate instead of ranging over NaN', () => {
    expect(isWithinTrScope(Number.NaN, 40, bufferKm)).toBe(false);
    expect(isWithinTrScope(30, Number.POSITIVE_INFINITY, bufferKm)).toBe(false);
  });

  it('includes the buffer EDGE itself, and excludes anything past it', () => {
    // The grid case above computes its expectation with the same `<=` the function uses, so it can
    // only see an edge regression if a grid point lands at exactly the buffer distance — none does
    // (review #118 TA118-M7). This constructs the edge from the function under test instead: a
    // point whose distance IS the buffer must be in scope, and the same point one step tighter
    // must not.
    const lon = TR_BOUNDARY_BBOX.maxLon + 2;
    const lat = TR_BOUNDARY_BBOX.minLat - 1;
    const distance = distanceToTrBoundaryKm(lon, lat);

    // The control: this point is genuinely OUTSIDE, so the comparison is doing work.
    expect(distance).toBeGreaterThan(0);
    expect(isWithinTrScope(lon, lat, distance)).toBe(true);
    expect(isWithinTrScope(lon, lat, distance * (1 - 1e-12))).toBe(false);
  });

  it('treats a zero buffer as inside-only, and a negative one as no scope at all', () => {
    const ring = TR_BOUNDARY_RINGS[0];
    const lon = ring?.[0];
    const lat = ring?.[1];
    expect(lon).toBeDefined();
    expect(lat).toBeDefined();
    // A vertex sits at distance 0, so a zero buffer still admits it — "inside or on the outline".
    expect(isWithinTrScope(lon ?? 0, lat ?? 0, 0)).toBe(true);
    // A negative buffer is not a tighter scope, it is a nonsense value, and it is refused.
    expect(isWithinTrScope(lon ?? 0, lat ?? 0, -1)).toBe(false);
    expect(isWithinTrScope(30, 39, -1)).toBe(false);
  });
});
