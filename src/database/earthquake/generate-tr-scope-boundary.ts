import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * The hand-run generator behind `src/earthquake/scope/tr-boundary.generated.ts`.
 *
 * ## Why the api needs a polygon at all
 * `QUESTIONS.md` D-1 forbids deciding scope from AFAD's `province` field, because that field is
 * the nearest TURKISH province rather than the event's own (an Iranian event arrives as `Ağrı`).
 * D-B therefore draws the boundary geometrically: an event is in scope if it happened in Türkiye
 * or within the buffer of Türkiye's national outline. **The buffer is 200 km** — `DEC 2026-08-17k`
 * md.4, which superseded `DEC 2026-08-12k` D-B's 150 km after this leg's own measurement showed a
 * measured North Aegean event sitting at 178.7 km, i.e. exactly the kind of open-water event D-1
 * warned would be dropped.
 *
 * ## Why THIS source
 * Natural Earth Admin-0 (1:50m), filtered to the single `TR` feature. It is **public domain** —
 * "no restrictions … may use in any manner", attribution not required — so importing it creates no
 * licence surface, no derivative-database obligation and no new attribution string on any page.
 * The rejected alternative was the OSM-derived province set: same job, **ODbL**, mandatory
 * attribution, and — concretely — a published OSM credit would have had to widen
 * `EarthquakeAttributionDto.providerId` beyond `'afad'`, which is a CONTRACT change (Atlas ruling,
 * `DEC 2026-08-17k` md.3).
 *
 * Accuracy is a non-issue at this buffer: 1:50m generalisation plus the snapshot's 3-decimal
 * rounding is on the order of a hundred metres against a 200 000 m radius.
 *
 * ## Two phases, and this is the one that may not run itself
 * The generator is run BY HAND, its output is committed, and nothing at runtime or in CI executes
 * it (`ENGINEERING.md` §5). The source file lives in the sibling web repo — read-only, never
 * edited — which is why the path is a parameter rather than a constant.
 */

/** Rounding the emitted coordinates: 4 dp ≈ 11 m, four orders of magnitude inside the buffer. */
const EMIT_DECIMALS = 4;

export interface TrBoundaryGeneration {
  readonly ringCount: number;
  readonly vertexCount: number;
  readonly sourceSha256: string;
  readonly bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
}

/**
 * Read the snapshot, extract Türkiye, emit the TypeScript module.
 *
 * @throws when the source does not hold EXACTLY one `TR` feature with at least one non-empty ring.
 * That refusal is the point: a silently empty boundary would classify every offshore event as out
 * of scope and the page would simply have fewer earthquakes on it, with nothing anywhere saying
 * why (`ENGINEERING.md` §8's "nothing expected" refusal, applied to a generator).
 */
export function generateTrScopeBoundary(options: {
  readonly sourcePath: string;
  readonly outputPath: string;
  /**
   * How the source is NAMED in the generated header.
   *
   * Separate from {@link sourcePath} because the path is whatever machine ran the generator, and
   * an absolute `/home/<somebody>/…` baked into a committed file is provenance that stops being
   * true the moment anyone else regenerates it. The label is the platform-relative location that
   * stays true; the SHA-256 beside it is what actually identifies the bytes.
   */
  readonly sourceLabel?: string;
}): TrBoundaryGeneration {
  const bytes = readFileSync(options.sourcePath);
  const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
  const parsed: unknown = JSON.parse(bytes.toString('utf8'));

  const features = readFeatures(parsed);
  const turkish = features.filter((feature) => readIso(feature) === 'TR');
  if (turkish.length !== 1) {
    throw new Error(
      `expected exactly one feature with iso "TR" in ${options.sourcePath}, found ` +
        String(turkish.length),
    );
  }
  const feature = turkish[0];
  if (feature === undefined) throw new Error('unreachable: TR feature vanished after filtering');

  const rings = readRings(feature);
  if (rings.length === 0) throw new Error('the TR feature carries no rings');

  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let vertexCount = 0;

  const emittedRings: string[] = [];
  for (const ring of rings) {
    if (ring.length < 4) {
      // A closed ring needs at least four positions (three corners plus the repeat).
      throw new Error(`a TR ring carries only ${String(ring.length)} positions`);
    }
    const flat: number[] = [];
    for (const position of ring) {
      if (!Array.isArray(position)) throw new Error('a TR position is not an array');
      const coordinates = position as readonly unknown[];
      const lon = round(coordinates[0]);
      const lat = round(coordinates[1]);
      if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        throw new Error(`a TR vertex is out of range: ${String(lon)},${String(lat)}`);
      }
      flat.push(lon, lat);
      vertexCount += 1;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    emittedRings.push(`  [${flat.map((value) => String(value)).join(', ')}],`);
  }

  const bbox = { minLon, minLat, maxLon, maxLat };
  writeFileSync(
    options.outputPath,
    renderModule({
      sourcePath: options.sourceLabel ?? options.sourcePath,
      sourceSha256,
      ringCount: rings.length,
      vertexCount,
      bbox,
      emittedRings,
    }),
    'utf8',
  );

  return { ringCount: rings.length, vertexCount, sourceSha256, bbox };
}

function renderModule(input: {
  sourcePath: string;
  sourceSha256: string;
  ringCount: number;
  vertexCount: number;
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  emittedRings: readonly string[];
}): string {
  const { bbox } = input;
  return `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Produced by \`src/database/earthquake/generate-tr-scope-boundary.ts\`
 * (\`pnpm db:import:earthquakes --phase=boundary --source=<geojson>\`).
 *
 * Source dataset : Natural Earth, Admin-0 Countries, 1:50m (\`ne_50m_admin_0_countries\`),
 *                  filtered to the single feature whose join key is \`TR\`.
 * Source snapshot: ${input.sourcePath}
 * Source SHA-256 : ${input.sourceSha256}
 * Licence        : PUBLIC DOMAIN — Natural Earth Terms of Use ("no restrictions … may use in any
 *                  manner"). Attribution is NOT required; no attribution string is minted for it
 *                  anywhere in this repo, and none is owed.
 * Ruling         : DEC 2026-08-17k md.3 (this source, ODbL alternative rejected) and md.4 (the
 *                  200 km buffer that superseded DEC 2026-08-12k D-B's 150 km).
 *
 * Rings are FLAT coordinate arrays — \`[lon, lat, lon, lat, …]\` — closed, in WGS84 decimal
 * degrees rounded to ${String(EMIT_DECIMALS)} decimals (~11 m). Flat rather than tupled because
 * the only consumer walks them as segments and a tuple-of-tuples costs one object per vertex on
 * every event classified.
 *
 * Rings: ${String(input.ringCount)} · vertices: ${String(input.vertexCount)}
 */

/** Bounding box of every ring below — the cheap pre-filter's input. */
export const TR_BOUNDARY_BBOX = {
  minLon: ${String(bbox.minLon)},
  minLat: ${String(bbox.minLat)},
  maxLon: ${String(bbox.maxLon)},
  maxLat: ${String(bbox.maxLat)},
} as const;

/**
 * Türkiye's national outline: ${String(input.ringCount)} closed rings, flat \`[lon, lat, …]\`.
 *
 * \`prettier-ignore\` because this is DATA, not code: left to itself the formatter puts every one
 * of these numbers on its own line, turning a ten-kilobyte artifact into a twenty-thousand-line
 * one and every future regeneration into an unreadable diff.
 */
// prettier-ignore
export const TR_BOUNDARY_RINGS: readonly (readonly number[])[] = [
${input.emittedRings.join('\n')}
];
`;
}

function round(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`a coordinate is not a finite number: ${String(value)}`);
  }
  const factor = 10 ** EMIT_DECIMALS;
  return Math.round(value * factor) / factor;
}

function readFeatures(parsed: unknown): readonly Record<string, unknown>[] {
  if (typeof parsed !== 'object' || parsed === null) throw new Error('source is not an object');
  const features = (parsed as Record<string, unknown>)['features'];
  if (!Array.isArray(features)) throw new Error('source carries no `features` array');
  return features.filter(
    (feature): feature is Record<string, unknown> =>
      typeof feature === 'object' && feature !== null && !Array.isArray(feature),
  );
}

function readIso(feature: Record<string, unknown>): string | null {
  const properties = feature['properties'];
  if (typeof properties !== 'object' || properties === null) return null;
  const iso = (properties as Record<string, unknown>)['iso'];
  return typeof iso === 'string' ? iso : null;
}

/** Every linear ring of a Polygon or MultiPolygon, outer and inner alike. */
function readRings(feature: Record<string, unknown>): readonly (readonly unknown[])[] {
  const geometry = feature['geometry'];
  if (typeof geometry !== 'object' || geometry === null) {
    throw new Error('TR feature has no geometry');
  }
  const type = (geometry as Record<string, unknown>)['type'];
  const coordinates = (geometry as Record<string, unknown>)['coordinates'];
  if (!Array.isArray(coordinates)) throw new Error('TR geometry has no coordinates');

  const polygons: unknown[] = type === 'Polygon' ? [coordinates] : coordinates;
  const rings: (readonly unknown[])[] = [];
  for (const polygon of polygons) {
    if (!Array.isArray(polygon)) throw new Error('TR polygon is not an array');
    for (const ring of polygon) {
      if (!Array.isArray(ring)) throw new Error('TR ring is not an array');
      rings.push(ring as readonly unknown[]);
    }
  }
  return rings;
}
