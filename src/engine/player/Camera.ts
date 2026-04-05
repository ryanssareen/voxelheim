import * as THREE from "three";

const MAX_PITCH = (89 * Math.PI) / 180;
const EYE_HEIGHT = 1.6;

/**
 * First-person camera with yaw/pitch mouse-look.
 * Pitch is clamped to ±89 degrees to prevent gimbal flipping.
 */
export class Camera {
  public yaw = 0;
  public pitch = 0;

  /** Updates yaw and pitch from mouse delta. */
  update(dx: number, dy: number, sensitivity: number): void {
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
  }

  /** Forward direction on the XZ plane (yaw only, for movement). */
  getForward(): { x: number; y: number; z: number } {
    return {
      x: -Math.sin(this.yaw),
      y: 0,
      z: -Math.cos(this.yaw),
    };
  }

  /** Right direction on the XZ plane (perpendicular to forward). */
  getRight(): { x: number; y: number; z: number } {
    return {
      x: Math.cos(this.yaw),
      y: 0,
      z: -Math.sin(this.yaw),
    };
  }

  /** Full 3D look direction including pitch (for raycasting). */
  getLookDirection(): { x: number; y: number; z: number } {
    const cosPitch = Math.cos(this.pitch);
    return {
      x: -Math.sin(this.yaw) * cosPitch,
      y: Math.sin(this.pitch),
      z: -Math.cos(this.yaw) * cosPitch,
    };
  }

  /** Applies position and rotation to a Three.js PerspectiveCamera. */
  applyToThreeCamera(
    camera: THREE.PerspectiveCamera,
    position: { x: number; y: number; z: number }
  ): void {
    camera.position.set(position.x, position.y + EYE_HEIGHT, position.z);
    camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }
}
