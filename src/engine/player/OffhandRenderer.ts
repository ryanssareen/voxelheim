import * as THREE from "three";
import { BLOCK_ID } from "@data/blocks";
import { BLOCK_HEX_COLORS } from "@data/items";

const BLOCK_COLORS = BLOCK_HEX_COLORS;

/**
 * First-person offhand (left hand). Mirrors HandRenderer to the left side.
 * All coordinates in camera-local space. Camera looks down -Z.
 */
export class OffhandRenderer {
  private readonly group: THREE.Group;
  private readonly armPivot: THREE.Group;
  private readonly fist: THREE.Mesh;
  private readonly heldBlock: THREE.Mesh;
  private readonly heldBlockMat: THREE.MeshBasicMaterial;
  private time = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.group = new THREE.Group();
    this.armPivot = new THREE.Group();

    const skin = new THREE.MeshBasicMaterial({ color: 0xc8a882, depthTest: false });
    const skinDark = new THREE.MeshBasicMaterial({ color: 0xa07850, depthTest: false });

    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), skin);
    upperArm.position.set(0, -0.2, 0);

    const lowerArm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.09), skinDark);
    lowerArm.position.set(0, -0.55, 0);

    this.fist = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.12), skin);
    this.fist.position.set(0, -0.75, 0);

    this.heldBlockMat = new THREE.MeshBasicMaterial({ color: 0x888888, depthTest: false });
    this.heldBlock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), this.heldBlockMat);
    this.heldBlock.position.set(0, -0.73, 0);
    this.heldBlock.visible = false;

    this.armPivot.add(upperArm, lowerArm, this.fist, this.heldBlock);
    this.group.add(this.armPivot);

    // Mirrored to left side
    this.group.position.set(-0.45, -0.45, -0.5);
    this.group.rotation.order = "ZXY";
    this.group.rotation.x = -0.15;
    this.group.rotation.y = 0.3;
    this.group.rotation.z = -0.1;

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
      this.group.visible = false;
    } else {
      this.heldBlock.visible = true;
      this.fist.visible = false;
      this.group.visible = true;
      this.heldBlockMat.color.setHex(BLOCK_COLORS[blockId] ?? 0x888888);
    }
  }

  update(dt: number, isWalking: boolean): void {
    this.time += dt;
    if (isWalking) {
      this.armPivot.rotation.x = Math.sin(this.time * 8 + Math.PI) * 0.06;
    } else {
      this.armPivot.rotation.x = Math.sin(this.time * 1.5 + Math.PI) * 0.015;
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
