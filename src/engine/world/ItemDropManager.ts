import * as THREE from "three";
import { useHotbarStore } from "@store/useHotbarStore";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { BLOCK_HEX_COLORS } from "@data/items";

const DROP_COLORS = BLOCK_HEX_COLORS;

interface ItemDrop {
  mesh: THREE.Mesh;
  blockId: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  bobOffset: number;
  settled: boolean;
  pickupDelay: number;
}

const PICKUP_DISTANCE = 1.5;
const MAGNET_DISTANCE = 3.0;
const MAGNET_SPEED = 8;
const DROP_LIFETIME = 60;
const BOB_SPEED = 3;
const BOB_HEIGHT = 0.15;
const SPIN_SPEED = 2;
const DROP_GRAVITY = 18;
const DROP_FRICTION = 0.9;

/**
 * Manages floating item drops in the world.
 * Items pop out of broken blocks, float/spin, and get picked up on walk-over.
 */
export class ItemDropManager {
  private readonly scene: THREE.Scene;
  private readonly drops: ItemDrop[] = [];
  private readonly registry = BlockRegistry.getInstance();
  private getBlock: ((x: number, y: number, z: number) => number) | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setGetBlock(fn: (x: number, y: number, z: number) => number): void {
    this.getBlock = fn;
  }

  /** Spawn a floating item at a block position. pickupDelay controls how long before it can be collected. */
  spawnDrop(blockId: number, x: number, y: number, z: number, pickupDelay = 1.5): void {
    const color = DROP_COLORS[blockId] ?? 0xffffff;

    const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const material = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);

    // Start at center of broken block with slight random offset
    const pos = new THREE.Vector3(
      x + 0.5 + (Math.random() - 0.5) * 0.3,
      y + 0.5,
      z + 0.5 + (Math.random() - 0.5) * 0.3
    );
    mesh.position.copy(pos);

    // Pop up and out
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      3 + Math.random() * 2,
      (Math.random() - 0.5) * 2
    );

    this.scene.add(mesh);
    this.drops.push({
      mesh,
      blockId,
      position: pos,
      velocity: vel,
      age: 0,
      bobOffset: Math.random() * Math.PI * 2,
      settled: false,
      pickupDelay,
    });
  }

  /** Update all drops: physics, bob, spin, pickup check. */
  update(
    dt: number,
    playerPos: { x: number; y: number; z: number }
  ): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.age += dt;

      // Remove old drops
      if (drop.age > DROP_LIFETIME) {
        this.removeDrop(i);
        continue;
      }

      // Physics: gravity + collision until settled
      if (!drop.settled) {
        drop.velocity.y -= DROP_GRAVITY * dt;
        drop.position.x += drop.velocity.x * dt;
        drop.position.y += drop.velocity.y * dt;
        drop.position.z += drop.velocity.z * dt;

        // Ground collision
        if (this.getBlock) {
          const bx = Math.floor(drop.position.x);
          const by = Math.floor(drop.position.y);
          const bz = Math.floor(drop.position.z);
          if (by >= 0 && this.registry.isSolid(this.getBlock(bx, by, bz))) {
            drop.position.y = by + 1;
            drop.velocity.y = -drop.velocity.y * 0.3;
            drop.velocity.x *= DROP_FRICTION;
            drop.velocity.z *= DROP_FRICTION;
            if (Math.abs(drop.velocity.y) < 0.5) {
              drop.velocity.set(0, 0, 0);
              drop.settled = true;
            }
          }
        } else if (drop.age > 0.5) {
          drop.velocity.set(0, 0, 0);
          drop.settled = true;
        }

        // Clamp to not fall through world
        if (drop.position.y < -5) {
          this.removeDrop(i);
          continue;
        }
      }

      // Bob and spin
      const baseY = drop.settled ? drop.position.y + 0.15 : drop.position.y;
      const bobY = baseY +
        (drop.settled ? Math.sin(drop.age * BOB_SPEED + drop.bobOffset) * BOB_HEIGHT : 0);
      drop.mesh.position.set(drop.position.x, bobY, drop.position.z);
      drop.mesh.rotation.y = drop.age * SPIN_SPEED;

      // Slight scale pulse
      const scale = 1 + Math.sin(drop.age * 4) * 0.05;
      drop.mesh.scale.setScalar(scale);

      // Pickup + magnet check
      const dx = playerPos.x - drop.position.x;
      const dy = playerPos.y + 0.9 - drop.position.y;
      const dz = playerPos.z - drop.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (drop.age > drop.pickupDelay) {
        // Magnet: pull drops toward player when close
        if (dist < MAGNET_DISTANCE && dist > PICKUP_DISTANCE) {
          const pull = MAGNET_SPEED * dt / dist;
          drop.position.x += dx * pull;
          drop.position.y += dy * pull;
          drop.position.z += dz * pull;
          drop.settled = false;
        }

        // Pickup: add to inventory
        if (dist < PICKUP_DISTANCE) {
          const added = useHotbarStore.getState().addItem(drop.blockId);
          if (added) {
            this.removeDrop(i);
            continue;
          }
        }
      }
    }
  }

  private removeDrop(index: number): void {
    const drop = this.drops[index];
    this.scene.remove(drop.mesh);
    drop.mesh.geometry.dispose();
    (drop.mesh.material as THREE.Material).dispose();
    this.drops.splice(index, 1);
  }

  dispose(): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      this.removeDrop(i);
    }
  }
}
