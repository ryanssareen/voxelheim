import { afterEach, describe, expect, it } from "vitest";
import { PlayerController } from "@engine/player/PlayerController";
import { useSettingsStore } from "@store/useSettingsStore";
import type { InputManager } from "@engine/InputManager";
import type { Camera } from "@engine/player/Camera";
import type { BlockRegistry } from "@engine/world/BlockRegistry";

const AIR = 0;
const STONE = 1;
const GROUND_TOP = 65; // solid terrain fills y <= 64, so entities stand at y = 65

const registry = { isSolid: (id: number) => id === STONE } as unknown as BlockRegistry;

function heldKeys(...keys: string[]) {
  return { isKeyDown: (k: string) => keys.includes(k) } as unknown as InputManager;
}

/** Camera looking along (dirX, dirZ); right is that vector rotated 90 degrees. */
function facing(dirX: number, dirZ: number) {
  return {
    getForward: () => ({ x: dirX, y: 0, z: dirZ }),
    getRight: () => ({ x: -dirZ, y: 0, z: dirX }),
  } as unknown as Camera;
}

/** Flat terrain (y <= 64) with a one-block-high ledge starting at `coord` along `axis`, travelling in `dir`. */
function ledgeWorld(axis: "x" | "z", coord: number, dir: 1 | -1) {
  return (x: number, y: number, z: number) => {
    if (y <= 64) return STONE;
    const c = axis === "x" ? x : z;
    const pastLedge = dir > 0 ? c >= coord : c <= coord;
    return pastLedge && y === 65 ? STONE : AIR;
  };
}

/** Same ledge, but two blocks tall (no clearance to step up). */
function twoHighWallWorld(axis: "x" | "z", coord: number, dir: 1 | -1) {
  return (x: number, y: number, z: number) => {
    if (y <= 64) return STONE;
    const c = axis === "x" ? x : z;
    const pastLedge = dir > 0 ? c >= coord : c <= coord;
    return pastLedge && (y === 65 || y === 66) ? STONE : AIR;
  };
}

/** One-block ledge, but with an extra solid block blocking head clearance above it. */
function noClearanceWorld(axis: "x" | "z", coord: number, dir: 1 | -1) {
  return (x: number, y: number, z: number) => {
    if (y <= 64) return STONE;
    const c = axis === "x" ? x : z;
    const pastLedge = dir > 0 ? c >= coord : c <= coord;
    if (!pastLedge) return AIR;
    if (y === 65) return STONE;
    if (y === 67) return STONE;
    return AIR;
  };
}

describe("PlayerController auto-jump", () => {
  afterEach(() => {
    useSettingsStore.setState({ autoJump: true });
  });

  const directions: Array<{ name: string; axis: "x" | "z"; dir: 1 | -1; start: number; ledgeCoord: number }> = [
    { name: "+X ledge", axis: "x", dir: 1, start: 8, ledgeCoord: 10 },
    { name: "-X ledge", axis: "x", dir: -1, start: 13, ledgeCoord: 11 },
    { name: "+Z ledge", axis: "z", dir: 1, start: 8, ledgeCoord: 10 },
    { name: "-Z ledge", axis: "z", dir: -1, start: 13, ledgeCoord: 11 },
  ];

  for (const d of directions) {
    for (const dt of [1 / 60, 0.05]) {
      it(`steps up a one-block ${d.name} while walking, dt=${dt}`, () => {
        const startCross = 20.5;
        const player =
          d.axis === "x"
            ? new PlayerController(d.start, GROUND_TOP, startCross)
            : new PlayerController(startCross, GROUND_TOP, d.start);
        player.onGround = true;

        const getBlock = ledgeWorld(d.axis, d.ledgeCoord, d.dir);
        const keys = heldKeys("KeyW");
        const camera = d.axis === "x" ? facing(d.dir, 0) : facing(0, d.dir);

        let steppedUp = false;
        for (let frame = 0; frame < 400; frame++) {
          player.update(dt, keys, camera, getBlock, registry);
          expect(player.position.y, `frame ${frame}: fell through the floor`).toBeGreaterThanOrEqual(65);
          if (player.position.y > 65) steppedUp = true;
        }

        expect(steppedUp, "player never rose off the lower level").toBe(true);
        expect(player.position.y).toBe(66);
        expect(player.onGround).toBe(true);
        // Crossed onto the raised level along the travel axis.
        const traveled = d.axis === "x" ? player.position.x : player.position.z;
        if (d.dir > 0) {
          expect(traveled).toBeGreaterThan(d.ledgeCoord + 0.3);
        } else {
          expect(traveled).toBeLessThan(d.ledgeCoord - 0.3);
        }
        // No sideways drift on the untouched axis.
        expect(d.axis === "x" ? player.position.z : player.position.x).toBeCloseTo(startCross, 6);
      });
    }
  }

  it("does not hop a two-high wall", () => {
    const player = new PlayerController(8, GROUND_TOP, 20.5);
    player.onGround = true;
    const getBlock = twoHighWallWorld("x", 10, 1);

    for (let frame = 0; frame < 180; frame++) {
      player.update(1 / 60, heldKeys("KeyW"), facing(1, 0), getBlock, registry);
      expect(player.position.y, `frame ${frame}: climbed a wall it shouldn't`).toBe(GROUND_TOP);
    }
    expect(player.position.x).toBeCloseTo(9.7, 6);
  });

  it("does not hop when the autoJump setting is off", () => {
    useSettingsStore.setState({ autoJump: false });
    const player = new PlayerController(8, GROUND_TOP, 20.5);
    player.onGround = true;
    const getBlock = ledgeWorld("x", 10, 1);

    for (let frame = 0; frame < 180; frame++) {
      player.update(1 / 60, heldKeys("KeyW"), facing(1, 0), getBlock, registry);
      expect(player.position.y, `frame ${frame}: hopped with autoJump disabled`).toBe(GROUND_TOP);
    }
    expect(player.position.x).toBeCloseTo(9.7, 6);
  });

  it("does not hop while crouching", () => {
    const player = new PlayerController(8, GROUND_TOP, 20.5);
    player.onGround = true;
    const getBlock = ledgeWorld("x", 10, 1);

    for (let frame = 0; frame < 180; frame++) {
      player.update(1 / 60, heldKeys("KeyW", "ControlLeft"), facing(1, 0), getBlock, registry);
      expect(player.position.y, `frame ${frame}: hopped while crouching`).toBe(GROUND_TOP);
    }
  });

  it("does not hop when there is no head clearance above the ledge", () => {
    const player = new PlayerController(8, GROUND_TOP, 20.5);
    player.onGround = true;
    const getBlock = noClearanceWorld("x", 10, 1);

    for (let frame = 0; frame < 180; frame++) {
      player.update(1 / 60, heldKeys("KeyW"), facing(1, 0), getBlock, registry);
      expect(player.position.y, `frame ${frame}: hopped without head clearance`).toBe(GROUND_TOP);
    }
  });

  it("does not hop while flying (creative)", () => {
    const player = new PlayerController(8, GROUND_TOP, 20.5);
    player.onGround = true;
    player.isFlying = true;
    const getBlock = ledgeWorld("x", 10, 1);

    for (let frame = 0; frame < 180; frame++) {
      player.update(1 / 60, heldKeys("KeyW"), facing(1, 0), getBlock, registry, true);
      // Neither Space nor Ctrl is held, so flight hovers (velocity.y = 0 every
      // frame); the only thing that could move the player off GROUND_TOP is
      // the autoJump impulse, which must never fire while flying.
      expect(player.position.y, `frame ${frame}: autoJump fired while flying`).toBe(GROUND_TOP);
    }
    expect(player.isFlying).toBe(true);
  });
});

describe("PlayerController knockback impulse channel", () => {
  const flatWorld = (x: number, y: number) => (y <= 64 ? STONE : AIR);

  it("still displaces the player while a movement key is held", () => {
    // Camera faces purely along +Z, so holding forward drives velocity.z
    // only -- velocity.x from input is 0 every frame. Before H5, applyKnockback
    // wrote straight into velocity.x, which this same input assignment wiped
    // out on the very next frame. Any +X movement here can only come from the
    // decaying knockback channel.
    const player = new PlayerController(10, GROUND_TOP, 10);
    player.onGround = true;
    player.applyKnockback(player.position.x - 5, player.position.z, 5);

    const startX = player.position.x;
    player.update(1 / 60, heldKeys("KeyW"), facing(0, 1), flatWorld, registry);

    expect(player.position.x).toBeGreaterThan(startX);
  });

  it("decays exponentially rather than persisting at full strength", () => {
    const player = new PlayerController(10, GROUND_TOP, 10);
    player.onGround = true;
    player.applyKnockback(player.position.x - 5, player.position.z, 5);

    const dt = 1 / 60;
    const keys = heldKeys(); // isolate the knockback channel from input entirely
    const camera = facing(0, 1);

    const xs: number[] = [player.position.x];
    for (let frame = 0; frame < 120; frame++) {
      player.update(dt, keys, camera, flatWorld, registry);
      xs.push(player.position.x);
    }

    const earlyDelta = xs[5] - xs[0];
    const lateDelta = xs[110] - xs[105];
    expect(earlyDelta).toBeGreaterThan(0);
    expect(lateDelta).toBeGreaterThanOrEqual(0);
    expect(lateDelta).toBeLessThan(earlyDelta);
    // Effectively spent within two seconds of game time.
    expect(xs[119]).toBeCloseTo(xs[100], 3);
  });

  it("is zeroed the instant its axis hits a wall, rather than pushing forever", () => {
    const wallWorld = (x: number, y: number) => (y <= 64 || (x >= 11 && y >= 65 && y <= 67) ? STONE : AIR);
    const player = new PlayerController(10, GROUND_TOP, 10);
    const internal = player as unknown as { knockback: { x: number; z: number } };
    player.onGround = true;
    player.applyKnockback(player.position.x - 5, player.position.z, 5);
    expect(internal.knockback.x).toBeGreaterThan(0);

    const dt = 1 / 60;
    const keys = heldKeys();
    const camera = facing(0, 1);

    let zeroedByWallHit = false;
    for (let frame = 0; frame < 200 && !zeroedByWallHit; frame++) {
      player.update(dt, keys, camera, wallWorld, registry);
      // The player's max edge (x + 0.3) must never cross the wall face at x=11.
      expect(player.position.x, `frame ${frame}: passed through the wall`).toBeLessThanOrEqual(10.7 + 1e-6);
      if (internal.knockback.x === 0) zeroedByWallHit = true;
    }

    expect(zeroedByWallHit, "knockback channel was never zeroed by a wall hit").toBe(true);
  });
});
