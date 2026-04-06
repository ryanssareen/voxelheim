import * as THREE from "three";

export type HandState = "idle" | "walking" | "breaking" | "placing";

/**
 * Minecraft-style first-person arm in the bottom-right of the screen.
 * Large blocky arm extending from off-screen, showing forearm and fist.
 */
export class HandRenderer {
  private readonly group: THREE.Group;
  private readonly pivot: THREE.Group;
  private time = 0;
  private placeTimer = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.group = new THREE.Group();
    this.pivot = new THREE.Group();

    const skin = new THREE.MeshBasicMaterial({ color: 0xc8a882, depthTest: false });
    const skinShadow = new THREE.MeshBasicMaterial({ color: 0xa8845a, depthTest: false });

    // Upper arm (extends from off-screen)
    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), skin);
    upperArm.position.set(0, 0.06, 0);
    this.pivot.add(upperArm);

    // Forearm (slightly darker for depth)
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.14, 0.055), skinShadow);
    forearm.position.set(0, -0.1, 0);
    this.pivot.add(forearm);

    // Fist/hand block
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.07), skin);
    fist.position.set(0, -0.19, -0.008);
    this.pivot.add(fist);

    // Pivot at shoulder
    this.pivot.position.set(0, 0, 0);
    this.group.add(this.pivot);

    // Large, prominent position — bottom-right like Minecraft
    // Arm comes from below-right, angled inward
    this.group.position.set(0.14, -0.18, -0.2);
    this.group.rotation.set(-0.6, -0.3, -0.15);
    this.group.renderOrder = 999;

    camera.add(this.group);
  }

  update(dt: number, state: HandState): void {
    this.time += dt;

    if (this.placeTimer > 0) this.placeTimer = Math.max(0, this.placeTimer - dt);

    switch (state) {
      case "breaking": {
        // Mining swing — arm swings forward and back
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
        // Idle — gentle sway
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
