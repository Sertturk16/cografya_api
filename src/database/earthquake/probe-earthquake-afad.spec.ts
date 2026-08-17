import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { parseAfadEvent } from '../../earthquake/afad/afad-event.parse';
import type { AfadProbeArtifact } from './earthquake-artifact.types';

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
