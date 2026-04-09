import { InputManager } from "@engine/InputManager";
import { Camera } from "@engine/player/Camera";
import { BlockRegistry } from "@engine/world/BlockRegistry";

const WALK_SPEED = 5;
const SPRINT_SPEED = 8;
const CROUCH_SPEED = 2.5;
const GRAVITY = 20;
const JUMP_VELOCITY = 8;
const HALF_WIDTH = 0.3;
const STAND_HEIGHT = 1.8;
const CROUCH_HEIGHT = 1.4;

/**
 * First-person player controller with WASD movement, sprint (Shift),
 * crouch (Ctrl/CapsLock), gravity, jumping, and AABB collision.
 */
export class PlayerController {
  public position: { x: number; y: number; z: number };
  public velocity = { x: 0, y: 0, z: 0 };
  public onGround = false;
  public isCrouching = false;
  public isSprinting = false;

  constructor(spawnX: number, spawnY: number, spawnZ: number) {
    this.position = { x: spawnX, y: spawnY, z: spawnZ };
  }

  get height(): number {
    return this.isCrouching ? CROUCH_HEIGHT : STAND_HEIGHT;
  }

  applyKnockback(fromX: number, fromZ: number, force: number): void {
    const dx = this.position.x - fromX;
    const dz = this.position.z - fromZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.01) {
      this.velocity.x = (dx / dist) * force;
      this.velocity.z = (dz / dist) * force;
    }
    this.velocity.y = force * 0.4;
    this.onGround = false;
  }

  update(
    dt: number,
    input: InputManager,
    camera: Camera,
    getBlock: (wx: number, wy: number, wz: number) => number,
    registry: BlockRegistry
  ): void {
    this.isCrouching =
      input.isKeyDown("ControlLeft") ||
      input.isKeyDown("ControlRight") ||
      input.isKeyDown("CapsLock");

    this.isSprinting =
      !this.isCrouching &&
      (input.isKeyDown("ShiftLeft") || input.isKeyDown("ShiftRight"));

    const forward = camera.getForward();
    const right = camera.getRight();

    let moveX = 0;
    let moveZ = 0;

    if (input.isKeyDown("KeyW")) { moveX += forward.x; moveZ += forward.z; }
    if (input.isKeyDown("KeyS")) { moveX -= forward.x; moveZ -= forward.z; }
    if (input.isKeyDown("KeyA")) { moveX -= right.x; moveZ -= right.z; }
    if (input.isKeyDown("KeyD")) { moveX += right.x; moveZ += right.z; }

    const speed = this.isCrouching ? CROUCH_SPEED : this.isSprinting ? SPRINT_SPEED : WALK_SPEED;
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) {
      moveX = (moveX / len) * speed;
      moveZ = (moveZ / len) * speed;
    }

    this.velocity.x = moveX;
    this.velocity.z = moveZ;

    if (!this.onGround) {
      this.velocity.y -= GRAVITY * dt;
      if (this.velocity.y < -15) this.velocity.y = -15; // cap fall speed
    }

    if (input.isKeyDown("Space") && this.onGround && !this.isCrouching) {
      this.velocity.y = JUMP_VELOCITY;
      this.onGround = false;
    }

    // Move and collide axis-by-axis: Y first, then X, then Z
    this.moveAxis("y", this.velocity.y * dt, getBlock, registry);
    this.moveAxis("x", this.velocity.x * dt, getBlock, registry);
    this.moveAxis("z", this.velocity.z * dt, getBlock, registry);
  }

  private moveAxis(
    axis: "x" | "y" | "z",
    delta: number,
    getBlock: (wx: number, wy: number, wz: number) => number,
    registry: BlockRegistry
  ): void {
    if (delta === 0) return;

    this.position[axis] += delta;

    const h = this.height;
    const minX = this.position.x - HALF_WIDTH;
    const maxX = this.position.x + HALF_WIDTH;
    const minY = this.position.y;
    const maxY = this.position.y + h;
    const minZ = this.position.z - HALF_WIDTH;
    const maxZ = this.position.z + HALF_WIDTH;

    const bMinX = Math.floor(minX);
    const bMaxX = Math.floor(maxX);
    const bMinY = Math.floor(minY);
    const bMaxY = Math.floor(maxY);
    const bMinZ = Math.floor(minZ);
    const bMaxZ = Math.floor(maxZ);

    for (let bx = bMinX; bx <= bMaxX; bx++) {
      for (let by = bMinY; by <= bMaxY; by++) {
        for (let bz = bMinZ; bz <= bMaxZ; bz++) {
          const blockId = getBlock(bx, by, bz);
          if (!registry.isSolid(blockId)) continue;

          // Simple collision: resolve and return immediately
          if (axis === "y") {
            if (delta < 0) {
              this.position.y = by + 1;
              this.velocity.y = 0;
              this.onGround = true;
            } else if (delta > 0) {
              this.position.y = by - h;
              this.velocity.y = 0;
            }
            return;
          } else if (axis === "x") {
            if (delta < 0) {
              this.position.x = bx + 1 + HALF_WIDTH;
            } else {
              this.position.x = bx - HALF_WIDTH;
            }
            this.velocity.x = 0;
            return;
          } else {
            if (delta < 0) {
              this.position.z = bz + 1 + HALF_WIDTH;
            } else {
              this.position.z = bz - HALF_WIDTH;
            }
            this.velocity.z = 0;
            return;
          }
        }
      }
    }

    if (axis === "y" && delta <= 0) {
      this.onGround = false;
    }
  }
}
