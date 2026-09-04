import type { BlockDefinition } from "@data/blocks";
import { NO_TOOL_TIER, type ToolDef } from "@data/items";

/** Floor applied to the tier-scaling factor in harvestSpeedMultiplier. */
const MIN_TIER_SPEED = 0.25;

/**
 * Whether breaking `blockDef` with `toolDef` yields a drop. Two independent
 * gates must both pass:
 *  - Type gate: if the block declares `requiresTool`, the tool must be of
 *    that type.
 *  - Level gate: the tool's tier must be >= the block's `minTier` (blocks
 *    without a `minTier` accept any tier, including no tool at all).
 * `toolDef` is null for an empty hand, which is treated as `NO_TOOL_TIER`.
 */
export function canHarvest(
  blockDef: Pick<BlockDefinition, "requiresTool" | "minTier">,
  toolDef: Pick<ToolDef, "toolType" | "tier"> | null
): boolean {
  if (blockDef.requiresTool && toolDef?.toolType !== blockDef.requiresTool) return false;
  const tier = toolDef?.tier ?? NO_TOOL_TIER;
  return tier >= (blockDef.minTier ?? NO_TOOL_TIER);
}

/**
 * The mining speed multiplier for breaking `blockDef` with `toolDef`: the
 * existing `effectiveAgainst` bonus, additionally scaled by
 * `tier / minTier` (clamped to [MIN_TIER_SPEED, 1]) for blocks that declare
 * a `minTier`. Blocks without `minTier` are unaffected by tool tier.
 */
export function harvestSpeedMultiplier(
  blockDef: Pick<BlockDefinition, "id" | "minTier">,
  toolDef: Pick<ToolDef, "tier" | "miningSpeedMultiplier" | "effectiveAgainst"> | null
): number {
  const base = toolDef && toolDef.effectiveAgainst.includes(blockDef.id) ? toolDef.miningSpeedMultiplier : 1;
  if (blockDef.minTier === undefined) return base;
  const tier = toolDef?.tier ?? NO_TOOL_TIER;
  const tierMul = Math.min(1, Math.max(MIN_TIER_SPEED, tier / blockDef.minTier));
  return base * tierMul;
}
