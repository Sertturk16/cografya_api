import { describe, expect, it } from '@jest/globals';
import { buildVideoCoverPath, VIDEO_COVER_ROUTE_SEGMENT } from './video-cover-address';

/**
 * Pins `buildVideoCoverPath`'s exact output SHAPE, so a future edit to the address format is a
 * visible, deliberate diff rather than a silent one (plan §5.8) — the same discipline `VAL137-C1`'s
 * own root cause names: searching for a shape, not merely trusting a function exists.
 */
describe('buildVideoCoverPath', () => {
  it('publishes the global /api prefix, the route segment and the raw bookVideoId, in that order', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(buildVideoCoverPath(id)).toBe(`/api/${VIDEO_COVER_ROUTE_SEGMENT}/${id}`);
  });

  it('the route segment is the literal "video-cover"', () => {
    // Asserted as a literal, not only via the constant, so a change to the constant's OWN value is
    // still a visible diff here — the constant alone could be edited without this test noticing
    // otherwise.
    expect(VIDEO_COVER_ROUTE_SEGMENT).toBe('video-cover');
  });

  it('carries no trace of a YouTube-shaped address, for any id', () => {
    const id = '22222222-2222-4222-8222-222222222222';
    const path = buildVideoCoverPath(id);
    expect(path).not.toMatch(/ytimg|youtube/i);
  });

  it('is a pure function: the same id always produces the same address', () => {
    const id = '33333333-3333-4333-8333-333333333333';
    expect(buildVideoCoverPath(id)).toBe(buildVideoCoverPath(id));
  });
});
