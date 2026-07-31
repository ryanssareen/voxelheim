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
