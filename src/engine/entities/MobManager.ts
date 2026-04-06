import * as THREE from "three";
import { Mob } from "@engine/entities/Mob";
import type { MobType } from "@engine/entities/MobModel";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { ChunkManager } from "@engine/world/ChunkManager";
import { BLOCK_ID } from "@data/blocks";
import { SEA_LEVEL } from "@engine/world/constants";
import { useHotbarStore } from "@store/useHotbarStore";

const MAX_PASSIVE = 15;
const MAX_HOSTILE = 10;
const SPAWN_INTERVAL = 5; // seconds
const DESPAWN_DISTANCE = 50;
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

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(
    dt: number,
    chunkManager: ChunkManager,
    playerPos: { x: number; y: number; z: number },
    timeOfDay: number
  ): void {
    const getBlock = (x: number, y: number, z: number) => chunkManager.getBlock(x, y, z);
    const isNight = timeOfDay > 0.35 && timeOfDay < 0.75;

    // Spawn timer
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = SPAWN_INTERVAL;

      const passiveCount = this.mobs.filter((m) => !m.config.hostile).length;
      const hostileCount = this.mobs.filter((m) => m.config.hostile).length;

      if (!isNight && passiveCount < MAX_PASSIVE) {
        this.trySpawnPassive(chunkManager);
      }
      if (isNight && hostileCount < MAX_HOSTILE) {
        this.trySpawnHostile(chunkManager, playerPos);
      }
    }

    // Burn hostiles at dawn
    if (!isNight) {
      for (const mob of this.mobs) {
        if (mob.config.hostile && !mob.dead) {
          mob.dead = true; // Will be cleaned up below
        }
      }
    }

    // Update all mobs
    for (const mob of this.mobs) {
      mob.update(dt, getBlock, this.registry, playerPos);

      // Zombie melee attack
      if (mob.type === "zombie" && !mob.dead) {
        if (mob.distanceTo(playerPos) < 1.5) {
          // Knockback player (handled via return value or store)
        }
      }
    }

    // Handle creeper explosions
    for (const mob of this.mobs) {
      if (mob.type === "creeper" && mob.dead && mob.age > 0) {
        this.explodeCreeper(mob, chunkManager);
      }
    }

    // Remove dead mobs + despawn far mobs
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      const dist = Math.sqrt(
        (mob.position.x - playerPos.x) ** 2 +
        (mob.position.z - playerPos.z) ** 2
      );

      if (mob.dead || dist > DESPAWN_DISTANCE || mob.position.y < -10) {
        if (mob.dead && mob.health <= 0) {
          // Drop items
          const dropCount = 1 + Math.floor(Math.random() * 2);
          for (let d = 0; d < dropCount; d++) {
            useHotbarStore.getState().addItem(mob.config.dropId);
          }
        }
        this.scene.remove(mob.group);
        mob.dispose();
        this.mobs.splice(i, 1);
      }
    }
  }

  private trySpawnPassive(chunkManager: ChunkManager): void {
    // Try random positions on the island surface
    for (let attempt = 0; attempt < 10; attempt++) {
      const wx = 8 + Math.floor(Math.random() * 48);
      const wz = 8 + Math.floor(Math.random() * 48);

      // Find surface
      for (let y = 60; y >= 0; y--) {
        const block = chunkManager.getBlock(wx, y, wz);
        if (this.registry.isSolid(block)) {
          if (y + 1 <= SEA_LEVEL) break; // Too low
          if (block !== BLOCK_ID.GRASS && block !== BLOCK_ID.DIRT) break;
          // Check air above
          if (this.registry.isSolid(chunkManager.getBlock(wx, y + 1, wz))) break;
          if (this.registry.isSolid(chunkManager.getBlock(wx, y + 2, wz))) break;

          const type = PASSIVE_TYPES[Math.floor(Math.random() * PASSIVE_TYPES.length)];
          const mob = new Mob(type, wx + 0.5, y + 1, wz + 0.5);
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
    for (let attempt = 0; attempt < 10; attempt++) {
      // Spawn 12-20 blocks from player
      const angle = Math.random() * Math.PI * 2;
      const dist = 12 + Math.random() * 8;
      const wx = Math.floor(playerPos.x + Math.cos(angle) * dist);
      const wz = Math.floor(playerPos.z + Math.sin(angle) * dist);

      if (wx < 1 || wx > 62 || wz < 1 || wz > 62) continue;

      // Find surface
      for (let y = 60; y >= 0; y--) {
        if (this.registry.isSolid(chunkManager.getBlock(wx, y, wz))) {
          if (!this.registry.isSolid(chunkManager.getBlock(wx, y + 1, wz)) &&
              !this.registry.isSolid(chunkManager.getBlock(wx, y + 2, wz))) {
            const type = HOSTILE_TYPES[Math.floor(Math.random() * HOSTILE_TYPES.length)];
            const mob = new Mob(type, wx + 0.5, y + 1, wz + 0.5);
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
