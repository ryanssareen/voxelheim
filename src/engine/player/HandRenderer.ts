import * as THREE from "three";
import { BLOCK_ID } from "@data/blocks";

export type HandState = "idle" | "walking" | "breaking" | "placing";

const BLOCK_COLORS: Record<number, number> = {
  [BLOCK_ID.GRASS]: 0x5cb85c,
  [BLOCK_ID.DIRT]: 0x8d6e63,
  [BLOCK_ID.STONE]: 0x9e9e9e,
  [BLOCK_ID.SAND]: 0xfdd835,
  [BLOCK_ID.LOG]: 0x5d4037,
  [BLOCK_ID.LEAVES]: 0x2e7d32,
  [BLOCK_ID.CRYSTAL]: 0x00e5ff,
};

/**
 * Minecraft-style first-person arm. Shows held block when inventory has one selected.
 */
export class HandRenderer {
  private readonly group: THREE.Group;
  private readonly pivot: THREE.Group;
  private readonly armMeshes: THREE.Mesh[] = [];
  private readonly heldBlock: THREE.Mesh;
  private readonly heldBlockMaterial: THREE.MeshBasicMaterial;
  private time = 0;
  private placeTimer = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.group = new THREE.Group();
    this.pivot = new THREE.Group();

    const skin = new THREE.MeshBasicMaterial({ color: 0xc8a882, depthTest: false });
    const skinShadow = new THREE.MeshBasicMaterial({ color: 0xa8845a, depthTest: false });

    // Upper arm
    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), skin);
    upperArm.position.set(0, 0.06, 0);
    this.pivot.add(upperArm);
    this.armMeshes.push(upperArm);

    // Forearm
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.14, 0.055), skinShadow);
    forearm.position.set(0, -0.1, 0);
    this.pivot.add(forearm);
    this.armMeshes.push(forearm);

    // Fist
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.07), skin);
    fist.position.set(0, -0.19, -0.008);
    this.pivot.add(fist);
    this.armMeshes.push(fist);

    // Held block — displayed instead of bare hand when holding a block
    this.heldBlockMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
    this.heldBlock = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.07, 0.07),
      this.heldBlockMaterial
    );
    this.heldBlock.position.set(0, -0.17, -0.01);
    this.heldBlock.visible = false;
    this.heldBlock.renderOrder = 999;
    this.pivot.add(this.heldBlock);

    this.pivot.position.set(0, 0, 0);
    this.group.add(this.pivot);

    this.group.position.set(0.14, -0.18, -0.2);
    this.group.rotation.set(-0.6, -0.3, -0.15);
    this.group.renderOrder = 999;

    camera.add(this.group);
  }

  /** Update which block is held. Pass BLOCK_ID.AIR or 0 for empty hand. */
  setHeldBlock(blockId: number): void {
    if (blockId === BLOCK_ID.AIR || blockId === 0) {
      // Show bare hand
      this.heldBlock.visible = false;
      for (const m of this.armMeshes) m.visible = true;
    } else {
      // Show block, hide fist (keep arm visible)
      this.heldBlock.visible = true;
      this.heldBlockMaterial.color.setHex(BLOCK_COLORS[blockId] ?? 0x888888);
      // Hide just the fist, keep upper arm and forearm
      this.armMeshes[2].visible = false; // fist
    }
  }

  update(dt: number, state: HandState): void {
    this.time += dt;

    if (this.placeTimer > 0) this.placeTimer = Math.max(0, this.placeTimer - dt);

    switch (state) {
      case "breaking": {
        const swing = Math.sin(this.time * 6);
        this.pivot.rotation.x = -Math.abs(swing) * 0.7;
        this.group.position.y = -0.18 + Math.abs(swing) * 0.01;
        break;
      }
      case "placing": {
        this.placeTimer = 0.15;
        this.pivot.rotation.x = -0.4;
        this.group.position.z = -0.17;
        break;
      }
      case "walking": {
        this.pivot.rotation.x = Math.sin(this.time * 8) * 0.08;
        this.group.position.y = -0.18 + Math.sin(this.time * 8) * 0.008;
        this.group.position.z = -0.2;
        break;
      }
      default: {
        this.pivot.rotation.x = Math.sin(this.time * 1.5) * 0.02;
        this.group.position.y = -0.18 + Math.sin(this.time * 1.5) * 0.003;
        this.group.position.z = -0.2;
        break;
      }
    }

    if (this.placeTimer > 0 && state !== "placing") {
      const t = this.placeTimer / 0.15;
      this.pivot.rotation.x = -0.4 * t;
      this.group.position.z = -0.2 + 0.03 * t;
    }
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
