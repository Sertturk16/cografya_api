import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from '@jest/globals';
import { parseAfadEvent } from '../../earthquake/afad/afad-event.parse';
import type { AfadProbeArtifact } from './earthquake-artifact.types';
import { runEarthquakeProbePhase } from './probe-earthquake-afad';

/**
 * The schema test: this leg's parser, run against the COMMITTED evidence of what AFAD really
 * returned — never against the live endpoint.
 *
 * That is the two-phase rule doing its job (`ENGINEERING.md` §5): CI must not be able to fail
 * because a public institution's endpoint is down, and the artifact must not be able to drift away
 * from the parser without somebody noticing.
 *
 * **It asserts SHAPE, never facts.** Nothing here claims an earthquake had a magnitude or happened
 * anywhere; the assertions are about field presence, parseability and the invariants the ingest
 * depends on (`CONVENTIONS.md` §2).
 */

const ARTIFACT = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'data', 'earthquake', 'afad-probe.json'), 'utf8'),
) as AfadProbeArtifact;

/** Every field the parser reads. A field vanishing upstream must fail HERE, loudly. */
const REQUIRED_FIELDS = [
  'eventID',
  'date',
  'latitude',
  'longitude',
  'depth',
  'magnitude',
  'type',
  'country',
  'province',
  'district',
  'location',
  'isEventUpdate',
  'lastUpdateDate',
] as const;

describe('the committed AFAD probe artifact', () => {
  it('records a bounded, polite run', () => {
    // The politeness envelope Atlas authorised is part of the evidence, not a promise made in
    // prose: at most four requests, at least three seconds apart, with an identifying UA.
    expect(ARTIFACT.requests.length).toBeGreaterThan(0);
    expect(ARTIFACT.requests.length).toBeLessThanOrEqual(4);
    expect(ARTIFACT.spacingSeconds).toBeGreaterThanOrEqual(3);
    expect(ARTIFACT.userAgent).toContain('CografyaPlatformBot');
  });

  it('carries no credential — this endpoint is anonymous and must stay that way', () => {
    const serialised = JSON.stringify(ARTIFACT);
    expect(serialised).not.toMatch(/api[_-]?key/i);
    expect(serialised).not.toMatch(/authorization/i);
  });

  it('answered every request with JSON rows', () => {
    for (const request of ARTIFACT.requests) {
      expect(request.httpStatus).toBe(200);
      expect(request.headers['content-type']).toContain('application/json');
      expect(request.recordCount).not.toBeNull();
    }
  });

  it('still carries every field the parser reads', () => {
    for (const request of ARTIFACT.requests) {
      if ((request.recordCount ?? 0) === 0) continue;
      for (const field of REQUIRED_FIELDS) expect(request.fieldNames).toContain(field);
    }
  });

  it('shows the provider sending NO caching headers — so the cache is entirely ours', () => {
    for (const request of ARTIFACT.requests) {
      expect(request.headers['cache-control']).toBeNull();
      expect(request.headers.etag).toBeNull();
    }
  });

  it('parses every sample row the provider actually sent', () => {
    let parsed = 0;
    for (const request of ARTIFACT.requests) {
      for (const row of request.sampleRows) {
        const outcome = parseAfadEvent(row);
        if (outcome.kind !== 'ok') {
          throw new Error(`the committed sample no longer parses: ${outcome.rejection.reason}`);
        }
        parsed += 1;
      }
    }
    // The control: the loop really did run. A sample-less artifact would otherwise pass this test
    // by having nothing to check.
    expect(parsed).toBeGreaterThan(0);
  });

  it('records that the parser accepted what it was shown, with the refusals it made', () => {
    for (const request of ARTIFACT.requests) {
      expect(request.parsed.accepted + request.parsed.rejected).toBe(request.recordCount ?? 0);
    }
  });

  it('observed only magnitude types our vocabulary can express', () => {
    // `other` is part of the contract precisely so an unseen type cannot darken the page, so this
    // is not a gate on the provider's vocabulary — it is a record of what was seen, and a nudge to
    // look when the set grows.
    for (const request of ARTIFACT.requests) {
      for (const type of request.magnitudeTypes) {
        expect(typeof type).toBe('string');
        expect(type.length).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * The probe run itself, faked end to end.
 *
 * The artifact above is evidence of the LAST run, so it can only report an impolite probe after the
 * impolite probe has already happened. Changing `plan` to six steps or dropping `SPACING_MS` left
 * every test green until somebody re-ran the tool against a public institution's endpoint (review
 * #118 TA118-M1). These cases drive the injection seams the file already carries and assert the
 * envelope Atlas authorised — at most four requests, serial, spaced, timed out, identifying UA,
 * `redirect: 'error'` (`DEC 2026-08-17k` md.2) — before any of it reaches the network.
 */
describe('runEarthquakeProbePhase, faked end-to-end', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'eq-probe-spec-'));

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  const SAMPLE_ROW = {
    eventID: '635298',
    date: '2026-08-11T11:03:34',
    latitude: '38.05222',
    longitude: '36.63111',
    depth: '6.95',
    magnitude: '1.8',
    type: 'ML',
    country: 'Türkiye',
    province: 'Kahramanmaraş',
    district: 'Göksun',
    location: 'Göksun (Kahramanmaraş)',
    isEventUpdate: false,
    lastUpdateDate: null,
  };

  interface Capture {
    readonly urls: string[];
    readonly init: RequestInit[];
    readonly sleeps: number[];
  }

  async function runFake(
    respond: (url: string) => Response,
    artifactName: string,
  ): Promise<{ artifact: AfadProbeArtifact; capture: Capture }> {
    const capture: Capture = { urls: [], init: [], sleeps: [] };
    const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      capture.urls.push(url);
      if (init !== undefined) capture.init.push(init);
      return Promise.resolve(respond(url));
    }) as typeof fetch;

    const artifact = await runEarthquakeProbePhase({
      baseUrl: 'https://example.invalid/apiv2/',
      artifactPath: join(workDir, artifactName),
      fetchImpl,
      sleepImpl: (ms: number) => {
        capture.sleeps.push(ms);
        return Promise.resolve();
      },
      now: () => Date.UTC(2026, 7, 11, 12, 0, 0),
    });
    return { artifact, capture };
  }

  const okJson = (rows: unknown[]): Response =>
    new Response(JSON.stringify(rows), {
      status: 200,
      headers: { 'content-type': 'application/json;charset=utf-8' },
    });

  it('makes exactly four serial requests, spaced by at least three seconds', async () => {
    const { artifact, capture } = await runFake(() => okJson([SAMPLE_ROW]), 'polite.json');

    expect(capture.urls).toHaveLength(4);
    expect(artifact.requests).toHaveLength(4);
    // Three gaps for four calls: the spacing is BETWEEN them, so a fifth request would need a
    // fourth gap — this is also the assertion that catches a fifth step being added.
    expect(capture.sleeps).toHaveLength(3);
    for (const gap of capture.sleeps) expect(gap).toBeGreaterThanOrEqual(3_000);
    expect(artifact.spacingSeconds).toBeGreaterThanOrEqual(3);
  });

  it('identifies itself, refuses redirects and carries a timeout on every call', async () => {
    const { capture } = await runFake(() => okJson([SAMPLE_ROW]), 'headers.json');

    expect(capture.init).toHaveLength(4);
    for (const init of capture.init) {
      const headers = init.headers as Record<string, string>;
      expect(headers['User-Agent']).toContain('CografyaPlatformBot');
      // A redirect is the one way a peer chooses which host this process talks to.
      expect(init.redirect).toBe('error');
      expect(init.signal).toBeDefined();
    }
  });

  it('asks the third request for the small limit that proves limit precedes orderby', async () => {
    const { capture } = await runFake(() => okJson([SAMPLE_ROW]), 'limit.json');

    expect(capture.urls[2]).toContain('limit=3');
    expect(capture.urls[0]).toContain('limit=20000');
    expect(capture.urls[3]).toContain('minmag=7');
    // The trailing slash on the base URL must not survive into a double slash.
    for (const url of capture.urls) {
      expect(url.startsWith('https://example.invalid/apiv2/e')).toBe(true);
    }
  });

  it('records a non-2xx answer with its status instead of inventing rows', async () => {
    const { artifact } = await runFake(
      () => new Response('<html>gateway</html>', { status: 502 }),
      'failed.json',
    );

    expect(artifact.requests.map((request) => request.httpStatus)).toEqual([502, 502, 502, 502]);
    // `recordCount: null` is what the CLI's own refusal keys on — an artifact of four failures is
    // not evidence, and the command must not exit 0 over it (review #118 SFH118-M3).
    for (const request of artifact.requests) expect(request.recordCount).toBeNull();
  });

  it('refuses a response above the byte cap rather than buffering it', async () => {
    // The cap the sibling probes were already required to reuse (review #75) and this one had
    // dropped (review #118 SEC118-M2). A declared `Content-Length` over the ceiling is refused
    // before the body is read at all.
    const oversized = (): Response =>
      new Response('[]', {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-length': String(64 * 1024 * 1024),
        },
      });

    await expect(runFake(oversized, 'oversized.json')).rejects.toThrow(/cap/i);
  });

  it('writes the artifact where it was told, with the run’s own evidence in it', async () => {
    const { artifact } = await runFake(() => okJson([SAMPLE_ROW]), 'written.json');
    const onDisk = JSON.parse(
      readFileSync(join(workDir, 'written.json'), 'utf8'),
    ) as AfadProbeArtifact;

    expect(onDisk.requests).toHaveLength(4);
    expect(onDisk.userAgent).toBe(artifact.userAgent);
    expect(onDisk.requests[0]?.parsed.accepted).toBe(1);
    expect(onDisk.requests[0]?.sampleRows).toHaveLength(1);
  });
});
