import { describe, expect, it } from '@jest/globals';
import { publishedGridCellSizeDeg } from './acag-load';

/**
 * `publishedGridCellSizeDeg` is the whole of CODE123-M1's fix and sits on the publish boundary,
 * so it gets its own pins (review CODE123R2-M4). Without them the rounding could be deleted with
 * every other test still green — the e2e asserts the field's PRESENCE, never its precision.
 */
describe('publishedGridCellSizeDeg', () => {
  it('rounds the measured float32 step to the precision the contract publishes', () => {
    // The real measured latitude step from the committed manifest.
    expect(publishedGridCellSizeDeg(0.009998321533203125)).toBe(0.009998);
    // …and the real longitude step, which differs from it before rounding and after.
    expect(publishedGridCellSizeDeg(0.010000228881835938)).toBe(0.01);
  });

  it('does not silently become the provider NOMINAL value', () => {
    // The point of the rounding is a documented precision, not a swap to the advertised 0.01°.
    expect(publishedGridCellSizeDeg(0.009998321533203125)).not.toBe(0.01);
  });

  it('is idempotent, so a re-load cannot drift the stored document', () => {
    const once = publishedGridCellSizeDeg(0.009998321533203125);
    expect(publishedGridCellSizeDeg(once)).toBe(once);
  });

  it('keeps a value that is already at the published precision', () => {
    expect(publishedGridCellSizeDeg(0.01)).toBe(0.01);
    expect(publishedGridCellSizeDeg(0.1)).toBe(0.1);
  });
});
