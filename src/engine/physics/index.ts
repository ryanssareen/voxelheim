/**
 * Shared voxel-AABB helpers.
 *
 * Entity hitboxes are half-open boxes: an entity spanning [minX, maxX] occupies
 * every block column from `Math.floor(minX)` up to — but not including — a `maxX`
 * that lands exactly on a block boundary.
 *
 * This matters because collision resolution snaps entities flush against block
 * faces. Resolving a +X hit sets `x = bx - halfWidth`, which makes `maxX === bx`
 * exactly, so a naive `Math.floor(maxX)` keeps reporting block `bx` as overlapped
 * forever even though the overlap is zero-width. (Resolving a -X hit sets
 * `x = bx + 1 + halfWidth`, giving `minX === bx + 1`, which floors clear of the
 * block — which is why collisions used to misbehave only along +X and +Z.)
 */

/** Highest block index an AABB edge overlaps with non-zero width. */
export function maxBlock(max: number): number {
  const floored = Math.floor(max);
  return floored === max ? floored - 1 : floored;
}

/**
 * Finds the block layer along `axis` that stops travel in `delta`'s direction,
 * given the integer block range the entity's AABB covers.
 *
 * Scans the moving axis **in the direction of travel** — ascending for positive
 * delta, descending for negative — and returns the first layer containing a
 * solid block. Order matters only when the AABB straddles more than one solid
 * layer (an entity already embedded in terrain): the nearest face is the lowest
 * index when travelling positive and the highest when travelling negative.
 * Resolving against the wrong one leaves the entity still inside the other.
 *
 * Returns null when nothing blocks.
 */
export function firstBlockingLayer(
  axis: "x" | "y" | "z",
  delta: number,
  bMinX: number,
  bMaxX: number,
  bMinY: number,
  bMaxY: number,
  bMinZ: number,
  bMaxZ: number,
  isSolidAt: (x: number, y: number, z: number) => boolean
): number | null {
  const lo = axis === "x" ? bMinX : axis === "y" ? bMinY : bMinZ;
  const hi = axis === "x" ? bMaxX : axis === "y" ? bMaxY : bMaxZ;

  const step = delta < 0 ? -1 : 1;
  const start = delta < 0 ? hi : lo;
  const stop = delta < 0 ? lo : hi;

  for (let layer = start; delta < 0 ? layer >= stop : layer <= stop; layer += step) {
    const xLo = axis === "x" ? layer : bMinX;
    const xHi = axis === "x" ? layer : bMaxX;
    const yLo = axis === "y" ? layer : bMinY;
    const yHi = axis === "y" ? layer : bMaxY;
    const zLo = axis === "z" ? layer : bMinZ;
    const zHi = axis === "z" ? layer : bMaxZ;

    for (let bx = xLo; bx <= xHi; bx++) {
      for (let by = yLo; by <= yHi; by++) {
        for (let bz = zLo; bz <= zHi; bz++) {
          if (isSolidAt(bx, by, bz)) return layer;
        }
      }
    }
  }

  return null;
}
