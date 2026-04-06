import { InputManager } from "@engine/InputManager";
import { Camera } from "@engine/player/Camera";
import { BlockRegistry } from "@engine/world/BlockRegistry";

const MOVE_SPEED = 5;
const GRAVITY = 20;
const JUMP_VELOCITY = 8;
const HALF_WIDTH = 0.3;
const HEIGHT = 1.8;

/**
 * First-person player controller with WASD movement, gravity, jumping,
 * and AABB collision against solid blocks.
 */
export class PlayerController {
  public position: { x: number; y: number; z: number };
  public velocity = { x: 0, y: 0, z: 0 };
  public onGround = false;

  constructor(spawnX: number, spawnY: number, spawnZ: number) {
    this.position = { x: spawnX, y: spawnY, z: spawnZ };
  }

  /**
   * Updates player position based on input, gravity, and collision.
   *
   * @param dt - Delta time in seconds
   * @param input - Input manager for key state
   * @param camera - Camera for movement direction
   * @param getBlock - Block lookup function (world coords → block ID)
   * @param registry - Block registry for solid checks
   */
  update(
    dt: number,
    input: InputManager,
    camera: Camera,
    getBlock: (wx: number, wy: number, wz: number) => number,
    registry: BlockRegistry
  ): void {
    // Movement input
    const forward = camera.getForward();
    const right = camera.getRight();

    let moveX = 0;
    let moveZ = 0;

    if (input.isKeyDown("KeyW")) {
      moveX += forward.x;
      moveZ += forward.z;
    }
    if (input.isKeyDown("KeyS")) {
      moveX -= forward.x;
      moveZ -= forward.z;
    }
    if (input.isKeyDown("KeyA")) {
      moveX -= right.x;
      moveZ -= right.z;
    }
    if (input.isKeyDown("KeyD")) {
      moveX += right.x;
      moveZ += right.z;
    }

    // Normalize horizontal movement
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) {
      moveX = (moveX / len) * MOVE_SPEED;
      moveZ = (moveZ / len) * MOVE_SPEED;
    }

    this.velocity.x = moveX;
    this.velocity.z = moveZ;

    // Gravity
    if (!this.onGround) {
      this.velocity.y -= GRAVITY * dt;
    }

    // Jump
    if (input.isKeyDown("Space") && this.onGround) {
      this.velocity.y = JUMP_VELOCITY;
      this.onGround = false;
    }

    // Debug: log collision state every ~60 frames
    if (!this.onGround && Math.random() < 0.016) {
      const testBlock = getBlock(
        Math.floor(this.position.x),
        Math.floor(this.position.y - 1),
        Math.floor(this.position.z)
      );
      console.log(
        `[Collision] pos=(${this.position.x.toFixed(1)},${this.position.y.toFixed(1)},${this.position.z.toFixed(1)})`,
        `block below=${testBlock}, solid=${registry.isSolid(testBlock)}`,
        `vel.y=${this.velocity.y.toFixed(1)}, onGround=${this.onGround}`
      );
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
    this.position[axis] += delta;

    // Player AABB: centered on X/Z, feet at position.y
    const minX = this.position.x - HALF_WIDTH;
    const maxX = this.position.x + HALF_WIDTH;
    const minY = this.position.y;
    const maxY = this.position.y + HEIGHT;
    const minZ = this.position.z - HALF_WIDTH;
    const maxZ = this.position.z + HALF_WIDTH;

    // Check blocks in the region the player overlaps
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

          // Block AABB: [bx, bx+1] x [by, by+1] x [bz, bz+1]
          // Resolve overlap on the current axis
          if (axis === "y") {
            if (delta < 0) {
              // Moving down — push up to top of block
              this.position.y = by + 1;
              this.velocity.y = 0;
              this.onGround = true;
            } else if (delta > 0) {
              // Moving up — push down to bottom of block
              this.position.y = by - HEIGHT;
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

    // No collision on Y-down → not on ground
    if (axis === "y" && delta <= 0) {
      this.onGround = false;
    }
  }
}
