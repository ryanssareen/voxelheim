import * as THREE from "three";
import { Mob } from "@engine/entities/Mob";
import type { MobType } from "@engine/entities/MobModel";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { ChunkManager } from "@engine/world/ChunkManager";
import { BLOCK_ID } from "@data/blocks";
import { CHUNK_SIZE, SEA_LEVEL } from "@engine/world/constants";
import { ItemDropManager } from "@engine/world/ItemDropManager";
import { useHotbarStore } from "@store/useHotbarStore";
import { useSettingsStore } from "@store/useSettingsStore";

const MAX_PASSIVE = 15;
const MAX_HOSTILE = 10;
const SPAWN_INTERVAL = 5; // seconds
const PASSIVE_TYPES: MobType[] = ["pig", "cow", "sheep"];
const HOSTILE_TYPES: MobType[] = ["zombie", "skeleton", "creeper"];

/**
 * Manages mob spawning, updating, and despawning.
 */
export class MobManager {
  private readonly scene: THREE.Scene;
  private readonly mobs: Mob[] = [];
  private spawnTimer = 0;
  private readonly registry = BlockRegistry.getInstance();
  private itemDrops: ItemDropManager | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setItemDrops(drops: ItemDropManager): void {
    this.itemDrops = drops;
  }

  update(
    dt: number,
    chunkManager: ChunkManager,
    playerPos: { x: number; y: number; z: number },
    timeOfDay: number,
    onDamagePlayer?: (amount: number, fromX: number, fromZ: number, mobType?: string) => void
  ): void {
    const getBlock = (x: number, y: number, z: number) => chunkManager.getBlock(x, y, z);
    const isNight = timeOfDay > 0.35 && timeOfDay < 0.75;
    const isInfinite = chunkManager.worldType === "infinite";
    const simDist = useSettingsStore.getState().simulationDistance;
    const despawnDist = isInfinite ? simDist * CHUNK_SIZE + 16 : 50;

    // Spawn timer
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = SPAWN_INTERVAL;

      const passiveCount = this.mobs.filter((m) => !m.config.hostile).length;
      const hostileCount = this.mobs.filter((m) => m.config.hostile).length;

      if (!isNight && passiveCount < MAX_PASSIVE) {
        this.trySpawnPassive(chunkManager, playerPos);
      }
      if (isNight && hostileCount < MAX_HOSTILE) {
        this.trySpawnHostile(chunkManager, playerPos);
      }
    }

    // Update mobs within simulation distance (burning is handled inside Mob.update)
    const simRange = isInfinite ? simDist * CHUNK_SIZE : 999;
    for (const mob of this.mobs) {
      const mobDist = Math.sqrt(
        (mob.position.x - playerPos.x) ** 2 +
        (mob.position.z - playerPos.z) ** 2
      );
      if (mobDist > simRange) continue;
      mob.update(dt, getBlock, this.registry, playerPos, timeOfDay);

      // Mob attacks
      if (!mob.dead && mob.attackCooldown <= 0 && onDamagePlayer) {
        if (mob.type === "zombie" && mob.distanceTo(playerPos) < 1.5) {
          onDamagePlayer(3, mob.position.x, mob.position.z, "zombie");
          mob.attackCooldown = 1;
        } else if (mob.type === "skeleton" && mob.distanceTo(playerPos) < 10 && mob.distanceTo(playerPos) > 2) {
          onDamagePlayer(2, mob.position.x, mob.position.z, "skeleton");
          mob.attackCooldown = 2;
        }
      }
    }

    // Handle creeper explosions
    for (const mob of this.mobs) {
      if (mob.type === "creeper" && mob.dead && mob.deathTimer < 0 && mob.age > 0) {
        this.explodeCreeper(mob, chunkManager);
        if (onDamagePlayer) {
          const dist = mob.distanceTo(playerPos);
          if (dist < 4) {
            const dmg = Math.round(8 * (1 - dist / 4));
            if (dmg > 0) onDamagePlayer(dmg, mob.position.x, mob.position.z, "creeper");
          }
        }
      }
    }

    // Remove dead mobs + despawn far mobs
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      const dist = Math.sqrt(
        (mob.position.x - playerPos.x) ** 2 +
        (mob.position.z - playerPos.z) ** 2
      );

      const shouldRemove = (mob.dead && mob.deathTimer < 0) || dist > despawnDist || mob.position.y < -10;
      if (shouldRemove) {
        if (mob.dead && mob.health <= 0) {
          const dropCount = 1 + Math.floor(Math.random() * 2);
          for (let d = 0; d < dropCount; d++) {
            if (this.itemDrops) {
              this.itemDrops.spawnDrop(
                mob.config.dropId,
                Math.floor(mob.position.x),
                Math.floor(mob.position.y),
                Math.floor(mob.position.z),
                0.5
              );
            } else {
              useHotbarStore.getState().addItem(mob.config.dropId);
            }
          }
        }
        this.scene.remove(mob.group);
        mob.dispose();
        this.mobs.splice(i, 1);
      }
    }
  }

  private trySpawnPassive(chunkManager: ChunkManager, playerPos?: { x: number; y: number; z: number }): void {
    const isInfinite = chunkManager.worldType === "infinite";
    const simDist = useSettingsStore.getState().simulationDistance;
    const maxScanY = isInfinite ? 120 : 60;

    for (let attempt = 0; attempt < 10; attempt++) {
      let wx: number, wz: number;
      if (isInfinite && playerPos) {
        const range = simDist * CHUNK_SIZE;
        wx = Math.floor(playerPos.x + (Math.random() * 2 - 1) * range);
        wz = Math.floor(playerPos.z + (Math.random() * 2 - 1) * range);
      } else {
        wx = 8 + Math.floor(Math.random() * 48);
        wz = 8 + Math.floor(Math.random() * 48);
      }

      for (let y = maxScanY; y >= 0; y--) {
        const block = chunkManager.getBlock(wx, y, wz);
        if (this.registry.isSolid(block)) {
          if (y + 1 <= SEA_LEVEL) break;
          if (block !== BLOCK_ID.GRASS && block !== BLOCK_ID.DIRT) break;
          if (this.registry.isSolid(chunkManager.getBlock(wx, y + 1, wz))) break;
          if (this.registry.isSolid(chunkManager.getBlock(wx, y + 2, wz))) break;

          const type = PASSIVE_TYPES[Math.floor(Math.random() * PASSIVE_TYPES.length)];
          const mob = new Mob(type, wx + 0.5, y + 1, wz + 0.5);
          if (!isInfinite) {
            mob.worldBounds = { min: 4, max: 60, center: 32 };
          }
          this.scene.add(mob.group);
          this.mobs.push(mob);
          return;
        }
      }
    }
  }

  private trySpawnHostile(
    chunkManager: ChunkManager,
    playerPos: { x: number; y: number; z: number }
  ): void {
    const isInfinite = chunkManager.worldType === "infinite";
    const maxScanY = isInfinite ? 120 : 60;

    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 12 + Math.random() * 8;
      const wx = Math.floor(playerPos.x + Math.cos(angle) * dist);
      const wz = Math.floor(playerPos.z + Math.sin(angle) * dist);

      if (!isInfinite && (wx < 1 || wx > 62 || wz < 1 || wz > 62)) continue;

      for (let y = maxScanY; y >= 0; y--) {
        if (this.registry.isSolid(chunkManager.getBlock(wx, y, wz))) {
          if (!this.registry.isSolid(chunkManager.getBlock(wx, y + 1, wz)) &&
              !this.registry.isSolid(chunkManager.getBlock(wx, y + 2, wz))) {
            const type = HOSTILE_TYPES[Math.floor(Math.random() * HOSTILE_TYPES.length)];
            const mob = new Mob(type, wx + 0.5, y + 1, wz + 0.5);
            if (!isInfinite) {
              mob.worldBounds = { min: 4, max: 60, center: 32 };
            }
            this.scene.add(mob.group);
            this.mobs.push(mob);
            return;
          }
          break;
        }
      }
    }
  }

  private explodeCreeper(mob: Mob, chunkManager: ChunkManager): void {
    const cx = Math.floor(mob.position.x);
    const cy = Math.floor(mob.position.y);
    const cz = Math.floor(mob.position.z);

    // Destroy 3x3x3 blocks around creeper
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bx = cx + dx;
          const by = cy + dy;
          const bz = cz + dz;
          if (by >= 0 && this.registry.isSolid(chunkManager.getBlock(bx, by, bz))) {
            chunkManager.setBlock(bx, by, bz, BLOCK_ID.AIR);
          }
        }
      }
    }
  }

  /** Check if player's attack raycast hits any mob. Returns hit mob or null. */
  hitTest(
    eyePos: { x: number; y: number; z: number },
    lookDir: { x: number; y: number; z: number },
    maxDist: number
  ): Mob | null {
    for (let t = 0; t < maxDist; t += 0.2) {
      const px = eyePos.x + lookDir.x * t;
      const py = eyePos.y + lookDir.y * t;
      const pz = eyePos.z + lookDir.z * t;

      for (const mob of this.mobs) {
        if (mob.dead) continue;
        const hw = mob.config.halfWidth;
        const h = mob.config.height;
        if (
          px > mob.position.x - hw && px < mob.position.x + hw &&
          py > mob.position.y && py < mob.position.y + h &&
          pz > mob.position.z - hw && pz < mob.position.z + hw
        ) {
          return mob;
        }
      }
    }
    return null;
  }

  getMobCount(): { passive: number; hostile: number } {
    return {
      passive: this.mobs.filter((m) => !m.config.hostile).length,
      hostile: this.mobs.filter((m) => m.config.hostile).length,
    };
  }

  dispose(): void {
    for (const mob of this.mobs) {
      this.scene.remove(mob.group);
      mob.dispose();
    }
    this.mobs.length = 0;
  }
}
