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
 * First-person hand. All coordinates in camera-local space.
 * Camera looks down -Z. +X is right, +Y is up.
 */
export class HandRenderer {
  private readonly group: THREE.Group;
  private readonly armPivot: THREE.Group;
  private readonly fist: THREE.Mesh;
  private readonly heldBlock: THREE.Mesh;
  private readonly heldBlockMat: THREE.MeshBasicMaterial;
  private time = 0;
  private placeTimer = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.group = new THREE.Group();
    this.armPivot = new THREE.Group();

    // Materials — depthTest false so they render on top of world
    const skin = new THREE.MeshBasicMaterial({ color: 0xc8a882, depthTest: false });
    const skinDark = new THREE.MeshBasicMaterial({ color: 0xa07850, depthTest: false });

    // Arm segments going DOWN from pivot (negative Y)
    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.06), skin);
    upperArm.position.set(0, -0.125, 0);

    const lowerArm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.2, 0.055), skinDark);
    lowerArm.position.set(0, -0.35, 0);

    this.fist = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.05, 0.075), skin);
    this.fist.position.set(0, -0.48, 0);

    this.heldBlockMat = new THREE.MeshBasicMaterial({ color: 0x888888, depthTest: false });
    this.heldBlock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), this.heldBlockMat);
    this.heldBlock.position.set(0, -0.47, 0);
    this.heldBlock.visible = false;

    this.armPivot.add(upperArm, lowerArm, this.fist, this.heldBlock);
    this.group.add(this.armPivot);

    // POSITION: bottom-right of screen
    // x=0.3 pushes right, y=-0.15 pushes down, z=-0.5 is half a meter in front
    this.group.position.set(0.3, -0.15, -0.5);

    // ROTATION: tilt arm so it angles from lower-right toward screen center
    // Rotate around Z to lean left, around X to point forward slightly
    this.group.rotation.order = "ZXY";
    this.group.rotation.z = 0.3;   // lean arm to the left
    this.group.rotation.x = -0.5;  // tilt forward

    // Ensure renders on top
    this.group.renderOrder = 999;
    this.group.traverse((c) => {
      if (c instanceof THREE.Mesh) c.renderOrder = 999;
    });

    camera.add(this.group);

    console.log("[Hand] Created at", this.group.position.toArray(), "rot", this.group.rotation.toArray());
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
