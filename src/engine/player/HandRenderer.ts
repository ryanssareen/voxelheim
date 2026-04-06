import * as THREE from "three";

export type HandState = "idle" | "walking" | "breaking" | "placing";

/**
 * First-person hand visible in the bottom-right corner.
 * Tiny arm attached to camera, rendered on top of everything.
 */
export class HandRenderer {
  private readonly group: THREE.Group;
  private readonly pivot: THREE.Group;
  private time = 0;
  private placeTimer = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.group = new THREE.Group();
    this.pivot = new THREE.Group();

    // Use unlit materials so they're always visible, skip depth test to render on top
    const skin = new THREE.MeshBasicMaterial({ color: 0xc8a882, depthTest: false });

    // Single blocky arm piece — simple like Minecraft
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.08, 0.025), skin);
    arm.position.set(0, -0.04, 0);
    this.pivot.add(arm);

    // Fist at the end
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.018, 0.028), skin);
    fist.position.set(0, -0.085, -0.003);
    this.pivot.add(fist);

    this.group.add(this.pivot);

    // Position in bottom-right corner of view — very small and out of the way
    this.group.position.set(0.08, -0.07, -0.12);
    this.group.rotation.set(-0.5, -0.2, -0.1);
    this.group.renderOrder = 999;

    camera.add(this.group);
  }

  update(dt: number, state: HandState): void {
    this.time += dt;

    if (this.placeTimer > 0) this.placeTimer = Math.max(0, this.placeTimer - dt);

    switch (state) {
      case "breaking":
        this.pivot.rotation.x = -Math.abs(Math.sin(this.time * 5)) * 0.5;
        break;
      case "placing":
        this.placeTimer = 0.15;
        this.pivot.rotation.x = -0.3;
        break;
      case "walking":
        this.pivot.rotation.x = Math.sin(this.time * 8) * 0.06;
        break;
      default:
        this.pivot.rotation.x = Math.sin(this.time * 1.5) * 0.015;
        break;
    }

    if (this.placeTimer > 0 && state !== "placing") {
      this.pivot.rotation.x = -0.3 * (this.placeTimer / 0.15);
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
