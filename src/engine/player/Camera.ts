import * as THREE from "three";

const MAX_PITCH = (89 * Math.PI) / 180;
const EYE_HEIGHT = 1.6;

/** Camera perspective modes, cycled with P. */
export type CameraMode = "first-person" | "third-person-back" | "third-person-front";

const THIRD_PERSON_DISTANCE = 5;
/** Closest the camera may sit to the eye before it is effectively first-person. */
const THIRD_PERSON_MIN_DISTANCE = 0.35;
/** Gap left between the camera and the blocking surface. Exceeds the 0.1 near plane. */
const THIRD_PERSON_SURFACE_MARGIN = 0.3;
/** Probe granularity along the boom. Finer than the margin so no block is skipped. */
const THIRD_PERSON_PROBE_STEP = 0.15;

/** Reports whether the block containing a world position is solid. */
export type SolidityProbe = (x: number, y: number, z: number) => boolean;

/**
 * First-person camera with yaw/pitch mouse-look and P perspective cycling.
 */
export class Camera {
  public yaw = 0;
  public pitch = 0;
  public mode: CameraMode = "first-person";

  /** Cycles through camera modes: 1st → 3rd back → 3rd front → 1st. */
  cycleMode(): void {
    if (this.mode === "first-person") {
      this.mode = "third-person-back";
    } else if (this.mode === "third-person-back") {
      this.mode = "third-person-front";
    } else {
      this.mode = "first-person";
    }
  }

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

  /**
   * How far the third-person boom can extend from the eye before it would enter
   * a solid block. Marches out from the eye and stops short of the first hit, so
   * backing into a wall or standing in a tunnel pulls the camera in instead of
   * burying it in terrain.
   */
  private clearBoomDistance(
    eyeX: number,
    eyeY: number,
    eyeZ: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    isSolidAt: SolidityProbe
  ): number {
    const steps = Math.ceil(THIRD_PERSON_DISTANCE / THIRD_PERSON_PROBE_STEP);
    for (let i = 1; i <= steps; i++) {
      const t = Math.min(i * THIRD_PERSON_PROBE_STEP, THIRD_PERSON_DISTANCE);
      const solid = isSolidAt(
        Math.floor(eyeX + dirX * t),
        Math.floor(eyeY + dirY * t),
        Math.floor(eyeZ + dirZ * t)
      );
      if (solid) {
        return Math.max(THIRD_PERSON_MIN_DISTANCE, t - THIRD_PERSON_SURFACE_MARGIN);
      }
    }
    return THIRD_PERSON_DISTANCE;
  }

  /**
   * Applies position and rotation to a Three.js PerspectiveCamera.
   *
   * Pass `isSolidAt` so the third-person boom can shorten against terrain;
   * without it the boom always extends its full length.
   */
  applyToThreeCamera(
    camera: THREE.PerspectiveCamera,
    position: { x: number; y: number; z: number },
    eyeHeight: number = EYE_HEIGHT,
    isSolidAt?: SolidityProbe
  ): void {
    const eyeX = position.x;
    const eyeY = position.y + eyeHeight;
    const eyeZ = position.z;

    if (this.mode === "first-person") {
      camera.position.set(eyeX, eyeY, eyeZ);
      camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
    } else {
      const lookDir = this.getLookDirection();
      const sign = this.mode === "third-person-back" ? -1 : 1;

      // Direction the boom swings out along — away from the look direction when
      // behind the player, along it when in front.
      const boomX = lookDir.x * sign;
      const boomY = lookDir.y * sign;
      const boomZ = lookDir.z * sign;

      const dist = isSolidAt
        ? this.clearBoomDistance(eyeX, eyeY, eyeZ, boomX, boomY, boomZ, isSolidAt)
        : THIRD_PERSON_DISTANCE;

      camera.position.set(
        eyeX + boomX * dist,
        eyeY + boomY * dist,
        eyeZ + boomZ * dist
      );

      if (this.mode === "third-person-back") {
        // Look at player
        camera.lookAt(eyeX, eyeY, eyeZ);
      } else {
        // Front-facing: look away from player (same as 1st person direction)
        camera.lookAt(
          eyeX - lookDir.x * 10,
          eyeY - lookDir.y * 10,
          eyeZ - lookDir.z * 10
        );
      }
    }
  }
}
