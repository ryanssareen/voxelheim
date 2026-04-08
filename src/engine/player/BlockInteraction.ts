import { ChunkManager } from "@engine/world/ChunkManager";
import { ItemDropManager } from "@engine/world/ItemDropManager";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { BLOCK_ID, BLOCK_DEFINITIONS } from "@data/blocks";
import { getToolDef } from "@data/items";
import { useGameStore } from "@store/useGameStore";
import { useHotbarStore } from "@store/useHotbarStore";
import { useInventoryStore } from "@store/useInventoryStore";

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

export interface BreakState {
  isBreaking: boolean;
  breakProgress: number;
  breakTarget: { x: number; y: number; z: number } | null;
}

/**
 * Handles timed block breaking and block placing via raycasting.
 */
export class BlockInteraction {
  private readonly chunkManager: ChunkManager;
  private readonly registry: BlockRegistry;
  private readonly itemDrops: ItemDropManager;

  // Breaking state
  private breakingPos: { x: number; y: number; z: number } | null = null;
  private breakProgress = 0;
  private breakBlockId = 0;

  constructor(chunkManager: ChunkManager, registry: BlockRegistry, itemDrops: ItemDropManager) {
    this.chunkManager = chunkManager;
    this.registry = registry;
    this.itemDrops = itemDrops;
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

  /** Processes timed breaking and single-frame placing. Returns break state for rendering. */
  update(
    playerPos: { x: number; y: number; z: number },
    lookDir: { x: number; y: number; z: number },
    isLeftHeld: boolean,
    rightClick: boolean,
    selectedBlockId: number,
    dt: number
  ): BreakState {
    const target = this.getTargetBlock(playerPos, lookDir);

    // --- Timed breaking ---
    if (isLeftHeld && target.hit && target.blockPos) {
      const bp = target.blockPos;
      const blockDef = this.registry.getBlock(target.blockId!);

      if (blockDef && blockDef.breakable && blockDef.breakTime > 0) {
        // Tool speed multiplier
        const hotbar = useHotbarStore.getState();
        const heldId = hotbar.getSelectedBlockId();
        const toolDef = getToolDef(heldId);
        let speedMul = 1;
        if (toolDef && toolDef.effectiveAgainst.includes(target.blockId!)) {
          speedMul = toolDef.miningSpeedMultiplier;
        }

        // Check if still targeting the same block
        if (
          this.breakingPos &&
          this.breakingPos.x === bp.x &&
          this.breakingPos.y === bp.y &&
          this.breakingPos.z === bp.z
        ) {
          this.breakProgress += (dt * speedMul) / blockDef.breakTime;
        } else {
          this.breakingPos = { x: bp.x, y: bp.y, z: bp.z };
          this.breakProgress = (dt * speedMul) / blockDef.breakTime;
          this.breakBlockId = target.blockId!;
        }

        // Block broken!
        if (this.breakProgress >= 1.0) {
          this.chunkManager.setBlock(bp.x, bp.y, bp.z, BLOCK_ID.AIR);

          // Only drop if the correct tool is used (or no tool required)
          const needsTool = blockDef.requiresTool;
          const hasRightTool = !needsTool || (toolDef && toolDef.toolType === needsTool);
          if (hasRightTool) {
            this.itemDrops.spawnDrop(blockDef.dropId, bp.x, bp.y, bp.z);

            if (target.blockId === BLOCK_ID.CRYSTAL) {
              useGameStore.getState().collectShard();
            }
          }

          // Damage the held tool
          if (toolDef) {
            hotbar.damageSelectedTool();
          }

          this.breakingPos = null;
          this.breakProgress = 0;
        }
      }
    } else {
      // Not holding left or no target — reset
      this.breakingPos = null;
      this.breakProgress = 0;
    }

    // --- Single-frame placing (right click) ---
    if (rightClick && target.hit && target.blockPos) {
      // Right-click on crafting table opens 3x3 UI
      if (target.blockId === BLOCK_ID.CRAFTING_TABLE) {
        const inv = useInventoryStore.getState();
        if (!inv.tableOpen) {
          inv.openTable();
          if (document.pointerLockElement) document.exitPointerLock();
        }
        return {
          isBreaking: this.breakingPos !== null,
          breakProgress: this.breakProgress,
          breakTarget: this.breakingPos,
        };
      }
    }
    if (rightClick && target.hit && target.facePos && target.facePos.x >= 0) {
      // Check we have items to place
      const hotbar = useHotbarStore.getState();
      const placeId = hotbar.getSelectedBlockId();
      const placeDef = BLOCK_DEFINITIONS[placeId];
      if (placeId !== BLOCK_ID.AIR && placeDef?.solid) {
        const px = target.facePos.x;
        const py = target.facePos.y;
        const pz = target.facePos.z;

        // Don't place if it overlaps player
        const playerMinX = playerPos.x - HALF_WIDTH;
        const playerMaxX = playerPos.x + HALF_WIDTH;
        const playerMinY = playerPos.y;
        const playerMaxY = playerPos.y + PLAYER_HEIGHT;
        const playerMinZ = playerPos.z - HALF_WIDTH;
        const playerMaxZ = playerPos.z + HALF_WIDTH;

        const overlaps =
          px + 1 > playerMinX &&
          px < playerMaxX &&
          py + 1 > playerMinY &&
          py < playerMaxY &&
          pz + 1 > playerMinZ &&
          pz < playerMaxZ;

        if (!overlaps) {
          this.chunkManager.setBlock(px, py, pz, placeId);
          hotbar.removeSelectedItem();
        }
      }
    }

    return {
      isBreaking: this.breakingPos !== null,
      breakProgress: this.breakProgress,
      breakTarget: this.breakingPos,
    };
  }
}
