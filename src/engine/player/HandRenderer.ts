import * as THREE from "three";

export type HandState = "idle" | "walking" | "breaking" | "placing";

/**
 * First-person hand/arm visible in the bottom-right of the screen.
 * Attached as a child of the camera so it moves with the view.
 */
export class HandRenderer {
  private readonly group: THREE.Group;
  private time = 0;
  private placeTimer = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.group = new THREE.Group();

    const skin = new THREE.MeshLambertMaterial({ color: 0xc8a882 });

    // Forearm
    const forearm = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.4, 0.12),
      skin
    );
    forearm.position.set(0, -0.1, 0);
    this.group.add(forearm);

    // Hand (slightly wider)
    const hand = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.12, 0.14),
      skin
    );
    hand.position.set(0, -0.36, 0);
    this.group.add(hand);

    // Position relative to camera: bottom-right
    this.group.position.set(0.35, -0.35, -0.5);
    this.group.rotation.set(0, 0, -0.1);

    camera.add(this.group);
  }

  /** Update animation based on player state. */
  update(dt: number, state: HandState): void {
    this.time += dt;

    // Decay place timer
    if (this.placeTimer > 0) {
      this.placeTimer -= dt;
    }

    switch (state) {
      case "breaking": {
        // Repeated forward swing
        const swingCycle = (this.time * 6) % (Math.PI * 2);
        this.group.rotation.x = -Math.abs(Math.sin(swingCycle)) * 0.6;
        this.group.position.y = -0.35 + Math.sin(swingCycle * 2) * 0.02;
        break;
      }
      case "placing": {
        // Quick thrust forward
        this.placeTimer = 0.15;
        this.group.rotation.x = -0.4;
        this.group.position.z = -0.45;
        break;
      }
      case "walking": {
        // Vertical bob
        this.group.rotation.x = 0;
        this.group.position.y = -0.35 + Math.sin(this.time * 8) * 0.015;
        this.group.position.z = -0.5;
        break;
      }
      default: {
        // Idle: gentle sway
        this.group.rotation.x = 0;
        this.group.position.y = -0.35 + Math.sin(this.time * 2) * 0.005;
        this.group.position.z = -0.5;
        break;
      }
    }

    // Smooth return from place thrust
    if (this.placeTimer > 0 && state !== "placing") {
      const t = this.placeTimer / 0.15;
      this.group.rotation.x = -0.4 * t;
      this.group.position.z = -0.5 + 0.05 * t;
    }
  }

  /** Show or hide the hand. */
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
