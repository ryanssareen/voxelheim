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
const AUTO_JUMP_COOLDOWN = 0.35;
const MAX_FALL_SPEED = -10;
const MAX_STEP_SIZE = 0.45; // Max displacement per sub-step to prevent clipping

export class PlayerController {
  public position: { x: number; y: number; z: number };
  public velocity = { x: 0, y: 0, z: 0 };
  public onGround = false;
  public isCrouching = false;
  public isSprinting = false;

  private autoJumpCooldown = 0;
  private collidedBX = 0;
  private collidedBY = 0;
  private collidedBZ = 0;
  private hadHorizCollision = false;

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
      // Cap knockback velocity to prevent clipping
      const cappedForce = Math.min(force, 5);
      this.velocity.x = (dx / dist) * cappedForce;
      this.velocity.z = (dz / dist) * cappedForce;
    }
    this.velocity.y = Math.min(force * 0.4, 4);
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
      if (this.velocity.y < MAX_FALL_SPEED) this.velocity.y = MAX_FALL_SPEED;
    }

    if (input.isKeyDown("Space") && this.onGround && !this.isCrouching) {
      this.velocity.y = JUMP_VELOCITY;
      this.onGround = false;
    }

    if (this.autoJumpCooldown > 0) this.autoJumpCooldown -= dt;

    this.hadHorizCollision = false;

    // Move and collide: Y first, then X, then Z
    // Use sub-stepping for large displacements to prevent clipping
    this.moveAxisSafe("y", this.velocity.y * dt, getBlock, registry);

    // Ground probe: when standing (velocity.y == 0), moveAxisSafe skips Y
    // entirely so onGround is never cleared. Check if ground still exists.
    if (this.onGround && this.velocity.y === 0) {
      const belowY = Math.floor(this.position.y) - 1;
      const bMinX = Math.floor(this.position.x - HALF_WIDTH);
      const bMaxX = Math.floor(this.position.x + HALF_WIDTH);
      const bMinZ = Math.floor(this.position.z - HALF_WIDTH);
      const bMaxZ = Math.floor(this.position.z + HALF_WIDTH);

      let hasGround = false;
      for (let bx = bMinX; bx <= bMaxX && !hasGround; bx++) {
        for (let bz = bMinZ; bz <= bMaxZ && !hasGround; bz++) {
          if (registry.isSolid(getBlock(bx, belowY, bz))) {
            hasGround = true;
          }
        }
      }

      if (!hasGround) {
        this.onGround = false;
      }
    }

    this.moveAxisSafe("x", this.velocity.x * dt, getBlock, registry);
    this.moveAxisSafe("z", this.velocity.z * dt, getBlock, registry);

    // POST-COLLISION SAFETY: if player ended up inside a solid block, push them out
    this.resolveOverlap(getBlock, registry);

    // AUTO-JUMP: runs AFTER all collision is resolved
    // Guard: only when on ground, not crouching, cooldown expired,
    // NOT already moving upward (prevents stacking with manual jump)
    if (
      this.onGround &&
      !this.isCrouching &&
      this.autoJumpCooldown <= 0 &&
      this.hadHorizCollision &&
      this.velocity.y <= 0 // Don't auto-jump if already jumping
    ) {
      const cbx = this.collidedBX, cby = this.collidedBY, cbz = this.collidedBZ;
      const feetY = Math.floor(this.position.y);
      if (cby === feetY) {
        if (!registry.isSolid(getBlock(cbx, cby + 1, cbz)) &&
            !registry.isSolid(getBlock(cbx, cby + 2, cbz))) {
          const px = Math.floor(this.position.x);
          const pz = Math.floor(this.position.z);
          if (!registry.isSolid(getBlock(px, feetY + 2, pz))) {
            this.velocity.y = JUMP_VELOCITY;
            this.onGround = false;
            this.autoJumpCooldown = AUTO_JUMP_COOLDOWN;
          }
        }
      }
    }
  }

  /** Move with sub-stepping: breaks large displacements into safe-sized steps */
  private moveAxisSafe(
    axis: "x" | "y" | "z",
    totalDelta: number,
    getBlock: (wx: number, wy: number, wz: number) => number,
    registry: BlockRegistry
  ): void {
    if (totalDelta === 0) return;

    const absDelta = Math.abs(totalDelta);
    if (absDelta <= MAX_STEP_SIZE) {
      // Small enough — single step
      this.moveAxis(axis, totalDelta, getBlock, registry);
    } else {
      // Break into sub-steps
      const sign = totalDelta > 0 ? 1 : -1;
      let remaining = absDelta;
      while (remaining > 0.001) {
        const step = Math.min(remaining, MAX_STEP_SIZE);
        this.moveAxis(axis, step * sign, getBlock, registry);
        remaining -= step;
        // If collision stopped movement, don't continue
        if (axis === "y" && this.velocity.y === 0) break;
        if (axis === "x" && this.velocity.x === 0) break;
        if (axis === "z" && this.velocity.z === 0) break;
      }
    }
  }

  /** Post-collision safety: if player AABB overlaps solid blocks, push along minimum penetration axis */
  private resolveOverlap(
    getBlock: (wx: number, wy: number, wz: number) => number,
    registry: BlockRegistry
  ): void {
    const EPS = 0.001;
    const h = this.height;
    const minX = this.position.x - HALF_WIDTH;
    const maxX = this.position.x + HALF_WIDTH;
    const minY = this.position.y;
    const maxY = this.position.y + h;
    const minZ = this.position.z - HALF_WIDTH;
    const maxZ = this.position.z + HALF_WIDTH;

    // Scan all blocks the AABB overlaps — no EPS shrinkage here so we
    // never miss a block the player is genuinely inside.
    const bMinX = Math.floor(minX);
    const bMaxX = Math.floor(maxX);
    const bMinY = Math.floor(minY);
    const bMaxY = Math.floor(maxY);
    const bMinZ = Math.floor(minZ);
    const bMaxZ = Math.floor(maxZ);

    let bestPen = Infinity;
    let bestAxis: "x" | "y" | "z" | null = null;
    let bestDir = 0;
    let bestPush = 0;

    for (let bx = bMinX; bx <= bMaxX; bx++) {
      for (let by = bMinY; by <= bMaxY; by++) {
        for (let bz = bMinZ; bz <= bMaxZ; bz++) {
          if (!registry.isSolid(getBlock(bx, by, bz))) continue;

          const candidates: Array<{ pen: number; axis: "x" | "y" | "z"; dir: number; push: number }> = [
            { pen: (bx + 1) - minX, axis: "x", dir: 1, push: (bx + 1) + HALF_WIDTH + EPS },
            { pen: maxX - bx, axis: "x", dir: -1, push: bx - HALF_WIDTH - EPS },
            { pen: (by + 1) - minY, axis: "y", dir: 1, push: by + 1 },
            { pen: maxY - by, axis: "y", dir: -1, push: by - h },
            { pen: (bz + 1) - minZ, axis: "z", dir: 1, push: (bz + 1) + HALF_WIDTH + EPS },
            { pen: maxZ - bz, axis: "z", dir: -1, push: bz - HALF_WIDTH - EPS },
          ];
          for (const c of candidates) {
            // pen > EPS filters out point-touching (zero-area overlap) at boundaries
            if (c.pen > EPS && c.pen < bestPen) {
              bestPen = c.pen;
              bestAxis = c.axis;
              bestDir = c.dir;
              bestPush = c.push;
            }
          }
        }
      }
    }

    if (bestAxis !== null) {
      this.position[bestAxis] = bestPush;
      if (bestAxis === "y" && bestDir === 1) {
        this.velocity.y = 0;
        this.onGround = true;
      } else if (bestAxis === "y") {
        this.velocity.y = 0;
      }
      // X/Z pushes: leave onGround unchanged — no free jumps from wall clips
    }
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
            this.collidedBX = bx; this.collidedBY = by; this.collidedBZ = bz; this.hadHorizCollision = true;
            return;
          } else {
            if (delta < 0) {
              this.position.z = bz + 1 + HALF_WIDTH;
            } else {
              this.position.z = bz - HALF_WIDTH;
            }
            this.velocity.z = 0;
            this.collidedBX = bx; this.collidedBY = by; this.collidedBZ = bz; this.hadHorizCollision = true;
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
