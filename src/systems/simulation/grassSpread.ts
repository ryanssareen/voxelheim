import { BLOCK_ID } from "@data/blocks";
import type { BlockRegistry } from "@engine/world/BlockRegistry";
import type { RandomTickRule, TickWorld } from "./RandomTicker";

/**
 * Data-driven description of a surface-spread pair: `spreader` grows onto an
 * adjacent `substrate` block when it has an open (transparent) block above
 * it, and decays back to `substrate` when something opaque covers it.
 * Deliberately generic — no switch on block ids or names.
 */
export interface SurfaceSpreadRule {
  spreader: number;
  substrate: number;
}

export const GRASS_SPREAD: SurfaceSpreadRule = {
  spreader: BLOCK_ID.GRASS,
  substrate: BLOCK_ID.DIRT,
};

/** The 26 neighbour offsets of a 3x3x3 block, excluding the center cell. */
const NEIGHBOR_OFFSETS: readonly [number, number, number][] = (() => {
  const offsets: [number, number, number][] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        offsets.push([dx, dy, dz]);
      }
    }
  }
  return offsets;
})();

/**
 * Builds a {@link RandomTickRule} implementing Minecraft-style grass spread
 * and decay for the given spreader/substrate pair.
 *
 * - `substrate` (e.g. DIRT) with an open block above and a `spreader`
 *   neighbour anywhere in its 3x3x3 neighbourhood becomes `spreader`.
 * - `spreader` (e.g. GRASS) with a non-transparent block directly above it
 *   decays back to `substrate`.
 */
export function createSurfaceSpreadRule(rule: SurfaceSpreadRule, registry: BlockRegistry): RandomTickRule {
  return {
    blockIds: new Set([rule.spreader, rule.substrate]),
    tick(world: TickWorld, wx: number, wy: number, wz: number, blockId: number): boolean {
      if (blockId === rule.substrate) {
        const above = world.getBlock(wx, wy + 1, wz);
        if (!registry.isTransparent(above)) return false;

        for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
          if (world.getBlock(wx + dx, wy + dy, wz + dz) === rule.spreader) {
            return world.setBlock(wx, wy, wz, rule.spreader, "simulation");
          }
        }
        return false;
      }

      if (blockId === rule.spreader) {
        const above = world.getBlock(wx, wy + 1, wz);
        if (registry.isTransparent(above)) return false;
        return world.setBlock(wx, wy, wz, rule.substrate, "simulation");
      }

      return false;
    },
  };
}
