import * as THREE from "three";

export type HandState = "idle" | "walking" | "breaking" | "placing";

/**
 * First-person hand/arm visible in the bottom-right of the screen.
 * Attached as a child of the camera so it moves with the view.
 */
export class HandRenderer {
  private readonly group: THREE.Group;
  private readonly arm: THREE.Group;
  private time = 0;
  private placeTimer = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.group = new THREE.Group();
    this.arm = new THREE.Group();

    const skin = new THREE.MeshBasicMaterial({ color: 0xc8a882, depthTest: false });
    const skinDark = new THREE.MeshBasicMaterial({ color: 0xb89872, depthTest: false });

    // Small arm segments — sized for close-to-camera viewing
    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.04), skin);
    upperArm.position.set(0, 0, 0);
    this.arm.add(upperArm);

    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.035), skinDark);
    forearm.position.set(0, -0.11, 0);
    this.arm.add(forearm);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.05), skin);
    hand.position.set(0, -0.18, -0.005);
    this.arm.add(hand);

    this.arm.position.set(0, 0.02, 0);
    this.group.add(this.arm);

    // Position: bottom-right corner, close to camera
    this.group.position.set(0.12, -0.1, -0.2);
    this.group.rotation.set(-0.3, -0.15, -0.1);
    this.group.renderOrder = 999;

    camera.add(this.group);
  }

  update(dt: number, state: HandState): void {
    this.time += dt;

    if (this.placeTimer > 0) {
      this.placeTimer = Math.max(0, this.placeTimer - dt);
    }

    switch (state) {
      case "breaking": {
        const swing = Math.sin(this.time * 5);
        this.arm.rotation.x = -Math.abs(swing) * 0.6;
        this.group.position.y = -0.1 + Math.abs(swing) * 0.01;
        break;
      }
      case "placing": {
        this.placeTimer = 0.2;
        this.arm.rotation.x = -0.4;
        this.group.position.z = -0.17;
        break;
      }
      case "walking": {
        this.arm.rotation.x = Math.sin(this.time * 8) * 0.08;
        this.group.position.y = -0.1 + Math.sin(this.time * 8) * 0.005;
        this.group.position.z = -0.2;
        break;
      }
      default: {
        this.arm.rotation.x = Math.sin(this.time * 1.5) * 0.02;
        this.group.position.y = -0.1 + Math.sin(this.time * 1.5) * 0.002;
        this.group.position.z = -0.2;
        break;
      }
    }

    if (this.placeTimer > 0 && state !== "placing") {
      const t = this.placeTimer / 0.2;
      this.arm.rotation.x = -0.4 * t;
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
