import * as THREE from "three";

/**
 * Renders a darkening overlay on the block being broken.
 * Slightly oversized to prevent z-fighting with block faces.
 */
export class BlockBreakOverlay {
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;

  constructor() {
    const geometry = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.visible = false;
  }

  /** Returns the mesh to add to the scene. */
  getMesh(): THREE.Mesh {
    return this.mesh;
  }

  /** Update overlay position and opacity based on break progress. */
  update(
    target: { x: number; y: number; z: number } | null,
    progress: number
  ): void {
    if (!target || progress <= 0) {
      this.mesh.visible = false;
      return;
    }

    this.mesh.visible = true;
    this.mesh.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
    this.material.opacity = progress * 0.5;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
