import { ChunkManager } from "@engine/world/ChunkManager";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { BLOCK_ID } from "@data/blocks";
import { useGameStore } from "@store/useGameStore";

const MAX_DISTANCE = 6;
const STEP_SIZE = 0.1;
const EYE_HEIGHT = 1.6;
const HALF_WIDTH = 0.3;
const PLAYER_HEIGHT = 1.8;

interface TargetBlock {
  hit: boolean;
  blockPos?: { x: number; y: number; z: number };
  facePos?: { x: number; y: number; z: number };
  blockId?: number;
}

/**
 * Handles block breaking and placing via raycasting from the player's eye.
 */
export class BlockInteraction {
  private readonly chunkManager: ChunkManager;
  private readonly registry: BlockRegistry;

  constructor(chunkManager: ChunkManager, registry: BlockRegistry) {
    this.chunkManager = chunkManager;
    this.registry = registry;
  }

  /** Raycasts from eye position to find the targeted block. */
  getTargetBlock(
    playerPos: { x: number; y: number; z: number },
    lookDir: { x: number; y: number; z: number }
  ): TargetBlock {
    const eyeX = playerPos.x;
    const eyeY = playerPos.y + EYE_HEIGHT;
    const eyeZ = playerPos.z;

    let prevX = -1;
    let prevY = -1;
    let prevZ = -1;

    const steps = Math.ceil(MAX_DISTANCE / STEP_SIZE);
    for (let i = 0; i <= steps; i++) {
      const t = i * STEP_SIZE;
      const wx = Math.floor(eyeX + lookDir.x * t);
      const wy = Math.floor(eyeY + lookDir.y * t);
      const wz = Math.floor(eyeZ + lookDir.z * t);

      // Skip if same block as previous step
      if (wx === prevX && wy === prevY && wz === prevZ) continue;

      const blockId = this.chunkManager.getBlock(wx, wy, wz);
      if (this.registry.isSolid(blockId)) {
        return {
          hit: true,
          blockPos: { x: wx, y: wy, z: wz },
          facePos: { x: prevX, y: prevY, z: prevZ },
          blockId,
        };
      }

      prevX = wx;
      prevY = wy;
      prevZ = wz;
    }

    return { hit: false };
  }

  /** Processes break/place actions for the current frame. */
  update(
    playerPos: { x: number; y: number; z: number },
    lookDir: { x: number; y: number; z: number },
    leftClick: boolean,
    rightClick: boolean,
    selectedBlockId: number
  ): void {
    if (!leftClick && !rightClick) return;

    const target = this.getTargetBlock(playerPos, lookDir);
    if (!target.hit || !target.blockPos) return;

    if (leftClick) {
      const blockId = target.blockId!;
      this.chunkManager.setBlock(
        target.blockPos.x,
        target.blockPos.y,
        target.blockPos.z,
        BLOCK_ID.AIR
      );
      if (blockId === BLOCK_ID.CRYSTAL) {
        useGameStore.getState().collectShard();
      }
    }

    if (rightClick && target.facePos && target.facePos.x >= 0) {
      // Check that placement position doesn't overlap player hitbox
      const px = target.facePos.x;
      const py = target.facePos.y;
      const pz = target.facePos.z;

      const playerMinX = playerPos.x - HALF_WIDTH;
      const playerMaxX = playerPos.x + HALF_WIDTH;
      const playerMinY = playerPos.y;
      const playerMaxY = playerPos.y + PLAYER_HEIGHT;
      const playerMinZ = playerPos.z - HALF_WIDTH;
      const playerMaxZ = playerPos.z + HALF_WIDTH;

      const blockOverlapsPlayer =
        px + 1 > playerMinX &&
        px < playerMaxX &&
        py + 1 > playerMinY &&
        py < playerMaxY &&
        pz + 1 > playerMinZ &&
        pz < playerMaxZ;

      if (!blockOverlapsPlayer) {
        this.chunkManager.setBlock(px, py, pz, selectedBlockId);
      }
    }
  }
}
