import { describe, expect, it, vi } from "vitest";
import { PlayerController } from "@engine/player/PlayerController";
import type { InputManager } from "@engine/InputManager";
import type { Camera } from "@engine/player/Camera";
import type { BlockRegistry } from "@engine/world/BlockRegistry";

/**
 * Characterization tests for the INPUT -> MOVEMENT mapping in
 * PlayerController.update(). These pin current behavior (including any
 * bug-shaped quirks) so the upcoming intent-layer refactor can be checked
 * against "desktop play is unchanged". Collision/physics resolution is
 * already covered by collision.test.ts and autoJump.test.ts and is
 * deliberately NOT re-tested here — this file only cares about which key
 * codes produce which movement/intent.
 */

const AIR = 0;
const STONE = 1;
const GROUND_TOP = 65; // solid terrain fills y <= 64, so entities stand at y = 65

const registry = { isSolid: (id: number) => id === STONE } as unknown as BlockRegistry;

/** Open sky in every direction — never blocks movement, so pure input->velocity mapping is visible. */
const openWorld = () => AIR;

/** Flat ground at y<=64 (stand at y=65), open above. */
const flatWorld = (_x: number, y: number) => (y <= 64 ? STONE : AIR);

function heldKeys(...keys: string[]) {
  return { isKeyDown: (k: string) => keys.includes(k) } as unknown as InputManager;
}

/** Camera looking along (dirX, dirZ); right is that vector rotated 90 degrees (matches Camera.getRight). */
function facing(dirX: number, dirZ: number) {
  return {
    getForward: () => ({ x: dirX, y: 0, z: dirZ }),
    getRight: () => ({ x: -dirZ, y: 0, z: dirX }),
  } as unknown as Camera;
}

function newGroundedPlayer(x = 10, z = 10) {
  const player = new PlayerController(x, GROUND_TOP, z);
  player.onGround = true;
  return player;
}

describe("PlayerController input -> movement key mapping", () => {
  it("KeyW (and ArrowUp) drive the player along camera forward", () => {
    const p1 = newGroundedPlayer();
    p1.update(1 / 60, heldKeys("KeyW"), facing(1, 0), openWorld, registry);
    expect(p1.position.x).toBeGreaterThan(10);
    expect(p1.position.z).toBeCloseTo(10, 6);

    const p2 = newGroundedPlayer();
    p2.update(1 / 60, heldKeys("ArrowUp"), facing(1, 0), openWorld, registry);
    expect(p2.position.x).toBeCloseTo(p1.position.x, 6);
  });

  it("KeyS (and ArrowDown) drive the player opposite camera forward", () => {
    const p1 = newGroundedPlayer();
    p1.update(1 / 60, heldKeys("KeyS"), facing(1, 0), openWorld, registry);
    expect(p1.position.x).toBeLessThan(10);
    expect(p1.position.z).toBeCloseTo(10, 6);

    const p2 = newGroundedPlayer();
    p2.update(1 / 60, heldKeys("ArrowDown"), facing(1, 0), openWorld, registry);
    expect(p2.position.x).toBeCloseTo(p1.position.x, 6);
  });

  it("KeyA (and ArrowLeft) strafe opposite camera right", () => {
    // Facing +X: right = (0, 1) per the facing() helper's rotation convention.
    // KeyA subtracts `right`, so moveZ goes negative.
    const p1 = newGroundedPlayer();
    p1.update(1 / 60, heldKeys("KeyA"), facing(1, 0), openWorld, registry);
    expect(p1.position.z).toBeLessThan(10);
    expect(p1.position.x).toBeCloseTo(10, 6);

    const p2 = newGroundedPlayer();
    p2.update(1 / 60, heldKeys("ArrowLeft"), facing(1, 0), openWorld, registry);
    expect(p2.position.z).toBeCloseTo(p1.position.z, 6);
  });

  it("KeyD (and ArrowRight) strafe along camera right", () => {
    const p1 = newGroundedPlayer();
    p1.update(1 / 60, heldKeys("KeyD"), facing(1, 0), openWorld, registry);
    expect(p1.position.z).toBeGreaterThan(10);
    expect(p1.position.x).toBeCloseTo(10, 6);

    const p2 = newGroundedPlayer();
    p2.update(1 / 60, heldKeys("ArrowRight"), facing(1, 0), openWorld, registry);
    expect(p2.position.z).toBeCloseTo(p1.position.z, 6);
  });

  it("movement is camera-yaw-relative: same key, different facing, different world-space direction", () => {
    const pForwardX = newGroundedPlayer();
    pForwardX.update(1 / 60, heldKeys("KeyW"), facing(1, 0), openWorld, registry);

    const pForwardZ = newGroundedPlayer();
    pForwardZ.update(1 / 60, heldKeys("KeyW"), facing(0, 1), openWorld, registry);

    // Facing +X moves along X, not Z; facing +Z moves along Z, not X.
    expect(pForwardX.position.x).toBeGreaterThan(10);
    expect(pForwardX.position.z).toBeCloseTo(10, 6);
    expect(pForwardZ.position.z).toBeGreaterThan(10);
    expect(pForwardZ.position.x).toBeCloseTo(10, 6);
  });

  it("opposing keys W+S cancel to zero horizontal movement", () => {
    const p = newGroundedPlayer();
    p.update(1 / 60, heldKeys("KeyW", "KeyS"), facing(1, 0), openWorld, registry);
    expect(p.position.x).toBeCloseTo(10, 6);
    expect(p.position.z).toBeCloseTo(10, 6);
    expect(p.velocity.x).toBeCloseTo(0, 6);
    expect(p.velocity.z).toBeCloseTo(0, 6);
  });

  it("opposing keys A+D cancel to zero horizontal movement", () => {
    const p = newGroundedPlayer();
    p.update(1 / 60, heldKeys("KeyA", "KeyD"), facing(1, 0), openWorld, registry);
    expect(p.position.x).toBeCloseTo(10, 6);
    expect(p.position.z).toBeCloseTo(10, 6);
    expect(p.velocity.x).toBeCloseTo(0, 6);
    expect(p.velocity.z).toBeCloseTo(0, 6);
  });

  it("diagonal movement (W+D) is normalized to the same speed as a single cardinal key, not faster", () => {
    const dt = 1 / 60;

    const pCardinal = newGroundedPlayer();
    pCardinal.update(dt, heldKeys("KeyW"), facing(1, 0), openWorld, registry);
    const cardinalDist = Math.hypot(pCardinal.position.x - 10, pCardinal.position.z - 10);

    const pDiagonal = newGroundedPlayer();
    pDiagonal.update(dt, heldKeys("KeyW", "KeyD"), facing(1, 0), openWorld, registry);
    const diagonalDist = Math.hypot(pDiagonal.position.x - 10, pDiagonal.position.z - 10);

    // Current behavior: moveX/moveZ are normalized by `len` before being scaled
    // to `speed`, so diagonal input travels the SAME distance per frame as a
    // single cardinal key — no classic un-normalized-diagonal speed boost.
    expect(diagonalDist).toBeCloseTo(cardinalDist, 6);
  });
});

describe("PlayerController sprint", () => {
  it("Shift multiplies walk speed to SPRINT_SPEED (8 vs 5 walk)", () => {
    const dt = 1 / 60;
    const pWalk = newGroundedPlayer();
    pWalk.update(dt, heldKeys("KeyW"), facing(1, 0), openWorld, registry);
    const walkDist = pWalk.position.x - 10;

    const pSprintLeft = newGroundedPlayer();
    pSprintLeft.update(dt, heldKeys("KeyW", "ShiftLeft"), facing(1, 0), openWorld, registry);
    const sprintDist = pSprintLeft.position.x - 10;

    expect(pSprintLeft.isSprinting).toBe(true);
    expect(sprintDist).toBeCloseTo(walkDist * (8 / 5), 6);

    const pSprintRight = newGroundedPlayer();
    pSprintRight.update(dt, heldKeys("KeyW", "ShiftRight"), facing(1, 0), openWorld, registry);
    expect(pSprintRight.position.x - 10).toBeCloseTo(sprintDist, 6);
  });

  it("sprint flag is set from Shift alone, even with no movement key held", () => {
    // Current behavior: isSprinting only checks Shift (and not-crouching),
    // it does not require forward motion or any movement key to be held.
    const p = newGroundedPlayer();
    p.update(1 / 60, heldKeys("ShiftLeft"), facing(1, 0), openWorld, registry);
    expect(p.isSprinting).toBe(true);
    // With no movement key, velocity is still zero despite sprinting.
    expect(p.velocity.x).toBeCloseTo(0, 6);
    expect(p.velocity.z).toBeCloseTo(0, 6);
  });

  it("crouch takes priority over sprint when both Ctrl and Shift are held", () => {
    const p = newGroundedPlayer();
    p.update(1 / 60, heldKeys("KeyW", "ControlLeft", "ShiftLeft"), facing(1, 0), openWorld, registry);
    expect(p.isCrouching).toBe(true);
    expect(p.isSprinting).toBe(false);
  });
});

describe("PlayerController crouch/sneak", () => {
  it("Ctrl (either side) or CapsLock reduces speed to CROUCH_SPEED (2.5)", () => {
    const dt = 1 / 60;
    const pWalk = newGroundedPlayer();
    pWalk.update(dt, heldKeys("KeyW"), facing(1, 0), openWorld, registry);
    const walkDist = pWalk.position.x - 10;

    for (const crouchKey of ["ControlLeft", "ControlRight", "CapsLock"]) {
      const p = newGroundedPlayer();
      p.update(dt, heldKeys("KeyW", crouchKey), facing(1, 0), openWorld, registry);
      expect(p.isCrouching, crouchKey).toBe(true);
      expect(p.position.x - 10).toBeCloseTo(walkDist * (2.5 / 5), 6);
    }
  });

  it("crouching reduces player height from STAND_HEIGHT (1.8) to CROUCH_HEIGHT (1.4)", () => {
    const p = newGroundedPlayer();
    expect(p.height).toBe(1.8);
    p.update(1 / 60, heldKeys("ControlLeft"), facing(1, 0), openWorld, registry);
    expect(p.isCrouching).toBe(true);
    expect(p.height).toBe(1.4);
  });

  it("crouch edge prevention: grounded crouch-walking off a ledge is halted before the player walks off it", () => {
    // Ground only exists for x <= 10; beyond that it's a cliff (air below).
    const ledgeWorld = (x: number, y: number) => {
      if (y > 64) return AIR;
      return x <= 10 ? STONE : AIR;
    };
    const p = new PlayerController(9, GROUND_TOP, 10);
    p.onGround = true;

    const keys = heldKeys("KeyW", "ControlLeft");
    const camera = facing(1, 0);
    let everReverted = false;
    for (let frame = 0; frame < 60; frame++) {
      const beforeX = p.position.x;
      p.update(1 / 60, keys, camera, ledgeWorld, registry);
      expect(p.isCrouching).toBe(true);
      // Never actually leaves solid ground: y stays at 65, never falls.
      expect(p.position.y, `frame ${frame}: fell off the ledge while crouching`).toBe(GROUND_TOP);
      if (p.position.x === beforeX && p.velocity.x === 0) everReverted = true;
    }

    // Current behavior: the edge-prevention check only fires once the whole
    // footprint (HALF_WIDTH on each side) has cleared solid ground, so the
    // player can approach past the block edge (x=10) before being halted.
    expect(everReverted, "player was never halted by crouch edge prevention").toBe(true);
    expect(p.position.x).toBeLessThan(11.3);
  });

  it("crouch does not apply while flying (creative)", () => {
    const p = newGroundedPlayer();
    p.isFlying = true;
    p.update(1 / 60, heldKeys("ControlLeft"), facing(1, 0), openWorld, registry, true);
    expect(p.isCrouching).toBe(false);
  });
});

describe("PlayerController jump", () => {
  it("Space applied while grounded launches the player upward at JUMP_VELOCITY (8)", () => {
    const p = newGroundedPlayer();
    p.update(1 / 60, heldKeys("Space"), facing(1, 0), flatWorld, registry);
    expect(p.velocity.y).toBe(8);
    expect(p.onGround).toBe(false);
  });

  it("Space is ignored while airborne (grounded gate)", () => {
    const p = new PlayerController(10, GROUND_TOP + 5, 10);
    p.onGround = false;
    p.velocity.y = 0;
    p.update(1 / 60, heldKeys("Space"), facing(1, 0), flatWorld, registry);
    // No jump impulse applied; gravity is the only thing that should have
    // changed velocity.y this frame (it should have decreased, not jumped to 8).
    expect(p.velocity.y).not.toBe(8);
    expect(p.velocity.y).toBeLessThan(0);
  });

  it("does not jump while crouching would otherwise be walking (jump still works independent of crouch key state absence)", () => {
    // Sanity: without Space, grounded player does not gain upward velocity.
    const p = newGroundedPlayer();
    p.update(1 / 60, heldKeys("KeyW"), facing(1, 0), flatWorld, registry);
    expect(p.velocity.y).toBe(0);
    expect(p.onGround).toBe(true);
  });
});

describe("PlayerController creative fly toggle", () => {
  // `lastSpacePressTime` starts at 0, so the very first Space press of a
  // fresh PlayerController's life is compared against t=0. With fake timers
  // starting near t=0 that reads as "within the double-tap window" and would
  // spuriously toggle flight on a single press. Advancing the clock well past
  // DOUBLE_TAP_WINDOW before the first press isolates the toggle logic from
  // that startup artifact, matching how the game is actually played (Space
  // is pressed long after the controller was constructed).
  function farPastStartup() {
    vi.useFakeTimers();
    vi.advanceTimersByTime(10_000);
  }

  it("double-tapping Space within the double-tap window toggles isFlying, only in creative mode", () => {
    try {
      farPastStartup();
      const p = newGroundedPlayer();
      const creative = true;

      // Press 1: down.
      p.update(1 / 60, heldKeys("Space"), facing(1, 0), flatWorld, registry, creative);
      expect(p.isFlying).toBe(false);

      // Release, then press again quickly (well within the 300ms window).
      p.update(1 / 60, heldKeys(), facing(1, 0), flatWorld, registry, creative);
      vi.advanceTimersByTime(50);
      p.update(1 / 60, heldKeys("Space"), facing(1, 0), flatWorld, registry, creative);

      expect(p.isFlying).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not toggle flight when the second tap arrives after the double-tap window", () => {
    try {
      farPastStartup();
      const p = newGroundedPlayer();
      const creative = true;

      p.update(1 / 60, heldKeys("Space"), facing(1, 0), flatWorld, registry, creative);
      p.update(1 / 60, heldKeys(), facing(1, 0), flatWorld, registry, creative);
      vi.advanceTimersByTime(500); // exceeds DOUBLE_TAP_WINDOW (300ms)
      p.update(1 / 60, heldKeys("Space"), facing(1, 0), flatWorld, registry, creative);

      expect(p.isFlying).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("double-tap Space does not toggle flight in survival (creative=false)", () => {
    try {
      farPastStartup();
      const p = newGroundedPlayer();

      p.update(1 / 60, heldKeys("Space"), facing(1, 0), flatWorld, registry, false);
      p.update(1 / 60, heldKeys(), facing(1, 0), flatWorld, registry, false);
      vi.advanceTimersByTime(50);
      p.update(1 / 60, heldKeys("Space"), facing(1, 0), flatWorld, registry, false);

      expect(p.isFlying).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("flight is force-disabled in survival even if isFlying was previously true", () => {
    const p = newGroundedPlayer();
    p.isFlying = true;
    p.update(1 / 60, heldKeys(), facing(1, 0), flatWorld, registry, false);
    expect(p.isFlying).toBe(false);
  });

  it("while flying, Space ascends and Ctrl descends at fly speed instead of jumping/crouching", () => {
    try {
      // Space is pressed fresh below; advance the clock past DOUBLE_TAP_WINDOW
      // first so it isn't misread as a double-tap against the startup t=0
      // (see farPastStartup's comment above) and toggle flight back off.
      farPastStartup();

      const pUp = newGroundedPlayer();
      pUp.isFlying = true;
      pUp.update(1 / 60, heldKeys("Space"), facing(1, 0), openWorld, registry, true);
      expect(pUp.velocity.y).toBe(20); // FLY_SPEED

      const pDown = newGroundedPlayer();
      pDown.isFlying = true;
      pDown.update(1 / 60, heldKeys("ControlLeft"), facing(1, 0), openWorld, registry, true);
      expect(pDown.velocity.y).toBe(-20); // FLY_SPEED, and crouch does not apply while flying

      const pHover = newGroundedPlayer();
      pHover.isFlying = true;
      pHover.update(1 / 60, heldKeys(), facing(1, 0), openWorld, registry, true);
      expect(pHover.velocity.y).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("flight vertical speed is boosted by sprint (FLY_SPRINT_SPEED = 40)", () => {
    try {
      farPastStartup();
      const p = newGroundedPlayer();
      p.isFlying = true;
      p.update(1 / 60, heldKeys("Space", "ShiftLeft"), facing(1, 0), openWorld, registry, true);
      expect(p.velocity.y).toBe(40);
    } finally {
      vi.useRealTimers();
    }
  });
});
