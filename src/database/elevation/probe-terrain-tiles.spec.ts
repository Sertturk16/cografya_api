import { afterEach, describe, expect, it } from '@jest/globals';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTerrariumTilePng } from '../../elevation/terrain/terrarium-fixture.builder';
import {
  DECODER_CONTROL_TOLERANCE_M,
  MAX_BODY_BYTES,
  REQUEST_SPACING_MS,
  REQUEST_TIMEOUT_MS,
  politeGet,
  EXPECTED_SAMPLING_ZOOM_FAMILIES,
  evaluateProbeAssertions,
  imagerySourceFamilies,
  percentile,
  runTerrainProbePhase,
  TerrainProbeGateError,
  type TerrainProbeArtifact,
} from './probe-terrain-tiles';

/**
 * Three things this file pins, none of which needs a network call.
 *
 * 1. The **gate logic** — the PASS/FAIL rules that decide whether a run's artifact may be
 *    trusted. Driven directly, with synthetic inputs, including every failing shape.
 * 2. The **pure derivations** the artifact's headline numbers come from.
 * 3. The **committed artifact** itself, asserted against the same invariants — the
 *    `era5-artifact.spec.ts` pattern. This is what stops a future run's regression from being
 *    committed unnoticed: the licence-critical properties are re-checked by CI on every push,
 *    not only by a human reading item 2 of a README.
 *
 * Structural throughout. Nothing here asserts an elevation, a place or a byte count as a fact
 * about the world; the assertions are about SHAPE and about the gates agreeing with themselves.
 */
describe('terrain probe', () => {
  const healthyInput = {
    samplingZoomTileCount: 9,
    samplingZoomSourceTokens: ['eudem', 'gmted'],
    bathymetryByZoom: [
      { zoom: 8, metres: -1491 },
      { zoom: 11, metres: 0 },
      { zoom: 12, metres: 0 },
      { zoom: 13, metres: 0 },
    ],
    points: [
      { label: 'A', specMeasuredM: 904, differenceM: 0 },
      { label: 'B', specMeasuredM: 1647.5, differenceM: 0.5 },
    ],
    attribution: { matchesPin: true },
  };

  function gate(input: Parameters<typeof evaluateProbeAssertions>[0], name: string): boolean {
    const assertion = evaluateProbeAssertions(input).find((entry) => entry.name === name);
    expect(assertion).toBeDefined();
    return assertion?.passed ?? false;
  }

  describe('the assertion gates', () => {
    it('passes every gate on a healthy run', () => {
      const assertions = evaluateProbeAssertions(healthyInput);
      expect(assertions.length).toBeGreaterThan(0);
      for (const assertion of assertions) {
        expect(assertion.passed).toBe(true);
        expect(assertion.detail).not.toBe('');
      }
    });

    it('FAILS when no tile was reached at the sampling zoom', () => {
      // The 403 scenario: every request answered, none with a body we could use. The old code
      // wrote nulls everywhere and exited 0, producing a committable artifact of a run that
      // measured nothing.
      expect(gate({ ...healthyInput, samplingZoomTileCount: 0 }, 'sampling zoom reached')).toBe(
        false,
      );
    });

    it('FAILS when no imagery-source header was seen', () => {
      // An empty token list is indistinguishable in the artifact from "the provider reported
      // no sources" — and it is what a tripwire allow-list would then be built from.
      expect(
        gate({ ...healthyInput, samplingZoomSourceTokens: [] }, 'imagery sources reported'),
      ).toBe(false);
    });

    it('FAILS on etopo1 at the sampling zoom — the licence gate', () => {
      const input = { ...healthyInput, samplingZoomSourceTokens: ['eudem', 'etopo1'] };
      expect(gate(input, 'no etopo1 at the sampling zoom')).toBe(false);
      // It must also trip the general family gate, so a reader who only scans that one still
      // sees a failure.
      expect(gate(input, 'no unexpected source family at the sampling zoom')).toBe(false);
    });

    it('FAILS on any family outside the expected set', () => {
      expect(
        gate(
          { ...healthyInput, samplingZoomSourceTokens: ['eudem', 'mystery'] },
          'no unexpected source family at the sampling zoom',
        ),
      ).toBe(false);
    });

    it('accepts every family the published attribution lines cover', () => {
      // The allow-list is not "whatever this run saw" — it is the set the two notices we
      // publish actually credit. Seeing SRTM on a Turkish tile is not drift.
      expect(
        gate(
          { ...healthyInput, samplingZoomSourceTokens: [...EXPECTED_SAMPLING_ZOOM_FAMILIES] },
          'no unexpected source family at the sampling zoom',
        ),
      ).toBe(true);
      expect(EXPECTED_SAMPLING_ZOOM_FAMILIES).not.toContain('etopo1');
    });

    it('FAILS when sea depth appears above z10 — the other half of the licence argument', () => {
      expect(
        gate(
          {
            ...healthyInput,
            bathymetryByZoom: [
              { zoom: 11, metres: -1200 },
              { zoom: 12, metres: 0 },
            ],
          },
          'no sea depth above z10',
        ),
      ).toBe(false);
    });

    it('FAILS the bathymetry gate when the sweep produced nothing', () => {
      // Vacuity guard: "no depth found" must not pass because nothing was measured.
      expect(gate({ ...healthyInput, bathymetryByZoom: [] }, 'no sea depth above z10')).toBe(false);
    });

    it('FAILS when the sweep covers only the zooms BELOW the threshold', () => {
      // The guard counts the population the gate is about. Counting total rows instead let a
      // sweep narrowed to z8-z10 pass while printing a sentence about z >= 11 samples that
      // were never taken — clean and wrong (review #122, CR122R2-M3).
      expect(
        gate(
          {
            ...healthyInput,
            bathymetryByZoom: [
              { zoom: 8, metres: -1491 },
              { zoom: 9, metres: -1493 },
              { zoom: 10, metres: -1490 },
            ],
          },
          'no sea depth above z10',
        ),
      ).toBe(false);
    });

    it('does not call an unmeasured z11 sample "depth present"', () => {
      // A failed fetch and a measured depth are different facts. Collapsing them made a
      // transient 5xx print the licence-critical claim, which is the false alarm that trains
      // an operator to discount a hard stop (review #122, CR122R2-M4 / TA122R2-M4).
      const assertion = evaluateProbeAssertions({
        ...healthyInput,
        bathymetryByZoom: [{ zoom: 11, metres: null }],
      }).find((entry) => entry.name === 'no sea depth above z10');

      expect(assertion?.passed).toBe(false);
      expect(assertion?.detail).toMatch(/NOT MEASURED/);
      expect(assertion?.detail).not.toMatch(/depth present/);
    });

    it('FAILS when the decoder drifts from the independent measurement', () => {
      const name = 'decoder agrees with the independent measurement';
      expect(
        gate(
          {
            ...healthyInput,
            points: [{ label: 'A', specMeasuredM: 904, differenceM: 40 }],
          },
          name,
        ),
      ).toBe(false);
      // A control point that produced no residual is a failure too, not a pass by absence.
      expect(
        gate(
          { ...healthyInput, points: [{ label: 'A', specMeasuredM: 904, differenceM: null }] },
          name,
        ),
      ).toBe(false);
      // …and so is having no control point at all.
      expect(gate({ ...healthyInput, points: [] }, name)).toBe(false);
    });

    it('holds the decoder tolerance at the stated band', () => {
      const name = 'decoder agrees with the independent measurement';
      const within = DECODER_CONTROL_TOLERANCE_M - 0.001;
      const beyond = DECODER_CONTROL_TOLERANCE_M + 0.001;
      expect(
        gate(
          { ...healthyInput, points: [{ label: 'A', specMeasuredM: 1, differenceM: within }] },
          name,
        ),
      ).toBe(true);
      expect(
        gate(
          { ...healthyInput, points: [{ label: 'A', specMeasuredM: 1, differenceM: beyond }] },
          name,
        ),
      ).toBe(false);
    });

    it('separates "could not fetch the licence document" from "the licence changed"', () => {
      const name = 'attribution document matches the pinned hash';
      // Both fail the gate — but the DETAIL must not call an unreadable document a change,
      // because that is the false alarm that trains an operator to ignore a hard stop.
      const unreadable = evaluateProbeAssertions({ ...healthyInput, attribution: null }).find(
        (entry) => entry.name === name,
      );
      const changed = evaluateProbeAssertions({
        ...healthyInput,
        attribution: { matchesPin: false },
      }).find((entry) => entry.name === name);

      expect(unreadable?.passed).toBe(false);
      expect(changed?.passed).toBe(false);
      expect(unreadable?.detail).toMatch(/could not be read/);
      expect(changed?.detail).toMatch(/DIFFERS/);
    });
  });

  describe('the politeness contract', () => {
    // Driven against a FAKE fetch, so the contract `ENGINEERING.md` §5 states for every
    // probe — "polite by construction (serial, spaced, timed out, identifying UA)" — is pinned
    // rather than described. Precedent: `probe-earthquake-afad.spec.ts`.
    const realFetch = globalThis.fetch;

    function stubFetch(handler: () => Response): RequestInit[] {
      const seen: RequestInit[] = [];
      globalThis.fetch = (_input: unknown, init?: RequestInit): Promise<Response> => {
        seen.push(init ?? {});
        return Promise.resolve(handler());
      };
      return seen;
    }

    afterEach(() => {
      globalThis.fetch = realFetch;
    });

    it('identifies itself, refuses redirects and bounds the call', async () => {
      const seen = stubFetch(() => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
      await politeGet('https://example.test/tile.png');

      const init = seen[0];
      expect(init).toBeDefined();
      expect((init?.headers as Record<string, string> | undefined)?.['User-Agent']).toBe(
        'CografyaPlatformBot/1.0 (educational geography platform)',
      );
      // A redirect is how a hijacked route picks the host we talk to; the probe refuses rather
      // than follows.
      expect(init?.redirect).toBe('error');
      // A signal must be present — without it a stalled socket hangs the run forever.
      expect(init?.signal).toBeDefined();
      expect(REQUEST_TIMEOUT_MS).toBe(30_000);
    });

    it('measures transfer time WITHOUT the politeness sleep', async () => {
      // The defect this replaced: `elapsedMs` was computed after the 400 ms gap, so every
      // published latency carried a fixed offset and PR-E2 would size a deadline off a median
      // 2.7× too large (review #122, CODE122-I2).
      stubFetch(() => new Response(new Uint8Array([1]), { status: 200 }));
      const result = await politeGet('https://example.test/tile.png');
      expect(result.elapsedMs).toBeLessThan(REQUEST_SPACING_MS);
    });

    it('waits the spacing gap even when the request FAILS', async () => {
      // Politeness "by construction" cannot mean "while nothing goes wrong": a failing provider
      // is exactly when back-to-back retries hurt (review #122, CODE122-M2 / SFH122-M3).
      globalThis.fetch = (): Promise<Response> => Promise.reject(new Error('connection reset'));
      const startedAt = Date.now();
      await expect(politeGet('https://example.test/tile.png')).rejects.toThrow('connection reset');
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(REQUEST_SPACING_MS - 25);
    });

    it('refuses an over-cap body on the DECLARED length, before materialising it', async () => {
      stubFetch(
        () =>
          new Response(new Uint8Array([1]), {
            status: 200,
            headers: { 'content-length': String(MAX_BODY_BYTES + 1) },
          }),
      );
      await expect(politeGet('https://example.test/huge.png')).rejects.toThrow(
        /over the probe cap/,
      );
    });
  });

  describe('the runner refuses a run that failed its gates', () => {
    // The contract nothing pinned before: `runTerrainProbePhase` is the exported function every
    // programmatic caller uses, and it used to RESOLVE NORMALLY for a run that failed all seven
    // gates — the exit code lived only inside the un-exported `main()`, behind
    // `require.main === module`, where no spec can reach it (review #122, CR122R2-M2 /
    // TA122R2-M5).
    //
    // Driven end to end against a fake provider, because that is the only way to prove the
    // WRITE-then-REFUSE order: the artifact must exist for diagnosis, and the promise must
    // still reject. The run makes ~16 spaced requests, hence the raised timeout.
    const realFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = realFetch;
    });

    it('writes the artifact and THEN rejects, so no caller can read a failed run as evidence', async () => {
      // A structurally valid tile carrying a flat elevation: every geometry refusal passes,
      // so the run completes — and the decoder control then fails, because a flat tile does
      // not match the independently measured control points.
      const tile = buildTerrariumTilePng(() => 0);
      globalThis.fetch = (): Promise<Response> =>
        // `slice()` yields a fresh, plain ArrayBuffer-backed view, which is what `Response`
        // accepts as a body; the builder's view is not assignable to `BodyInit` directly.
        Promise.resolve(new Response(tile.slice().buffer, { status: 200 }));

      const outputPath = join(mkdtempSync(join(tmpdir(), 'terrain-probe-')), 'probe.json');

      await expect(runTerrainProbePhase({ outputPath })).rejects.toThrow(TerrainProbeGateError);

      // The evidence is on disk anyway — a failed run's artifact is what a human diagnoses
      // from — and it records the failure rather than hiding it.
      const written = JSON.parse(readFileSync(outputPath, 'utf8')) as TerrainProbeArtifact;
      expect(written.assertions.some((assertion) => !assertion.passed)).toBe(true);
    }, 30_000);
  });

  describe('the pure derivations', () => {
    it('splits a source header into families, ignoring the file names', () => {
      expect(
        imagerySourceFamilies('eudem/eudem_dem_5deg_n35e035.tif, gmted/30N030E_mea075.tif'),
      ).toEqual(['eudem', 'gmted']);
    });

    it('keeps a repeated family once per entry and ignores empty entries', () => {
      // The caller de-duplicates through a Set; this function's job is to report what the
      // header said, so a dropped family here would silently shrink the allow-list.
      expect(imagerySourceFamilies('srtm/a.tif, srtm/b.tif')).toEqual(['srtm', 'srtm']);
      expect(imagerySourceFamilies('')).toEqual([]);
      expect(imagerySourceFamilies(' , eudem/a.tif , ')).toEqual(['eudem']);
    });

    it('surfaces an entry it cannot parse instead of dropping it', () => {
      // If the provider ever switched to absolute paths, every prefix would be empty and the
      // old parser returned NOTHING — so `no etopo1 at the sampling zoom` would have passed
      // with nothing left to object to. An unparseable entry has to reach the gates and trip
      // them (review #122, CR122R2-M5).
      const families = imagerySourceFamilies('/etopo1/ETOPO1_Bed_g.tif, /eudem/a.tif');
      expect(families).toEqual(['/etopo1/ETOPO1_Bed_g.tif', '/eudem/a.tif']);
      expect(
        gate(
          { ...healthyInput, samplingZoomSourceTokens: families },
          'no unexpected source family at the sampling zoom',
        ),
      ).toBe(false);
    });

    it('reports percentiles from a sorted series without stepping off either end', () => {
      const sorted = [10, 20, 30, 40, 50];
      expect(percentile(sorted, 0)).toBe(10);
      expect(percentile(sorted, 0.5)).toBe(30);
      expect(percentile(sorted, 1)).toBe(50);
      expect(percentile([], 0.5)).toBe(0);
      expect(percentile([7], 0.95)).toBe(7);
    });
  });

  describe('the committed artifact', () => {
    // Resolved from the MODULE, not from `process.cwd()` — the `era5-artifact.spec.ts:23`
    // pattern this block cites. `test/jest-unit.json` sets `rootDir: ".."`, which fixes module
    // resolution and says nothing about the working directory, so a cwd-relative path makes
    // these licence-critical invariants vanish under any invocation from elsewhere
    // (review #122, CR122R2-M9 / TA122R2-M6).
    const artifact = JSON.parse(
      readFileSync(
        join(__dirname, '..', '..', '..', 'data', 'elevation', 'terrain-tiles-probe.json'),
        'utf8',
      ),
    ) as TerrainProbeArtifact;

    it('records a run that actually reached the sampling zoom', () => {
      expect(artifact.zoom).toBe(12);
      expect(artifact.tiles.filter((tile) => tile.httpStatus === 200).length).toBeGreaterThan(0);
      expect(artifact.requestCount).toBeGreaterThan(0);
      // Bounded: this probe makes a few dozen requests, and a committed artifact recording
      // hundreds would mean the politeness contract changed without anyone saying so.
      expect(artifact.requestCount).toBeLessThan(100);
    });

    it('carries no etopo1 in the allow-list candidate, and every family is expected', () => {
      expect(artifact.samplingZoomSourceTokens).not.toContain('etopo1');
      expect(artifact.samplingZoomSourceTokens.length).toBeGreaterThan(0);
      for (const family of artifact.samplingZoomSourceTokens) {
        expect(EXPECTED_SAMPLING_ZOOM_FAMILIES).toContain(family);
      }
    });

    it('keeps the per-zoom split, which is what makes the flat list safe to publish', () => {
      // The flat list DOES contain etopo1 by design. That is only harmless while the per-zoom
      // row exists to be read instead.
      expect(Object.keys(artifact.imagerySourceTokensByZoom)).toContain('12');
      expect(artifact.imagerySourceTokensByZoom['12']).toEqual(artifact.samplingZoomSourceTokens);
    });

    it('shows sea reading exactly zero above z10', () => {
      const above = artifact.bathymetryByZoom.filter((row) => row.zoom >= 11);
      expect(above.length).toBeGreaterThan(0);
      for (const row of above) {
        expect(row.metres).toBe(0);
      }
    });

    it('never stores an error message in the imagery-source field', () => {
      for (const row of artifact.bathymetryByZoom) {
        expect(row.imagerySources ?? '').not.toMatch(/^ERROR/);
      }
    });

    it('records the licence document as unchanged', () => {
      expect(artifact.attribution).not.toBeNull();
      expect(artifact.attribution?.matchesPin).toBe(true);
    });

    it('passes every gate it recorded', () => {
      expect(artifact.assertions.length).toBeGreaterThan(0);
      for (const assertion of artifact.assertions) {
        expect(assertion.passed).toBe(true);
      }
    });

    it('carries no key material', () => {
      // The bucket is anonymous, so there is nothing to leak — which is exactly why this is
      // cheap to assert and worth asserting: the day a keyed source is added, this fails.
      const raw = JSON.stringify(artifact);
      expect(raw).not.toMatch(/aws_access_key|x-amz-security-token|Authorization|api[_-]?key/i);
    });

    it('measures latency without the politeness sleep folded in', () => {
      // A structural check on the MEASUREMENT, not on the network: a distribution whose
      // minimum sits above one spacing gap means the sleep is inside the timing again — the
      // defect this artifact was re-run to correct (review #122, CODE122-I2). The threshold is
      // the SYMBOL, so retuning the gap cannot silently void the check (TA122R2-M3).
      const stats = artifact.samplingZoomLatencyStats;
      expect(stats).not.toBeNull();
      expect(stats?.minMs ?? Number.POSITIVE_INFINITY).toBeLessThan(REQUEST_SPACING_MS);
    });
  });
});
