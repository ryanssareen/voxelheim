import { WORLD_SIZE_BLOCKS } from "@engine/world/constants";

/** Reserved id so the demo is a normal world record, not a second storage path. */
export const DEMO_WORLD_ID = "demo-island";
export const DEMO_WORLD_SEED = "voxelheim-demo";
export const DEMO_WORLD_TYPE = "island" as const;

const DEMO_WORLD_CONFIG = {
  seed: DEMO_WORLD_SEED,
  worldType: DEMO_WORLD_TYPE,
  gameMode: "survival" as const,
  islandSize: WORLD_SIZE_BLOCKS,
};

/**
 * Returns the demo world id, creating the record on first visit. A returning
 * visitor short-circuits to the existing record so their block changes survive.
 */
export async function ensureDemoWorld(): Promise<string> {
  const { loadWorldMeta, saveWorld } = await import(
    "@systems/persistence/WorldStorage"
  );

  const existing = await loadWorldMeta(DEMO_WORLD_ID);
  if (!existing) {
    await saveWorld(
      {
        id: DEMO_WORLD_ID,
        name: "Demo Island",
        seed: DEMO_WORLD_SEED,
        createdAt: Date.now(),
        lastPlayedAt: Date.now(),
        playerPos: {
          x: WORLD_SIZE_BLOCKS / 2,
          y: 50,
          z: WORLD_SIZE_BLOCKS / 2,
        },
        playerYaw: 0,
        playerPitch: 0,
        shardsCollected: 0,
        hotbarSlots: Array.from({ length: 8 }, () => ({ blockId: 0, count: 0 })),
        worldType: DEMO_WORLD_TYPE,
        gameMode: DEMO_WORLD_CONFIG.gameMode,
        islandSize: WORLD_SIZE_BLOCKS,
      },
      new Map()
    );
  }

  // GameCanvas reads the seed from this key, same as the create-world flow.
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(
        "voxelheim-world-config",
        JSON.stringify(DEMO_WORLD_CONFIG)
      );
    } catch {}
  }

  return DEMO_WORLD_ID;
}
