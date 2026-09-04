import * as THREE from "three";
import { BLOCK_ID } from "@data/blocks";
import { BLOCK_HEX_COLORS } from "@data/items";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import type { TextureAtlas } from "@engine/renderer/TextureAtlas";

export type HandState = "idle" | "walking" | "breaking" | "placing";

const BLOCK_COLORS = BLOCK_HEX_COLORS;
const BOX_FACE_OF_GROUP = ["side", "side", "top", "bottom", "side", "side"] as const;

function darkenColor(hex: number): number {
  const r = Math.floor(((hex >> 16) & 0xff) * 0.75);
  const g = Math.floor(((hex >> 8) & 0xff) * 0.75);
  const b = Math.floor((hex & 0xff) * 0.75);
  return (r << 16) | (g << 8) | b;
}

/** Remaps a geometry's default `uv` attribute onto one atlas sub-rectangle. */
function remapUVs(
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
 * First-person hand. All coordinates in camera-local space.
 * Camera looks down -Z. +X is right, +Y is up.
 */
export class HandRenderer {
  private readonly group: THREE.Group;
  private readonly armPivot: THREE.Group;
  private readonly fist: THREE.Mesh;
  private heldBlock: THREE.Mesh;
  private readonly heldBlockMat: THREE.MeshBasicMaterial;
  private readonly heldItemMat: THREE.MeshBasicMaterial;
  private readonly skinMat: THREE.MeshBasicMaterial;
  private readonly skinDarkMat: THREE.MeshBasicMaterial;
  private readonly registry = BlockRegistry.getInstance();
  private time = 0;
  private placeTimer = 0;
  private heldBlockId: number = BLOCK_ID.AIR;

  constructor(
    camera: THREE.PerspectiveCamera,
    skinColor = 0xc8a882,
    private readonly atlas: TextureAtlas | null = null
  ) {
    this.group = new THREE.Group();
    this.armPivot = new THREE.Group();

    // Materials — depthTest false so they render on top of world
    this.skinMat = new THREE.MeshBasicMaterial({ color: skinColor, depthTest: false });
    this.skinDarkMat = new THREE.MeshBasicMaterial({ color: darkenColor(skinColor), depthTest: false });
    const skin = this.skinMat;
    const skinDark = this.skinDarkMat;

    // Arm segments — LARGE so they're visible at z=-0.5 distance
    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), skin);
    upperArm.position.set(0, -0.2, 0);

    const lowerArm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.09), skinDark);
    lowerArm.position.set(0, -0.55, 0);

    this.fist = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.12), skin);
    this.fist.position.set(0, -0.75, 0);

    this.heldBlockMat = new THREE.MeshBasicMaterial({
      color: 0x888888,
      map: this.atlas?.getTexture() ?? null,
      depthTest: false,
    });
    this.heldItemMat = new THREE.MeshBasicMaterial({
      map: this.atlas?.getItemTexture() ?? null,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    this.heldBlock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), this.heldBlockMat);
    this.heldBlock.position.set(0, -0.73, 0);
    this.heldBlock.renderOrder = 999;
    this.heldBlock.visible = false;

    this.armPivot.add(upperArm, lowerArm, this.fist, this.heldBlock);
    this.group.add(this.armPivot);

    // POSITION: bottom-right, Minecraft-style
    this.group.position.set(0.45, -0.45, -0.5);

    // ROTATION: arm angled naturally like holding out in front
    this.group.rotation.order = "ZXY";
    this.group.rotation.x = -0.15;
    this.group.rotation.y = -0.3;
    this.group.rotation.z = 0.1;

    // Ensure renders on top
    this.group.renderOrder = 999;
    this.group.traverse((c) => {
      if (c instanceof THREE.Mesh) c.renderOrder = 999;
    });

    camera.add(this.group);

  }

  setHeldBlock(blockId: number): void {
    if (blockId === BLOCK_ID.AIR || blockId === 0) {
      this.heldBlock.visible = false;
      this.fist.visible = true;
      this.heldBlockId = blockId;
      return;
    }

    this.heldBlock.visible = true;
    this.fist.visible = false;
    if (blockId === this.heldBlockId) return;
    this.heldBlockId = blockId;

    const position = this.heldBlock.position.clone();
    this.armPivot.remove(this.heldBlock);
    this.heldBlock.geometry.dispose();
    this.heldBlock = HandRenderer.buildHeldMesh(
      blockId,
      this.registry,
      this.atlas,
      this.heldBlockMat,
      this.heldItemMat
    );
    this.heldBlock.position.copy(position);
    this.heldBlock.renderOrder = 999;
    this.armPivot.add(this.heldBlock);
  }

  /**
   * Chooses the held mesh by data: a block with a side texture and a loaded
   * block atlas gets an atlas-UV'd cube; a block-less item with an icon tile
   * gets a textured quad; anything else falls back to a flat-coloured cube
   * so tests and the no-atlas case still work.
   */
  private static buildHeldMesh(
    blockId: number,
    registry: BlockRegistry,
    atlas: TextureAtlas | null,
    blockMat: THREE.MeshBasicMaterial,
    itemMat: THREE.MeshBasicMaterial
  ): THREE.Mesh {
    const def = registry.getBlock(blockId);

    if (def && def.textures.side !== "" && atlas?.getTexture()) {
      blockMat.color.setHex(0xffffff);
      const geometry = new THREE.BoxGeometry(0.14, 0.14, 0.14);
      for (let group = 0; group < BOX_FACE_OF_GROUP.length; group++) {
        const rect = atlas.getBlockFaceUVs(blockId, BOX_FACE_OF_GROUP[group]);
        remapUVs(geometry, rect, group * 4, 4);
      }
      return new THREE.Mesh(geometry, blockMat);
    }

    const itemRect = atlas?.getItemUVs(blockId);
    if (itemRect && atlas?.getItemTexture()) {
      const geometry = new THREE.PlaneGeometry(0.16, 0.16);
      remapUVs(geometry, itemRect, 0, 4);
      return new THREE.Mesh(geometry, itemMat);
    }

    blockMat.color.setHex(BLOCK_COLORS[blockId] ?? 0x888888);
    return new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), blockMat);
  }

  update(dt: number, state: HandState): void {
    this.time += dt;
    if (this.placeTimer > 0) this.placeTimer = Math.max(0, this.placeTimer - dt);

    switch (state) {
      case "breaking":
        this.armPivot.rotation.x = Math.abs(Math.sin(this.time * 6)) * 0.6;
        break;
      case "placing":
        this.placeTimer = 0.15;
        this.armPivot.rotation.x = 0.3;
        break;
      case "walking":
        this.armPivot.rotation.x = Math.sin(this.time * 8) * 0.06;
        break;
      default:
        this.armPivot.rotation.x = Math.sin(this.time * 1.5) * 0.015;
        break;
    }

    if (this.placeTimer > 0 && state !== "placing") {
      this.armPivot.rotation.x = 0.3 * (this.placeTimer / 0.15);
    }
  }

  setSkinColor(color: number): void {
    this.skinMat.color.setHex(color);
    this.skinDarkMat.color.setHex(darkenColor(color));
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
      }
    });
  }
}
