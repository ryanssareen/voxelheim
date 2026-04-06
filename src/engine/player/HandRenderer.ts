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
 * Minecraft-style first-person hand/held item.
 * Positioned in camera-local coordinates: +X is right, +Y is up, -Z is forward.
 */
export class HandRenderer {
  private readonly group: THREE.Group;
  private readonly armGroup: THREE.Group;
  private readonly heldBlock: THREE.Mesh;
  private readonly heldBlockMat: THREE.MeshBasicMaterial;
  private readonly fist: THREE.Mesh;
  private time = 0;
  private placeTimer = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.group = new THREE.Group();

    // Arm pivot — rotates for animations
    this.armGroup = new THREE.Group();

    const skin = new THREE.MeshBasicMaterial({ color: 0xc8a882, depthTest: false });
    const skinDark = new THREE.MeshBasicMaterial({ color: 0xa07850, depthTest: false });

    // Arm — vertical bar extending downward from shoulder
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.22, 0.045), skin);
    arm.position.set(0, -0.11, 0);
    this.armGroup.add(arm);

    // Forearm — continues down
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.12, 0.042), skinDark);
    forearm.position.set(0, -0.28, 0.01);
    this.armGroup.add(forearm);

    // Fist at the bottom
    this.fist = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.06), skin);
    this.fist.position.set(0, -0.36, 0.01);
    this.armGroup.add(this.fist);

    // Held block — replaces fist when holding something
    this.heldBlockMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
    this.heldBlock = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.06),
      this.heldBlockMat
    );
    this.heldBlock.position.set(0, -0.35, 0.01);
    this.heldBlock.visible = false;
    this.armGroup.add(this.heldBlock);

    this.group.add(this.armGroup);

    // Position in camera space: right side (+X), below center (-Y), in front (-Z)
    // These values place it in the bottom-right like Minecraft
    this.group.position.set(0.22, -0.22, -0.35);
    // Tilt the arm so it angles from bottom-right toward center
    this.group.rotation.set(-0.8, -0.4, 0.2);

    this.group.renderOrder = 999;
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.renderOrder = 999;
      }
    });

    camera.add(this.group);
  }

  setHeldBlock(blockId: number): void {
    if (blockId === BLOCK_ID.AIR || blockId === 0) {
      this.heldBlock.visible = false;
      this.fist.visible = true;
    } else {
      this.heldBlock.visible = true;
      this.fist.visible = false;
      this.heldBlockMat.color.setHex(BLOCK_COLORS[blockId] ?? 0x888888);
    }
  }

  update(dt: number, state: HandState): void {
    this.time += dt;
    if (this.placeTimer > 0) this.placeTimer = Math.max(0, this.placeTimer - dt);

    // All animations are on the armGroup pivot, not the positioning group
    switch (state) {
      case "breaking": {
        const swing = Math.sin(this.time * 6);
        this.armGroup.rotation.x = Math.abs(swing) * 0.6;
        break;
      }
      case "placing": {
        this.placeTimer = 0.15;
        this.armGroup.rotation.x = 0.3;
        break;
      }
      case "walking": {
        this.armGroup.rotation.x = Math.sin(this.time * 8) * 0.06;
        break;
      }
      default: {
        this.armGroup.rotation.x = Math.sin(this.time * 1.5) * 0.015;
        break;
      }
    }

    if (this.placeTimer > 0 && state !== "placing") {
      this.armGroup.rotation.x = 0.3 * (this.placeTimer / 0.15);
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
