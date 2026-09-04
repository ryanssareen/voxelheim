import * as THREE from "three";
import { useHotbarStore } from "@store/useHotbarStore";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { BLOCK_HEX_COLORS } from "@data/items";
import type { MultiplayerDropState } from "@lib/multiplayer/types";
import type { TextureAtlas } from "@engine/renderer/TextureAtlas";

const DROP_COLORS = BLOCK_HEX_COLORS;

/** BoxGeometry's 6 face groups, in construction order (px, nx, py, ny, pz, nz). */
const BOX_FACE_OF_GROUP = ["side", "side", "top", "bottom", "side", "side"] as const;

interface ItemDrop {
  dropId: string;
  mesh: THREE.Mesh;
  blockId: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  bobOffset: number;
  settled: boolean;
  pickupDelay: number;
  createdAt: number;
  pendingClaim: boolean;
}

interface NetworkHandlers {
  onDropSpawn?: ((drop: MultiplayerDropState) => void) | null;
  claimDrop?: ((dropId: string) => Promise<boolean>) | null;
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

function createDropId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `drop-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Manages floating item drops in the world.
 * Items pop out of broken blocks, float/spin, and get picked up on walk-over.
 */
export class ItemDropManager {
  private readonly scene: THREE.Scene;
  private readonly atlas: TextureAtlas | null;
  private readonly drops = new Map<string, ItemDrop>();
  private readonly registry = BlockRegistry.getInstance();
  private getBlock: ((x: number, y: number, z: number) => number) | null = null;
  private onDropSpawn: ((drop: MultiplayerDropState) => void) | null = null;
  private claimDrop: ((dropId: string) => Promise<boolean>) | null = null;

  /** Shared, lazily created — one material per sheet for every atlas-textured drop. */
  private blockMaterial: THREE.MeshLambertMaterial | null = null;
  private itemMaterial: THREE.MeshLambertMaterial | null = null;

  constructor(scene: THREE.Scene, atlas: TextureAtlas | null = null) {
    this.scene = scene;
    this.atlas = atlas;
  }

  setGetBlock(fn: (x: number, y: number, z: number) => number): void {
    this.getBlock = fn;
  }

  setNetworkHandlers(handlers: NetworkHandlers): void {
    this.onDropSpawn = handlers.onDropSpawn ?? null;
    this.claimDrop = handlers.claimDrop ?? null;
  }

  /** Spawn a floating item at a block position. pickupDelay controls how long before it can be collected. */
  spawnDrop(
    blockId: number,
    x: number,
    y: number,
    z: number,
    pickupDelay = 1.5,
    existingState?: MultiplayerDropState
  ): string {
    const state = existingState ?? this.createDropState(blockId, x, y, z, pickupDelay);
    const existing = this.drops.get(state.dropId);
    if (existing) {
      if (existingState) {
        this.applyStateToDrop(existing, state);
      }
      return state.dropId;
    }

    this.addDropFromState(state);
    if (!existingState) {
      this.onDropSpawn?.(state);
    }
    return state.dropId;
  }

  upsertRemoteDrop(drop: MultiplayerDropState): void {
    this.spawnDrop(drop.blockId, drop.x, drop.y, drop.z, drop.pickupDelay, drop);
  }

  removeRemoteDrop(dropId: string): void {
    this.removeDrop(dropId);
  }

  /** Update all drops: physics, bob, spin, pickup check. */
  update(
    dt: number,
    playerPos: { x: number; y: number; z: number }
  ): void {
    for (const drop of [...this.drops.values()]) {
      drop.age += dt;

      if (drop.age > DROP_LIFETIME) {
        this.scheduleRemoval(drop.dropId);
        continue;
      }

      if (!drop.settled) {
        drop.velocity.y -= DROP_GRAVITY * dt;
        drop.position.x += drop.velocity.x * dt;
        drop.position.y += drop.velocity.y * dt;
        drop.position.z += drop.velocity.z * dt;

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

        if (drop.position.y < -5) {
          this.scheduleRemoval(drop.dropId);
          continue;
        }
      }

      const baseY = drop.settled ? drop.position.y + 0.15 : drop.position.y;
      const bobY =
        baseY +
        (drop.settled
          ? Math.sin(drop.age * BOB_SPEED + drop.bobOffset) * BOB_HEIGHT
          : 0);
      drop.mesh.position.set(drop.position.x, bobY, drop.position.z);
      drop.mesh.rotation.y = drop.age * SPIN_SPEED;

      const scale = 1 + Math.sin(drop.age * 4) * 0.05;
      drop.mesh.scale.setScalar(scale);

      if (drop.pendingClaim || drop.age <= drop.pickupDelay) continue;

      const dx = playerPos.x - drop.position.x;
      const dy = playerPos.y + 0.9 - drop.position.y;
      const dz = playerPos.z - drop.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < MAGNET_DISTANCE && dist > PICKUP_DISTANCE) {
        const pull = (MAGNET_SPEED * dt) / dist;
        drop.position.x += dx * pull;
        drop.position.y += dy * pull;
        drop.position.z += dz * pull;
        drop.settled = false;
      }

      if (dist < PICKUP_DISTANCE) {
        void this.tryPickup(drop.dropId);
      }
    }
  }

  private createDropState(
    blockId: number,
    x: number,
    y: number,
    z: number,
    pickupDelay: number
  ): MultiplayerDropState {
    return {
      dropId: createDropId(),
      blockId,
      x: x + 0.5 + (Math.random() - 0.5) * 0.3,
      y: y + 0.5,
      z: z + 0.5 + (Math.random() - 0.5) * 0.3,
      vx: (Math.random() - 0.5) * 2,
      vy: 3 + Math.random() * 2,
      vz: (Math.random() - 0.5) * 2,
      bobOffset: Math.random() * Math.PI * 2,
      pickupDelay,
      createdAt: Date.now(),
    };
  }

  private getBlockMaterial(): THREE.MeshLambertMaterial {
    if (!this.blockMaterial) {
      this.blockMaterial = new THREE.MeshLambertMaterial({
        map: this.atlas?.getTexture() ?? null,
        alphaTest: 0.5,
      });
    }
    return this.blockMaterial;
  }

  private getItemMaterial(): THREE.MeshLambertMaterial {
    if (!this.itemMaterial) {
      this.itemMaterial = new THREE.MeshLambertMaterial({
        map: this.atlas?.getItemTexture() ?? null,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
      });
    }
    return this.itemMaterial;
  }

  /** Remaps a geometry's default `uv` attribute onto one atlas sub-rectangle. */
  private static remapUVs(
    geometry: THREE.BufferGeometry,
    rect: { u0: number; v0: number; u1: number; v1: number },
    start: number,
    count: number
  ): void {
    const uvAttr = geometry.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = start; i < start + count; i++) {
      const u = uvAttr.getX(i);
      const v = uvAttr.getY(i);
      uvAttr.setXY(i, rect.u0 + u * (rect.u1 - rect.u0), rect.v1 - v * (rect.v1 - rect.v0));
    }
    uvAttr.needsUpdate = true;
  }

  /**
   * Chooses the drop's mesh by data, never a switch on the block id: a block
   * with a side texture and a loaded block atlas gets an atlas-UV'd cube; a
   * block-less item with an icon tile and a loaded item sheet gets a
   * spinning quad (Minecraft-style); anything else falls back to the
   * original flat-coloured cube so tests and the no-atlas case still work.
   */
  private buildDropMesh(blockId: number): THREE.Mesh {
    const def = this.registry.getBlock(blockId);

    if (def && def.textures.side !== "" && this.atlas?.getTexture()) {
      const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
      for (let group = 0; group < BOX_FACE_OF_GROUP.length; group++) {
        const rect = this.atlas.getBlockFaceUVs(blockId, BOX_FACE_OF_GROUP[group]);
        ItemDropManager.remapUVs(geometry, rect, group * 4, 4);
      }
      return new THREE.Mesh(geometry, this.getBlockMaterial());
    }

    const itemRect = this.atlas?.getItemUVs(blockId);
    if (itemRect && this.atlas?.getItemTexture()) {
      const geometry = new THREE.PlaneGeometry(0.4, 0.4);
      ItemDropManager.remapUVs(geometry, itemRect, 0, 4);
      return new THREE.Mesh(geometry, this.getItemMaterial());
    }

    const color = DROP_COLORS[blockId] ?? 0xffffff;
    const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const material = new THREE.MeshBasicMaterial({ color });
    return new THREE.Mesh(geometry, material);
  }

  private addDropFromState(state: MultiplayerDropState): void {
    const mesh = this.buildDropMesh(state.blockId);

    const initialAge = Math.max(0, (Date.now() - state.createdAt) / 1000);
    const settled = initialAge > 1;
    const velocity = settled
      ? new THREE.Vector3(0, 0, 0)
      : new THREE.Vector3(state.vx, state.vy, state.vz);
    const position = new THREE.Vector3(state.x, state.y, state.z);
    mesh.position.copy(position);

    this.scene.add(mesh);
    this.drops.set(state.dropId, {
      dropId: state.dropId,
      mesh,
      blockId: state.blockId,
      position,
      velocity,
      age: initialAge,
      bobOffset: state.bobOffset,
      settled,
      pickupDelay: state.pickupDelay,
      createdAt: state.createdAt,
      pendingClaim: false,
    });
  }

  private applyStateToDrop(
    drop: ItemDrop,
    state: MultiplayerDropState
  ): void {
    const initialAge = Math.max(0, (Date.now() - state.createdAt) / 1000);
    if (state.blockId !== drop.blockId) {
      this.scene.remove(drop.mesh);
      drop.mesh.geometry.dispose();
      drop.mesh = this.buildDropMesh(state.blockId);
      this.scene.add(drop.mesh);
    }
    drop.blockId = state.blockId;
    drop.position.set(state.x, state.y, state.z);
    drop.velocity.set(state.vx, state.vy, state.vz);
    drop.age = initialAge;
    drop.bobOffset = state.bobOffset;
    drop.pickupDelay = state.pickupDelay;
    drop.createdAt = state.createdAt;
    drop.pendingClaim = false;
    drop.settled = initialAge > 1 || drop.velocity.lengthSq() === 0;
    drop.mesh.position.copy(drop.position);
  }

  private async tryPickup(dropId: string): Promise<void> {
    const drop = this.drops.get(dropId);
    if (!drop || drop.pendingClaim) return;
    if (!useHotbarStore.getState().canAddItem(drop.blockId)) return;

    // Save blockId BEFORE the async claim — the remote subscription
    // callback can delete the drop from our map while we await.
    const blockId = drop.blockId;
    drop.pendingClaim = true;

    // Try to claim via shared state so other players see the drop
    // disappear.  If the claim fails we still pick up locally.
    try {
      if (this.claimDrop) await this.claimDrop(dropId);
    } catch {
      // Claim failed — continue with local pickup
    }

    // The drop may have been removed from our map by a remote
    // subscription callback during the await — that's fine, we
    // already have the blockId saved above.
    const added = useHotbarStore.getState().addItem(blockId);
    if (added) {
      // Drop might already be gone from the map (remote callback),
      // but removeDrop handles missing entries gracefully.
      this.removeDrop(dropId);
      return;
    }

    // Inventory full — re-drop the item
    const current = this.drops.get(dropId);
    if (!current) return;
    current.pendingClaim = false;
    current.pickupDelay = 0;
    current.age = 0;
    current.createdAt = Date.now();
    current.velocity.set(0, 0, 0);
    current.settled = true;
    this.onDropSpawn?.({
      dropId: current.dropId,
      blockId: current.blockId,
      x: current.position.x,
      y: current.position.y,
      z: current.position.z,
      vx: 0,
      vy: 0,
      vz: 0,
      bobOffset: current.bobOffset,
      pickupDelay: 0,
      createdAt: current.createdAt,
    });
  }

  private scheduleRemoval(dropId: string): void {
    const drop = this.drops.get(dropId);
    if (!drop || drop.pendingClaim) return;

    drop.pendingClaim = true;
    if (!this.claimDrop) {
      this.removeDrop(dropId);
      return;
    }

    void this.claimDrop(dropId)
      .then(() => {
        this.removeDrop(dropId);
      })
      .catch(() => {
        const current = this.drops.get(dropId);
        if (current) {
          current.pendingClaim = false;
        }
      });
  }

  private removeDrop(dropId: string): void {
    const drop = this.drops.get(dropId);
    if (!drop) return;

    this.scene.remove(drop.mesh);
    drop.mesh.geometry.dispose();
    const material = drop.mesh.material as THREE.Material;
    if (material !== this.blockMaterial && material !== this.itemMaterial) {
      material.dispose();
    }
    this.drops.delete(dropId);
  }

  dispose(): void {
    for (const dropId of [...this.drops.keys()]) {
      this.removeDrop(dropId);
    }
    this.blockMaterial?.dispose();
    this.itemMaterial?.dispose();
    this.blockMaterial = null;
    this.itemMaterial = null;
  }
}
