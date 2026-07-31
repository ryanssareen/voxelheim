import { beforeAll, describe, expect, it, vi } from "vitest";
import { PlayerController } from "@engine/player/PlayerController";
import { Mob } from "@engine/entities/Mob";
import type { InputManager } from "@engine/InputManager";
import type { Camera } from "@engine/player/Camera";
import { maxBlock } from "@engine/physics";
import type { BlockRegistry } from "@engine/world/BlockRegistry";

const AIR = 0;
const STONE = 1;
const GROUND_TOP = 65; // solid terrain fills y <= 64, so entities stand at y = 65

const registry = { isSolid: (id: number) => id === STONE } as unknown as BlockRegistry;

/** Flat terrain (y <= 64) with a 3-tall wall plane at the given axis coordinate. */
function flatWorldWithWall(axis: "x" | "z", coord: number) {
  return (x: number, y: number, z: number) =>
    y <= 64 || ((axis === "x" ? x : z) === coord && y >= 65 && y <= 67) ? STONE : AIR;
}

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

describe("maxBlock", () => {
  it("excludes a block the AABB edge only touches", () => {
    expect(maxBlock(10)).toBe(9);
    expect(maxBlock(0)).toBe(-1);
    expect(maxBlock(-3)).toBe(-4);
  });

  it("includes a block the AABB edge genuinely enters", () => {
    expect(maxBlock(10.05)).toBe(10);
    expect(maxBlock(10.999)).toBe(10);
    expect(maxBlock(-2.5)).toBe(-3);
  });

  it("matches the flush edge left behind by a +X collision snap", () => {
    // moveAxis resolves a +X hit on block 10 as `x = 10 - HALF_WIDTH`.
    const halfWidth = 0.3;
    const x = 10 - halfWidth;
    expect(x + halfWidth).toBe(10); // exactly flush, not merely close
    expect(maxBlock(x + halfWidth)).toBe(9);
  });
});

describe("PlayerController wall collision", () => {
  // The wall plane sits at coordinate 10. The player walks into it from each
  // side. Approaching along +X or +Z used to leave the player's AABB edge
  // exactly on the block boundary, which resolveOverlap read as a real overlap:
  // it shoved the player sideways and then ratcheted them up the wall one block
  // per frame until they walked over the top.
  const cases = [
    { name: "travelling +X", axis: "x" as const, start: 8, dir: 1, expected: 9.7 },
    { name: "travelling -X", axis: "x" as const, start: 13, dir: -1, expected: 11.3 },
    { name: "travelling +Z", axis: "z" as const, start: 8, dir: 1, expected: 9.7 },
    { name: "travelling -Z", axis: "z" as const, start: 13, dir: -1, expected: 11.3 },
  ];

  for (const c of cases) {
    it(`stops at the wall when ${c.name}, without climbing or sliding`, () => {
      const crossAxis = c.axis === "x" ? "z" : "x";
      const startCross = 20.5;
      const player =
        c.axis === "x"
          ? new PlayerController(c.start, GROUND_TOP, startCross)
          : new PlayerController(startCross, GROUND_TOP, c.start);

      const getBlock = flatWorldWithWall(c.axis, 10);
      const keys = heldKeys("KeyW");
      const camera = c.axis === "x" ? facing(c.dir, 0) : facing(0, c.dir);

      for (let frame = 0; frame < 180; frame++) {
        player.update(1 / 60, keys, camera, getBlock, registry);

        // The player must never leave the ground — walking into a wall is not a climb.
        expect(
          player.position.y,
          `frame ${frame}: player left the ground (climbed the wall)`
        ).toBe(GROUND_TOP);
      }

      // Parked flush against the wall face, not through it.
      expect(player.position[c.axis]).toBeCloseTo(c.expected, 6);
      // No sideways teleport along the untouched axis.
      expect(player.position[crossAxis]).toBeCloseTo(startCross, 6);
    });
  }

  it("still pushes the player out of a block they are genuinely inside", () => {
    // Guards the overlap resolver: tightening the scan range must not stop it
    // from rescuing a player who is actually embedded in a block.
    const player = new PlayerController(10.5, GROUND_TOP, 20.5);
    const getBlock = flatWorldWithWall("x", 10);

    player.update(1 / 60, heldKeys(), facing(1, 0), getBlock, registry);

    const stillInsideWall =
      player.position.x > 10 && player.position.x < 11 && player.position.y < 68;
    expect(stillInsideWall, "player is still embedded in the wall").toBe(false);
  });
});

/**
 * Mob.takeDamage renders a floating damage number to a 2D canvas. The physics
 * under test needs none of that, so stub out just enough DOM to get past it.
 */
function stubCanvas(): void {
  const ctx2d = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.stubGlobal("document", {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }),
  });
}

describe("Mob wall collision", () => {
  beforeAll(stubCanvas);

  it("stays on the ground after being knocked into a wall", () => {
    // Hitting a mob applies horizontal knockback. When that knockback parked the
    // mob flush against a wall face, the next zero-velocity Y move was treated as
    // upward motion and resolved as a ceiling hit, dropping the mob by its own
    // height. Repeating each frame, it sank out of the world and void-died.
    const mob = new Mob("pig", 8, GROUND_TOP, 20.5);
    mob.onGround = true;
    const getBlock = flatWorldWithWall("x", 10);
    const playerPos = { x: 7, y: GROUND_TOP, z: 20.5 };

    // Attacker stands at x=7, so the mob is knocked toward +X into the wall.
    mob.takeDamage(1, { x: playerPos.x, z: playerPos.z });

    for (let frame = 0; frame < 300; frame++) {
      mob.update(1 / 60, getBlock, registry, playerPos);
      expect(
        mob.position.y,
        `frame ${frame}: mob sank below the ground surface`
      ).toBeGreaterThanOrEqual(GROUND_TOP);
    }

    expect(mob.dead, "mob void-died after knockback").toBe(false);
    expect(mob.position.x, "mob passed through the wall").toBeLessThanOrEqual(10);
  });
});
