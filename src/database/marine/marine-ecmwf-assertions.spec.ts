import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MarineImportError } from './marine-assertions';
import type { MarineEcmwfProbeArtifact } from './marine-ecmwf-artifact.types';
import {
  assertEcmwfProbeArtifactIsSound,
  collectEcmwfProbeFailures,
  evaluateEcmwfProbeAssertions,
} from './marine-ecmwf-assertions';
import { candidateCycles } from './probe-marine-ecmwf';

/**
 * The committed ECMWF probe artifact must stay SOUND — and must stay sound against the code as it
 * is today, not as it was on the day it was written.
 *
 * That is the whole reason these checks are pure and re-derived: the artifact records where 30
 * coordinates landed on the grid and what the wind derivation made of the components it found
 * there. Change the axis, the rounding, or the sign convention, and the committed evidence stops
 * agreeing with the code — which is the earliest and cheapest place for that disagreement to
 * surface. The alternative is a file that quietly becomes a museum piece.
 */

const ARTIFACT_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'data',
  'marine',
  'marine-ecmwf-probe.json',
);

function loadArtifact(): MarineEcmwfProbeArtifact {
  return JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8')) as MarineEcmwfProbeArtifact;
}

/** A deep copy, so a mutation test cannot leak into the next one. */
function clone(artifact: MarineEcmwfProbeArtifact): MarineEcmwfProbeArtifact {
  return JSON.parse(JSON.stringify(artifact)) as MarineEcmwfProbeArtifact;
}

describe('the committed marine-ecmwf-probe.json', () => {
  it('passes every assertion, re-derived from its own evidence', () => {
    expect(collectEcmwfProbeFailures(loadArtifact())).toEqual([]);
    expect(() => {
      assertEcmwfProbeArtifactIsSound(loadArtifact());
    }).not.toThrow();
  });

  it('records a real cycle, a real decoder and a real download', () => {
    const artifact = loadArtifact();

    expect(Number.isNaN(Date.parse(artifact.cycleUtc))).toBe(false);
    // 00/06/12/18 UTC — a cycle hour ECMWF actually publishes.
    expect(new Date(artifact.cycleUtc).getUTCHours() % 6).toBe(0);
    expect(artifact.decoder.package).toBe('@mattnucc/gribberish');
    expect(artifact.totals.downloadedBytes).toBeGreaterThan(1_000_000);
    // Five requests: two sidecar indexes plus three byte ranges — the wave pair merges, the wind
    // pair never does.
    expect(artifact.totals.requestCount).toBe(5);
    expect(artifact.messages.length).toBe(4);
    expect(artifact.points.length).toBe(30);
  });

  it('quotes the provider on the wave-direction convention', () => {
    // A reversed arrow is this leg's most dangerous failure, and "we read the docs once" is not
    // evidence. The quote is committed so a reviewer can check it against the source.
    const artifact = loadArtifact();

    expect(artifact.directionConvention.source).toContain('codes.ecmwf.int');
    expect(artifact.directionConvention.quote.toLowerCase()).toContain('coming from the north');
  });

  it('records the packing that the whole fail-closed policy is pinned to', () => {
    for (const message of loadArtifact().messages) {
      expect(message.dataRepresentationTemplate).toBe(42);
      expect(message.packingLabel).toBe('grid_ccsds');
      // Read back out of every message: the axis is the one field whose drift is invisible.
      expect(message.firstLongitude).toBe(180);
      expect(message.scanningMode).toBe(0);
    }
  });
});

describe('evaluateEcmwfProbeAssertions — the gates actually bite', () => {
  it('fails when a recorded grid cell is not what the mapping produces today', () => {
    const artifact = clone(loadArtifact());
    const point = artifact.points[0];
    expect(point).toBeDefined();
    if (point === undefined) return;
    // A 720-column shift is exactly what an axis assumed to start at 0° would produce.
    point.gridIndex += 720;

    const failures = collectEcmwfProbeFailures(artifact);
    expect(failures.join(' ')).toContain('g1-grid-mapping-reproducible');
  });

  it('fails when an in-cell offset exceeds half a cell diagonal', () => {
    const artifact = clone(loadArtifact());
    const point = artifact.points[0];
    expect(point).toBeDefined();
    if (point === undefined) return;
    point.distanceKm = point.thresholdKm + 1;

    expect(collectEcmwfProbeFailures(artifact).join(' ')).toContain('g2-grid-threshold');
  });

  it('fails when the wind derivation no longer reproduces the recorded bearing', () => {
    const artifact = clone(loadArtifact());
    const point = artifact.points.find((candidate) => candidate.derived.windDirection10m !== null);
    expect(point).toBeDefined();
    if (point === undefined || point.derived.windDirection10m === null) return;
    // A flipped convention: exactly 180° away, and a perfectly ordinary bearing on its own.
    point.derived.windDirection10m = (point.derived.windDirection10m + 180) % 360;

    expect(collectEcmwfProbeFailures(artifact).join(' ')).toContain(
      'g6-wind-derivation-reproducible',
    );
  });

  it('fails when the decoded finite count disagrees with section 5', () => {
    const artifact = clone(loadArtifact());
    const message = artifact.messages.find((candidate) => candidate.bitmapPresent);
    expect(message).toBeDefined();
    if (message === undefined) return;
    // What a decoder that ignored the land mask would record.
    message.finiteValues = message.numberOfDataPoints;

    expect(collectEcmwfProbeFailures(artifact).join(' ')).toContain('g5-bitmap-applied');
  });

  it('fails when the observation matrix disagrees with the values beside it', () => {
    const artifact = clone(loadArtifact());
    const point = artifact.points[0];
    expect(point).toBeDefined();
    if (point === undefined) return;
    point.observed.swh = 'missing';

    expect(collectEcmwfProbeFailures(artifact).join(' ')).toContain('g7-observation-matrix');
  });

  it('fails when the artifact no longer describes the candidate table', () => {
    const artifact = clone(loadArtifact());
    artifact.points = artifact.points.slice(0, 29);

    expect(collectEcmwfProbeFailures(artifact).join(' ')).toContain('g0-candidates-current');
  });

  it('refuses a hand-edited verdict even when the evidence would pass', () => {
    const artifact = clone(loadArtifact());
    const recorded = artifact.assertions.find((result) => result.id === 'g2-grid-threshold');
    expect(recorded).toBeDefined();
    if (recorded === undefined) return;
    // The file claims a failure its own evidence does not support. A file cannot corroborate
    // itself, so the mismatch is the finding — in either direction.
    recorded.passed = false;

    expect(() => {
      assertEcmwfProbeArtifactIsSound(artifact);
    }).toThrow(MarineImportError);
  });

  it('returns a stable, complete verdict list', () => {
    const ids = evaluateEcmwfProbeAssertions(loadArtifact()).map((result) => result.id);

    expect(ids).toEqual([
      'g0-candidates-current',
      'g1-grid-mapping-reproducible',
      'g2-grid-threshold',
      'g3-parameters-complete',
      'g4-message-envelopes',
      'g5-bitmap-applied',
      'g6-wind-derivation-reproducible',
      'g7-observation-matrix',
      'g8-transport',
    ]);
  });
});

describe('candidateCycles', () => {
  it('walks back from the newest cycle that could plausibly be published', () => {
    // ECMWF publishes 7–9 h after the cycle hour, so at 20:00 UTC the newest candidate is the
    // 06z run — NOT 12z, which may still be uploading.
    const cycles = candidateCycles(new Date('2026-07-31T20:00:00.000Z'));

    expect(cycles.map((cycle) => cycle.toISOString())).toEqual([
      '2026-07-31T06:00:00.000Z',
      '2026-07-31T00:00:00.000Z',
      '2026-07-30T18:00:00.000Z',
    ]);
  });

  it('only ever proposes 00/06/12/18 UTC, across a full day of clock positions', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      for (const cycle of candidateCycles(new Date(Date.UTC(2026, 6, 31, hour, 37)))) {
        expect(cycle.getUTCHours() % 6).toBe(0);
        expect(cycle.getUTCMinutes()).toBe(0);
        // Never proposes a cycle from the future, and never one the provider cannot have
        // finished publishing.
        expect(cycle.getTime()).toBeLessThanOrEqual(
          Date.UTC(2026, 6, 31, hour, 37) - 9 * 3_600_000,
        );
      }
    }
  });
});
