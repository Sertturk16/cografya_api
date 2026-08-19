import { TILE_SIZE } from './tile-math';

/**
 * Bilinear sampling of one decoded tile grid.
 *
 * ## Why bilinear rather than nearest-neighbour
 * Nearest-neighbour produces a staircase, and on a cross-section chart a staircase reads as
 * a claim about the terrain rather than as an artefact of sampling — SPEC §7.4 rules it out
 * for exactly that reason. The weighted average of the four surrounding cells costs three
 * extra multiplications and removes the artefact.
 *
 * ## The edge rule, and why it is CLAMPING rather than reaching into the neighbour tile
 * A sample less than one cell from a tile's edge would need a column that lives in the
 * adjacent tile. Two designs were possible and the choice is deliberate:
 *
 * - *Reach across*: fetch the neighbour when a sample lands in that band. It is more
 *   accurate and it makes the answer DEPEND ON CACHE STATE — the same line would return
 *   slightly different elevations depending on which tiles happened to be resident, and a
 *   cached profile would disagree with a freshly computed one. Nondeterminism inside a
 *   cached, publicly addressable read is a defect that surfaces as "the number changed and
 *   nobody deployed anything".
 * - *Clamp* (this file): each sample is computed only from its own tile, always, so the
 *   answer is a pure function of the inputs.
 *
 * The cost of clamping is bounded and small. Only a sample within one 30 m cell of a tile
 * boundary is affected, which at 200 samples over a ~7.6 km tile grid is well under one
 * sample per profile, and its error is at most the terrain's own change across 30 m —
 * an order of magnitude below the DEM's measured error at a sharp peak (~88 m, SPEC §7.3).
 */

/**
 * Sample `grid` at fractional pixel coordinates.
 *
 * `pixelX`/`pixelY` are in the tile's own pixel space, where the CENTRE of cell `i` sits at
 * `i + 0.5` — the half-pixel shift matters: without it every sample is biased by half a cell
 * (~15 m) in both axes, which is a systematic error rather than noise.
 */
export function bilinearSample(
  grid: Int16Array,
  pixelX: number,
  pixelY: number,
  size: number = TILE_SIZE,
): number {
  if (grid.length !== size * size) {
    throw new RangeError(
      `grid holds ${String(grid.length)} cells, expected ${String(size * size)}`,
    );
  }

  // Non-finite coordinates are refused, not averaged. Without this, `fractionX`/`fractionY`
  // become NaN and the function returns NaN — which `Number(x.toFixed(2))` keeps as NaN and
  // `JSON.stringify` then writes as `null`, making a poisoned sample byte-identical to a tile
  // that simply failed to fetch (review #122, SFH122-M6). The `?? 0` fallbacks below cannot
  // help there: they satisfy `noUncheckedIndexedAccess` on reads that are already in range,
  // and their only live effect under NaN would be to substitute sea level.
  if (!Number.isFinite(pixelX) || !Number.isFinite(pixelY)) {
    throw new RangeError(
      `bilinearSample needs finite coordinates, received x=${String(pixelX)} y=${String(pixelY)}`,
    );
  }

  // Shift from "position in the tile" to "position in the lattice of cell centres".
  const x = pixelX - 0.5;
  const y = pixelY - 0.5;

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fractionX = x - x0;
  const fractionY = y - y0;

  const clampIndex = (value: number): number => Math.min(Math.max(value, 0), size - 1);
  const left = clampIndex(x0);
  const right = clampIndex(x0 + 1);
  const top = clampIndex(y0);
  const bottom = clampIndex(y0 + 1);

  const topLeft = grid[top * size + left] ?? 0;
  const topRight = grid[top * size + right] ?? 0;
  const bottomLeft = grid[bottom * size + left] ?? 0;
  const bottomRight = grid[bottom * size + right] ?? 0;

  const topValue = topLeft + (topRight - topLeft) * fractionX;
  const bottomValue = bottomLeft + (bottomRight - bottomLeft) * fractionX;

  return topValue + (bottomValue - topValue) * fractionY;
}
