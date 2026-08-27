import { describe, expect, it } from '@jest/globals';
import {
  resolveMaxAllowedPosition,
  VIDEO_PROGRESS_MAX_POSITION_SECONDS,
} from './video-progress-duration';

describe('resolveMaxAllowedPosition', () => {
  it('returns the real duration when a snapshot exists', () => {
    expect(resolveMaxAllowedPosition(368)).toBe(368);
  });

  it('returns the flat fallback ceiling when the duration is unknown (null)', () => {
    expect(resolveMaxAllowedPosition(null)).toBe(VIDEO_PROGRESS_MAX_POSITION_SECONDS);
  });

  it('returns the real duration even when it exceeds the fallback ceiling', () => {
    const longer = VIDEO_PROGRESS_MAX_POSITION_SECONDS + 1;
    expect(resolveMaxAllowedPosition(longer)).toBe(longer);
  });

  it('returns zero for a zero-duration snapshot rather than falling back — nullish, not falsy', () => {
    // The defect this pins: `snapshotDurationSeconds || FALLBACK` would treat 0 as "missing" and
    // silently widen the ceiling to 21 600 s. `??` must not make that mistake.
    expect(resolveMaxAllowedPosition(0)).toBe(0);
  });
});
