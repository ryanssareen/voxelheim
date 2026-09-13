import { clampMoveVector } from "@engine/input/intents";
import type { IntentSnapshot } from "@engine/input/snapshot";
import { Camera } from "@engine/player/Camera";
import { firstBlockingLayer, maxBlock } from "@engine/physics";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { useSettingsStore } from "@store/useSettingsStore";

const WALK_SPEED = 5;
const SPRINT_SPEED = 8;
const CROUCH_SPEED = 2.5;
const GRAVITY = 20;
const JUMP_VELOCITY = 8;
const HALF_WIDTH = 0.3;
const STAND_HEIGHT = 1.8;
const CROUCH_HEIGHT = 1.4;
const MAX_FALL_SPEED = -40;
const MAX_STEP_SIZE = 0.45; // Max displacement per sub-step to prevent clipping
const AUTO_JUMP_VELOCITY = 7; // same impulse Mob.followPath uses for step-ups
const KNOCKBACK_DECAY = 6; // impulse channel decay rate, 1/s

const FLY_SPEED = 20;
const FLY_SPRINT_SPEED = 40;
const DOUBLE_TAP_WINDOW = 300; // ms

/**
 * Cursor name this controller reads edges under. Edges are delivered through
 * per-consumer cursors, so naming it uniquely is what keeps the controller from
 * starving the frame loop or the React listeners of the same press.
 */
const EDGE_CONSUMER = "playerController";

export class PlayerController {
  public position: { x: number; y: number; z: number };
  public velocity = { x: 0, y: 0, z: 0 };
  public onGround = false;
  public isCrouching = false;
  public isSprinting = false;
  public isFlying = false;

  /**
   * Timestamp of the jump press that a second press is measured against for the
   * flight toggle. Carries the press time from the intent edge rather than the
   * frame time, so a press is timed by when it happened, not by when the frame
   * that noticed it ran.
   */
  private lastJumpPressTime = 0;
  /**
   * Decaying horizontal impulse channel, kept separate from `velocity` so a
   * hit still displaces the player even while a movement key holds
   * velocity.x/z pinned to the input direction every frame. Added into the
   * horizontal displacement at move time and exponentially decayed
   * (`KNOCKBACK_DECAY`/s); zeroed the instant its axis hits a wall.
   */
  private knockback = { x: 0, z: 0 };

  constructor(spawnX: number, spawnY: number, spawnZ: number) {
    this.position = { x: spawnX, y: spawnY, z: spawnZ };
  }

  get height(): number {
    return this.isCrouching ? CROUCH_HEIGHT : STAND_HEIGHT;
  }

  applyKnockback(fromX: number, fromZ: number, strength: number): void {
    const dx = this.position.x - fromX;
    const dz = this.position.z - fromZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 0.01) {
      // Cap knockback velocity to prevent clipping
      const cappedStrength = Math.min(strength, 5);
      this.knockback.x = (dx / dist) * cappedStrength;
      this.knockback.z = (dz / dist) * cappedStrength;
    }
    this.velocity.y = Math.min(strength * 0.4, 4);
    this.onGround = false;
  }

  /**
   * One physics frame, driven by named intents rather than key codes.
   *
   * Per-frame order is unchanged and load-bearing: flight toggle, crouch/sprint,
   * camera-relative vector, gravity, jump, Y sub-step, ground probe, X then Z
   * with crouch rollback, overlap resolve, auto-jump impulse last
   * (docs/solutions/best-practices/player-physics-movement-architecture-2026-04-10.md).
   */
  update(
    dt: number,
    intents: IntentSnapshot,
    camera: Camera,
    getBlock: (wx: number, wy: number, wz: number) => number,
    registry: BlockRegistry,
    creative = false
  ): void {
    // Read this frame's presses once, under this controller's own cursor, so
    // other consumers still see the same edges. Read unconditionally, even in
    // survival where the toggle below ignores them: leaving them unread parks a
    // stale press behind the cursor for a later creative frame to trip over.
    // The old `spaceWasDown` bookkeeping ran every frame for the same reason.
    const edges = intents.takeEdges(EDGE_CONSUMER);

    // Double-tap jump for the flight toggle (creative only). Kept here rather
    // than in the input layer: it is a gameplay rule, and the same control is
    // simultaneously held-ascend while flying, which only the consumer can
    // disentangle. Edge timestamps are why `jump` is not a plain boolean.
    if (creative) {
      for (const edge of edges) {
        if (edge.intent !== "jump") continue;
        if (edge.at - this.lastJumpPressTime < DOUBLE_TAP_WINDOW) {
          this.isFlying = !this.isFlying;
          if (this.isFlying) {
            this.velocity.y = 0;
          }
          // Reset so the next press isn't another toggle
          this.lastJumpPressTime = 0;
        } else {
          this.lastJumpPressTime = edge.at;
        }
      }
    }

    // Disable flight in survival
    if (!creative) {
      this.isFlying = false;
    }

    this.isCrouching = !this.isFlying && intents.isHeld("sneak");

    // Sprint works both on ground and while flying
    this.isSprinting = !this.isCrouching && intents.isHeld("sprint");

    const forward = camera.getForward();
    const right = camera.getRight();

    // Movement is assembled in the camera's local frame first — x is strafe
    // (right positive), y is forward — so a keyboard's four booleans and a
    // joystick's analog vector add on the same axes.
    let localX = 0;
    let localY = 0;
    if (intents.isHeld("moveForward")) localY += 1;
    if (intents.isHeld("moveBack")) localY -= 1;
    if (intents.isHeld("moveRight")) localX += 1;
    if (intents.isHeld("moveLeft")) localX -= 1;

    const analog = intents.delta("move");
    localX += analog.x;
    localY += analog.y;

    // Clamped, not normalised: a diagonal key pair still resolves to exactly 1
    // (matching the old normalise-the-sum step), while a half-pushed stick keeps
    // its half magnitude. The speed constants below stay the only scalar,
    // because per-frame displacement is what sub-stepping and auto-jump's
    // blocked-axis detection are derived from.
    const move = clampMoveVector({ x: localX, y: localY });

    const speed = this.isFlying
      ? (this.isSprinting ? FLY_SPRINT_SPEED : FLY_SPEED)
      : this.isCrouching ? CROUCH_SPEED
      : this.isSprinting ? SPRINT_SPEED
      : WALK_SPEED;

    // `forward` and `right` are unit vectors on the XZ plane and perpendicular,
    // so projecting a unit local vector through them preserves its magnitude.
    this.velocity.x = (move.y * forward.x + move.x * right.x) * speed;
    this.velocity.z = (move.y * forward.z + move.x * right.z) * speed;

    // Decay the knockback impulse channel. Independent of input, so it keeps
    // pushing the player even while a movement key holds velocity.x/z at the
    // input direction.
    const knockbackFactor = Math.exp(-KNOCKBACK_DECAY * dt);
    this.knockback.x *= knockbackFactor;
    this.knockback.z *= knockbackFactor;

    if (this.isFlying) {
      // Flight vertical controls: jump=ascend, sneak=descend, neither=hover.
      // Both are level reads of the same controls the toggle above read as
      // edges — jump has to be readable both ways within one frame.
      //
      // Behaviour note: descend now follows the `sneak` intent, so CapsLock
      // descends where it previously did not (the old branch listed the two
      // Control codes only). The intent layer has a single crouch control by
      // design — touch has one crouch button — so the code-level distinction
      // has nowhere left to live, and this is what keybinds.ts already
      // advertises ("Ctrl / CapsLock — Sneak / fly down").
      const flyVertSpeed = this.isSprinting ? FLY_SPRINT_SPEED : FLY_SPEED;
      if (intents.isHeld("jump")) {
        this.velocity.y = flyVertSpeed;
      } else if (intents.isHeld("sneak")) {
        this.velocity.y = -flyVertSpeed;
      } else {
        this.velocity.y = 0;
      }
    } else {
      // Normal gravity
      if (!this.onGround) {
        this.velocity.y -= GRAVITY * dt;
        if (this.velocity.y < MAX_FALL_SPEED) this.velocity.y = MAX_FALL_SPEED;
      }

      // Level read, deliberately: holding jump re-launches on the frame the
      // player lands, exactly as holding Space does today.
      if (intents.isHeld("jump") && this.onGround) {
        this.velocity.y = JUMP_VELOCITY;
        this.onGround = false;
      }
    }

    // Move and collide: Y first, then X, then Z
    // Use sub-stepping for large displacements to prevent clipping
    this.moveAxisSafe("y", this.velocity.y * dt, getBlock, registry);

    if (!this.isFlying) {
      // Ground probe: when standing (velocity.y == 0), moveAxisSafe skips Y
      // entirely so onGround is never cleared. Check if ground still exists.
      if (this.onGround && this.velocity.y === 0) {
        const belowY = Math.floor(this.position.y) - 1;
        const bMinX = Math.floor(this.position.x - HALF_WIDTH);
        const bMaxX = maxBlock(this.position.x + HALF_WIDTH);
        const bMinZ = Math.floor(this.position.z - HALF_WIDTH);
        const bMaxZ = maxBlock(this.position.z + HALF_WIDTH);

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
    }

    // Crouch edge prevention (skip while flying)
    const savedX = this.position.x;
    const hitX = this.moveAxisSafe("x", (this.velocity.x + this.knockback.x) * dt, getBlock, registry);
    if (hitX !== null) this.knockback.x = 0;
    if (!this.isFlying && this.isCrouching && this.onGround) {
      if (!this.hasGroundSupport(getBlock, registry)) {
        this.position.x = savedX;
        this.velocity.x = 0;
      }
    }

    const savedZ = this.position.z;
    const hitZ = this.moveAxisSafe("z", (this.velocity.z + this.knockback.z) * dt, getBlock, registry);
    if (hitZ !== null) this.knockback.z = 0;
    if (!this.isFlying && this.isCrouching && this.onGround) {
      if (!this.hasGroundSupport(getBlock, registry)) {
        this.position.z = savedZ;
        this.velocity.z = 0;
      }
    }

    // POST-COLLISION SAFETY: if player ended up inside a solid block, push them out
    this.resolveOverlap(getBlock, registry);

    // Auto-jump: step up a one-block ledge that just blocked a grounded walk.
    // Applied after resolveOverlap so it never competes with its downward-push
    // candidate; Y resolves again first thing next frame.
    if (!this.isFlying && !this.isCrouching && this.onGround && useSettingsStore.getState().autoJump) {
      if (
        (hitX !== null && this.isOneBlockLedge("x", hitX, getBlock, registry)) ||
        (hitZ !== null && this.isOneBlockLedge("z", hitZ, getBlock, registry))
      ) {
        this.velocity.y = AUTO_JUMP_VELOCITY;
        this.onGround = false;
      }
    }
  }

  /**
   * True when `layer` (the block column that just stopped horizontal travel
   * along `axis`) is a one-block ledge the player can step up onto: solid at
   * foot level somewhere across the cross-axis span, with `ceil(height)`
   * blocks of clearance above every solid cell in that span so the player
   * actually fits on top. Uses `maxBlock` for the cross-axis max edge per the
   * half-open AABB rule (CONCEPTS.md).
   */
  private isOneBlockLedge(
    axis: "x" | "z",
    layer: number,
    getBlock: (wx: number, wy: number, wz: number) => number,
    registry: BlockRegistry
  ): boolean {
    const footY = Math.floor(this.position.y);
    const crossMin = axis === "x" ? this.position.z - HALF_WIDTH : this.position.x - HALF_WIDTH;
    const crossMax = axis === "x" ? this.position.z + HALF_WIDTH : this.position.x + HALF_WIDTH;
    const lo = Math.floor(crossMin);
    const hi = maxBlock(crossMax);
    const clearance = Math.ceil(this.height);

    let ledge = false;
    for (let c = lo; c <= hi; c++) {
      const bx = axis === "x" ? layer : c;
      const bz = axis === "x" ? c : layer;
      if (registry.isSolid(getBlock(bx, footY, bz))) ledge = true;
      for (let dy = 1; dy <= clearance; dy++) {
        if (registry.isSolid(getBlock(bx, footY + dy, bz))) return false;
      }
    }
    return ledge;
  }

  /** Checks if at least one solid block exists directly below the player AABB. */
  private hasGroundSupport(
    getBlock: (wx: number, wy: number, wz: number) => number,
    registry: BlockRegistry
  ): boolean {
    const belowY = Math.floor(this.position.y) - 1;
    const bMinX = Math.floor(this.position.x - HALF_WIDTH);
    const bMaxX = maxBlock(this.position.x + HALF_WIDTH);
    const bMinZ = Math.floor(this.position.z - HALF_WIDTH);
    const bMaxZ = maxBlock(this.position.z + HALF_WIDTH);

    for (let bx = bMinX; bx <= bMaxX; bx++) {
      for (let bz = bMinZ; bz <= bMaxZ; bz++) {
        if (registry.isSolid(getBlock(bx, belowY, bz))) return true;
      }
    }
    return false;
  }

  /**
   * Move with sub-stepping: breaks large displacements into safe-sized steps.
   * Returns the block layer the first sub-step's collision resolved against
   * (the blocking layer along `axis`), or null if nothing blocked.
   */
  private moveAxisSafe(
    axis: "x" | "y" | "z",
    totalDelta: number,
    getBlock: (wx: number, wy: number, wz: number) => number,
    registry: BlockRegistry
  ): number | null {
    if (totalDelta === 0) return null;

    const absDelta = Math.abs(totalDelta);
    if (absDelta <= MAX_STEP_SIZE) {
      // Small enough — single step
      return this.moveAxis(axis, totalDelta, getBlock, registry);
    }

    // Break into sub-steps
    const sign = totalDelta > 0 ? 1 : -1;
    let remaining = absDelta;
    let hit: number | null = null;
    while (remaining > 0.001) {
      const step = Math.min(remaining, MAX_STEP_SIZE);
      const stepHit = this.moveAxis(axis, step * sign, getBlock, registry);
      if (hit === null) hit = stepHit;
      remaining -= step;
      // If collision stopped movement, don't continue
      if (axis === "y" && this.velocity.y === 0) break;
      if (axis === "x" && this.velocity.x === 0) break;
      if (axis === "z" && this.velocity.z === 0) break;
    }
    return hit;
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
    // never miss a block the player is genuinely inside. maxBlock() drops the
    // block a flush edge merely touches: its overlap is zero-width on that axis,
    // but the other axes would still report a large penetration and push us.
    const bMinX = Math.floor(minX);
    const bMaxX = maxBlock(maxX);
    const bMinY = Math.floor(minY);
    const bMaxY = maxBlock(maxY);
    const bMinZ = Math.floor(minZ);
    const bMaxZ = maxBlock(maxZ);

    let bestPen = Infinity;
    let bestAxis: "x" | "y" | "z" | null = null;
    let bestDir = 0;
    let bestPush = 0;

    for (let bx = bMinX; bx <= bMaxX; bx++) {
      for (let by = bMinY; by <= bMaxY; by++) {
        for (let bz = bMinZ; bz <= bMaxZ; bz++) {
          if (!registry.isSolid(getBlock(bx, by, bz))) continue;

          // Only push horizontally (X/Z) or downward (Y-).
          // Never push UP — the normal moveAxis Y collision handles ground
          // landing. Upward pushes cause the "launch to ceiling" bug when
          // the player is squeezed between blocks horizontally.
          const candidates: Array<{ pen: number; axis: "x" | "y" | "z"; dir: number; push: number }> = [
            { pen: (bx + 1) - minX, axis: "x", dir: 1, push: (bx + 1) + HALF_WIDTH + EPS },
            { pen: maxX - bx, axis: "x", dir: -1, push: bx - HALF_WIDTH - EPS },
            { pen: (bz + 1) - minZ, axis: "z", dir: 1, push: (bz + 1) + HALF_WIDTH + EPS },
            { pen: maxZ - bz, axis: "z", dir: -1, push: bz - HALF_WIDTH - EPS },
          ];
          // Only allow downward push if NOT on ground — pushing down while
          // standing on a floor teleports the player underground.
          if (!this.onGround) {
            candidates.push({ pen: maxY - by, axis: "y", dir: -1, push: by - h });
          }
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
      if (bestAxis === "y") {
        this.velocity.y = 0;
      }
      // X/Z pushes: leave onGround unchanged — no free jumps from wall clips

      // Floor safety: if the push placed feet inside a solid block, snap up
      const footY = Math.floor(this.position.y);
      const footMinX = Math.floor(this.position.x - HALF_WIDTH);
      const footMaxX = maxBlock(this.position.x + HALF_WIDTH);
      const footMinZ = Math.floor(this.position.z - HALF_WIDTH);
      const footMaxZ = maxBlock(this.position.z + HALF_WIDTH);
      for (let fx = footMinX; fx <= footMaxX; fx++) {
        for (let fz = footMinZ; fz <= footMaxZ; fz++) {
          if (registry.isSolid(getBlock(fx, footY, fz))) {
            this.position.y = footY + 1;
            this.velocity.y = 0;
            this.onGround = true;
            return;
          }
        }
      }
    }
  }

  /** Resolves one collision step. Returns the blocking layer along `axis`, or null if nothing blocked. */
  private moveAxis(
    axis: "x" | "y" | "z",
    delta: number,
    getBlock: (wx: number, wy: number, wz: number) => number,
    registry: BlockRegistry
  ): number | null {
    if (delta === 0) return null;

    this.position[axis] += delta;

    const h = this.height;
    const minX = this.position.x - HALF_WIDTH;
    const maxX = this.position.x + HALF_WIDTH;
    const minY = this.position.y;
    const maxY = this.position.y + h;
    const minZ = this.position.z - HALF_WIDTH;
    const maxZ = this.position.z + HALF_WIDTH;

    const bMinX = Math.floor(minX);
    const bMaxX = maxBlock(maxX);
    const bMinY = Math.floor(minY);
    const bMaxY = maxBlock(maxY);
    const bMinZ = Math.floor(minZ);
    const bMaxZ = maxBlock(maxZ);

    const layer = firstBlockingLayer(
      axis, delta, bMinX, bMaxX, bMinY, bMaxY, bMinZ, bMaxZ,
      (bx, by, bz) => registry.isSolid(getBlock(bx, by, bz))
    );

    if (layer === null) {
      if (axis === "y" && delta < 0) {
        this.onGround = false;
      }
      return null;
    }

    if (axis === "y") {
      if (delta < 0) {
        this.position.y = layer + 1;
        this.onGround = true;
      } else {
        this.position.y = layer - h;
      }
      this.velocity.y = 0;
    } else if (axis === "x") {
      this.position.x = delta < 0 ? layer + 1 + HALF_WIDTH : layer - HALF_WIDTH;
      this.velocity.x = 0;
    } else {
      this.position.z = delta < 0 ? layer + 1 + HALF_WIDTH : layer - HALF_WIDTH;
      this.velocity.z = 0;
    }
    return layer;
  }
}
