import * as THREE from "three";

export type HandState = "idle" | "walking" | "breaking" | "placing";

/**
 * First-person hand/arm visible in the bottom-right of the screen.
 * Attached as a child of the camera so it moves with the view.
 * Uses MeshBasicMaterial (unlit) to guarantee visibility regardless of light position.
 */
export class HandRenderer {
  private readonly group: THREE.Group;
  private readonly arm: THREE.Group;
  private time = 0;
  private placeTimer = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.group = new THREE.Group();
    this.arm = new THREE.Group();

    const skin = new THREE.MeshBasicMaterial({ color: 0xc8a882 });
    const skinDark = new THREE.MeshBasicMaterial({ color: 0xb89872 });

    // Upper arm
    const upperArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.5, 0.18),
      skin
    );
    upperArm.position.set(0, 0, 0);
    this.arm.add(upperArm);

    // Forearm (slightly darker)
    const forearm = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.4, 0.16),
      skinDark
    );
    forearm.position.set(0, -0.45, 0);
    this.arm.add(forearm);

    // Hand/fist
    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.14, 0.2),
      skin
    );
    hand.position.set(0, -0.72, -0.02);
    this.arm.add(hand);

    // Pivot point at shoulder
    this.arm.position.set(0, 0.1, 0);

    this.group.add(this.arm);

    // Position the whole group relative to camera: bottom-right, closer
    this.group.position.set(0.45, -0.5, -0.65);
    this.group.rotation.set(-0.3, -0.2, -0.15);

    camera.add(this.group);
  }

  /** Update animation based on player state. */
  update(dt: number, state: HandState): void {
    this.time += dt;

    if (this.placeTimer > 0) {
      this.placeTimer = Math.max(0, this.placeTimer - dt);
    }

    switch (state) {
      case "breaking": {
        // Repeated mining swing — arm rotates forward and back
        const swingCycle = (this.time * 5) % (Math.PI * 2);
        const swing = Math.sin(swingCycle);
        this.arm.rotation.x = -Math.abs(swing) * 0.8;
        this.group.position.y = -0.5 + Math.abs(swing) * 0.03;
        break;
      }
      case "placing": {
        // Quick forward thrust
        this.placeTimer = 0.2;
        this.arm.rotation.x = -0.5;
        this.group.position.z = -0.55;
        break;
      }
      case "walking": {
        // Bob up and down with slight swing
        this.arm.rotation.x = Math.sin(this.time * 8) * 0.1;
        this.group.position.y = -0.5 + Math.sin(this.time * 8) * 0.02;
        this.group.position.z = -0.65;
        break;
      }
      default: {
        // Idle: gentle breathing sway
        this.arm.rotation.x = Math.sin(this.time * 1.5) * 0.03;
        this.group.position.y = -0.5 + Math.sin(this.time * 1.5) * 0.005;
        this.group.position.z = -0.65;
        break;
      }
    }

    // Smooth return from place thrust
    if (this.placeTimer > 0 && state !== "placing") {
      const t = this.placeTimer / 0.2;
      this.arm.rotation.x = -0.5 * t;
      this.group.position.z = -0.65 + 0.1 * t;
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
