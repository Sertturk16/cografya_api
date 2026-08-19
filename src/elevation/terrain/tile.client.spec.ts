import { beforeEach, describe, expect, it } from '@jest/globals';
import { CircuitBreaker } from '../../upstream/circuit-breaker';
import { OperationDeadline } from '../../upstream/operation-deadline';
import { ProviderBudget, type ProviderBudgetLimits } from '../../upstream/provider-budget';
import { UpstreamHttpClient } from '../../upstream/upstream-http.client';
import { UpstreamMetrics } from '../../upstream/upstream-metrics';
import { ELEVATION_PROVIDER_TERRAIN_TILES } from '../elevation.types';
import { buildTerrariumTilePng } from './terrarium-fixture.builder';
import {
  ATTRIBUTION_COVERED_SOURCE_FAMILIES,
  IMAGERY_SOURCES_HEADER,
  parseImagerySourceFamilies,
  refuseImagerySources,
  SEA_DEPTH_SOURCE_FAMILIES,
  TerrainTileClient,
} from './tile.client';
import { TERRAIN_SAMPLE_ZOOM } from './tile-math';

const LIMITS: ProviderBudgetLimits = { perMinute: 1_000, perHour: 10_000, perDay: 100_000 };

/** A conforming tile: every pixel at the same elevation, so the decode is unambiguous. */
function tilePng(metres: number): Uint8Array {
  return buildTerrariumTilePng(() => metres);
}

interface FakeResponseSpec {
  readonly status?: number;
  readonly contentType?: string;
  readonly body?: Uint8Array;
  readonly imagerySources?: string | null;
}

function clientWith(spec: FakeResponseSpec): {
  client: TerrainTileClient;
  metrics: UpstreamMetrics;
  calls: string[];
} {
  const calls: string[] = [];
  const metrics = new UpstreamMetrics();
  const fetchImpl = ((input: string): Promise<Response> => {
    calls.push(input);
    const headers = new Headers({ 'content-type': spec.contentType ?? 'image/png' });
    if (spec.imagerySources !== null && spec.imagerySources !== undefined) {
      headers.set(IMAGERY_SOURCES_HEADER, spec.imagerySources);
    }
    // `Buffer.from(view)` COPIES rather than aliasing, so the shared fixture cannot be mutated by
    // a consumer of the response; and it is a `BodyInit` where a bare `Uint8Array` is not.
    const body = Buffer.from(spec.body ?? tilePng(100));
    return Promise.resolve(new Response(body, { status: spec.status ?? 200, headers }));
  }) as unknown as typeof fetch;

  const http = new UpstreamHttpClient(
    metrics,
    new ProviderBudget(metrics, null),
    new CircuitBreaker(metrics),
    { singleCallTimeoutMs: 1_000, userAgent: 'test-agent', fetchImpl },
  );

  return {
    client: new TerrainTileClient(http, metrics, {
      baseUrl: 'https://tiles.invalid',
      limits: LIMITS,
      singleCallTimeoutMs: 1_000,
      maxResponseBytes: 1_000_000,
    }),
    metrics,
    calls,
  };
}

describe('parseImagerySourceFamilies', () => {
  it('reduces the measured header shape to its family tokens', () => {
    expect(
      parseImagerySourceFamilies(
        'eudem/eudem_dem_5deg_n35e030.tif, gmted/30N030E_20101117_gmted_mea075.tif',
      ),
    ).toEqual(['eudem', 'gmted']);
  });

  it('de-duplicates, so a tile stitched from four files of one family reads as one', () => {
    expect(parseImagerySourceFamilies('srtm/a.tif, srtm/b.tif, srtm/c.tif')).toEqual(['srtm']);
  });

  it('folds case and trims, because a header value is not a normalised string', () => {
    expect(parseImagerySourceFamilies('  EUDEM/x.tif ,\tGMTED/y.tif ')).toEqual(['eudem', 'gmted']);
  });

  it('yields the whole token when the value carries no path separator', () => {
    // A reshaped value must produce an UNKNOWN family rather than an empty list: an empty parse of
    // a PRESENT header is the quietest possible way for this guard to stop working.
    expect(parseImagerySourceFamilies('something-new')).toEqual(['something-new']);
  });

  it('splits on whitespace and the other plausible separators, not on the comma alone', () => {
    // The hole that hid a source behind the first one: with a comma-only split this value parsed to
    // `['eudem']` and the sea-depth family was invisible while the tile was sampled anyway
    // (review #124, VAL124-M1).
    expect(parseImagerySourceFamilies('eudem/x.tif etopo1/ETOPO1_Bed_g.tif')).toEqual([
      'eudem',
      'etopo1',
    ]);
    expect(parseImagerySourceFamilies('eudem/x.tif; etopo1/y.tif')).toEqual(['eudem', 'etopo1']);
    expect(parseImagerySourceFamilies('eudem/x.tif|gmted/y.tif')).toEqual(['eudem', 'gmted']);
  });

  it('keeps the whole entry when its leading path segment is empty', () => {
    // One leading slash used to erase the token entirely, so the tile was accepted with no refusal
    // and no counter — the guard silently off (review #124, SFH124-I1).
    expect(parseImagerySourceFamilies('/etopo1/ETOPO1_Bed_g.tif')).toEqual([
      '/etopo1/etopo1_bed_g.tif',
    ]);
    expect(parseImagerySourceFamilies('/')).toEqual(['/']);
  });

  it('returns an empty list only when the value holds nothing but separators', () => {
    expect(parseImagerySourceFamilies(',')).toEqual([]);
    expect(parseImagerySourceFamilies(' , ')).toEqual([]);
  });
});

describe('refuseImagerySources', () => {
  it('accepts every family the published attribution credits', () => {
    for (const family of ATTRIBUTION_COVERED_SOURCE_FAMILIES) {
      expect(refuseImagerySources([family])).toBeNull();
    }
  });

  it('refuses a sea-depth family even though the notices credit it', () => {
    for (const family of SEA_DEPTH_SOURCE_FAMILIES) {
      const refusal = refuseImagerySources([family]);
      expect(refusal).not.toBeNull();
      expect(refusal).toContain('sea depth');
    }
  });

  it('refuses a family nobody credits', () => {
    const refusal = refuseImagerySources(['eudem', 'aster']);
    expect(refusal).not.toBeNull();
    expect(refusal).toContain('aster');
    // Names the offender rather than the whole set: the log line is the only place a human sees
    // which source appeared.
    expect(refusal).not.toContain('eudem');
  });

  it('reports the sea-depth reason FIRST when both problems are present', () => {
    // Ordering is a decision, not an accident: an `etopo1` sighting means the zoom pin's premise
    // broke, which is a different investigation from an uncredited source and the more urgent one.
    expect(refuseImagerySources(['aster', 'etopo1'])).toContain('sea depth');
  });

  it('refuses an empty family list — it can only come from a header we did not understand', () => {
    // The case this replaces asserted the opposite and described a caller that does not exist:
    // `checkImagerySources` returns BEFORE this function for a null or blank header, so an empty
    // set here has exactly one reachable origin — a present header that parsed to nothing
    // (review #124, SFH124-I1). The old case pinned the hole rather than a safe path.
    expect(refuseImagerySources([])).toContain('named no source family');
  });

  it('refuses an entry whose leading segment is empty, naming the token it could not read', () => {
    const refusal = refuseImagerySources(parseImagerySourceFamilies('/etopo1/ETOPO1_Bed_g.tif'));
    expect(refusal).not.toBeNull();
    expect(refusal).toContain('/etopo1/etopo1_bed_g.tif');
  });
});

describe('TerrainTileClient', () => {
  let deadline: OperationDeadline;

  beforeEach(() => {
    deadline = new OperationDeadline(5_000);
  });

  it('builds the bucket’s own URL shape', () => {
    const { client } = clientWith({});
    expect(client.urlFor(12, 2451, 1572)).toBe('https://tiles.invalid/terrarium/12/2451/1572.png');
  });

  it('decodes a conforming tile', async () => {
    const { client } = clientWith({ imagerySources: 'eudem/x.tif' });
    const outcome = await client.fetchTile(TERRAIN_SAMPLE_ZOOM, 1, 2, deadline);
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;
    expect(outcome.value).toHaveLength(256 * 256);
    expect(outcome.value[0]).toBe(100);
  });

  it('REFUSES a tile whose sources the attribution does not cover', async () => {
    const { client, metrics } = clientWith({ imagerySources: 'aster/global.tif' });
    const outcome = await client.fetchTile(TERRAIN_SAMPLE_ZOOM, 1, 2, deadline);
    expect(outcome.kind).toBe('schema_error');
    expect(metrics.get('elevation.imagery_sources_refused', ELEVATION_PROVIDER_TERRAIN_TILES)).toBe(
      1,
    );
  });

  it('REFUSES a tile carrying a sea-depth source at the sampling zoom', async () => {
    const { client, metrics } = clientWith({
      imagerySources: 'gmted/x.tif, etopo1/ETOPO1_Bed_g.tif',
    });
    const outcome = await client.fetchTile(TERRAIN_SAMPLE_ZOOM, 1, 2, deadline);
    expect(outcome.kind).toBe('schema_error');
    expect(metrics.get('elevation.imagery_sources_refused', ELEVATION_PROVIDER_TERRAIN_TILES)).toBe(
      1,
    );
  });

  it('ACCEPTS a tile with no imagery-sources header, and counts it', async () => {
    // The asymmetry that matters: a metadata change is not a licence change, so failing closed
    // here would take the feature down for a risk that is not licence risk.
    const { client, metrics } = clientWith({ imagerySources: null });
    const outcome = await client.fetchTile(TERRAIN_SAMPLE_ZOOM, 1, 2, deadline);
    expect(outcome.kind).toBe('ok');
    expect(metrics.get('elevation.imagery_sources_absent', ELEVATION_PROVIDER_TERRAIN_TILES)).toBe(
      1,
    );
  });

  it('treats an EMPTY header value the same as an absent one', async () => {
    const { client, metrics } = clientWith({ imagerySources: '   ' });
    const outcome = await client.fetchTile(TERRAIN_SAMPLE_ZOOM, 1, 2, deadline);
    expect(outcome.kind).toBe('ok');
    expect(metrics.get('elevation.imagery_sources_absent', ELEVATION_PROVIDER_TERRAIN_TILES)).toBe(
      1,
    );
  });

  it('REFUSES a tile whose PRESENT header does not parse into a known family', async () => {
    // The provider reshaping its object metadata by one character (`etopo1/…` → `/etopo1/…`) used
    // to disable the tripwire silently: no refusal, no counter, no log — and, if `etopo1` returned
    // at z12, sea-floor depths published as elevations under `seaDepthIncluded:false`
    // (review #124, SFH124-I1).
    const reshaped = clientWith({ imagerySources: '/etopo1/ETOPO1_Bed_g.tif' });
    const first = await reshaped.client.fetchTile(TERRAIN_SAMPLE_ZOOM, 1, 2, deadline);
    expect(first.kind).toBe('schema_error');
    expect(
      reshaped.metrics.get('elevation.imagery_sources_refused', ELEVATION_PROVIDER_TERRAIN_TILES),
    ).toBe(1);
    // And it is NOT filed as the accepted missing-header case: the header was there.
    expect(
      reshaped.metrics.get('elevation.imagery_sources_absent', ELEVATION_PROVIDER_TERRAIN_TILES),
    ).toBe(0);

    const separatorsOnly = clientWith({ imagerySources: ',' });
    const second = await separatorsOnly.client.fetchTile(TERRAIN_SAMPLE_ZOOM, 1, 2, deadline);
    expect(second.kind).toBe('schema_error');
  });

  it('turns a malformed body into schema_error rather than letting it escape as our bug', async () => {
    const { client } = clientWith({ body: Uint8Array.from([1, 2, 3, 4]) });
    const outcome = await client.fetchTile(TERRAIN_SAMPLE_ZOOM, 1, 2, deadline);
    expect(outcome.kind).toBe('schema_error');
  });

  it('rejects a non-PNG content type before the decoder ever sees the body', async () => {
    const { client } = clientWith({ contentType: 'text/html' });
    const outcome = await client.fetchTile(TERRAIN_SAMPLE_ZOOM, 1, 2, deadline);
    expect(outcome.kind).toBe('schema_error');
  });

  it('treats a 404 as no_data — an edge-of-coverage tile is not an outage', async () => {
    const { client } = clientWith({ status: 404 });
    const outcome = await client.fetchTile(TERRAIN_SAMPLE_ZOOM, 1, 2, deadline);
    expect(outcome.kind).toBe('no_data');
  });

  it('de-duplicates concurrent fetches of the SAME tile into one request', async () => {
    const { client, metrics, calls } = clientWith({ imagerySources: 'eudem/x.tif' });
    const [a, b, c] = await Promise.all([
      client.fetchTile(TERRAIN_SAMPLE_ZOOM, 7, 7, deadline),
      client.fetchTile(TERRAIN_SAMPLE_ZOOM, 7, 7, deadline),
      client.fetchTile(TERRAIN_SAMPLE_ZOOM, 7, 7, deadline),
    ]);
    expect(calls).toHaveLength(1);
    expect(metrics.get('elevation.tile_joined', ELEVATION_PROVIDER_TERRAIN_TILES)).toBe(2);
    expect(a?.kind).toBe('ok');
    expect(b?.kind).toBe('ok');
    expect(c?.kind).toBe('ok');
  });

  it('does NOT de-duplicate different tiles', async () => {
    const { client, calls } = clientWith({ imagerySources: 'eudem/x.tif' });
    await Promise.all([
      client.fetchTile(TERRAIN_SAMPLE_ZOOM, 7, 7, deadline),
      client.fetchTile(TERRAIN_SAMPLE_ZOOM, 7, 8, deadline),
    ]);
    expect(calls).toHaveLength(2);
  });

  it('releases the in-flight slot, so a second SEQUENTIAL fetch is a real request', async () => {
    // The failure this guards is a settled promise wedged in the map for the process's lifetime —
    // the shape of the breaker-trial leak review #73 found. A cached-forever tile would be
    // indistinguishable from a working cache until the provider corrected a tile.
    const { client, calls } = clientWith({ imagerySources: 'eudem/x.tif' });
    await client.fetchTile(TERRAIN_SAMPLE_ZOOM, 3, 3, deadline);
    await client.fetchTile(TERRAIN_SAMPLE_ZOOM, 3, 3, deadline);
    expect(calls).toHaveLength(2);
  });
});
