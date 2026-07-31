import { beforeAll, describe, expect, it, vi } from "vitest";
import { PlayerController } from "@engine/player/PlayerController";
import { Mob } from "@engine/entities/Mob";
import type { InputManager } from "@engine/InputManager";
import type { Camera } from "@engine/player/Camera";
import { firstBlockingLayer, maxBlock } from "@engine/physics";
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

describe("firstBlockingLayer", () => {
  /** Solid at the given indices along one axis; the other two axes are open. */
  const solidAlong = (axis: "x" | "y" | "z", indices: number[]) =>
    (x: number, y: number, z: number) =>
      indices.includes(axis === "x" ? x : axis === "y" ? y : z);

  it("returns the nearest face in the direction of travel", () => {
    // Box straddles solid layers 9 and 10. Travelling + hits the low side
    // first; travelling - hits the high side first. Picking the wrong one
    // leaves the entity inside the other layer.
    const solid = solidAlong("x", [9, 10]);
    expect(firstBlockingLayer("x", +1, 9, 10, 0, 0, 0, 0, solid)).toBe(9);
    expect(firstBlockingLayer("x", -1, 9, 10, 0, 0, 0, 0, solid)).toBe(10);
  });

  it("applies the same ordering on Y — a falling entity lands on the top layer", () => {
    const solid = solidAlong("y", [64, 65]);
    expect(firstBlockingLayer("y", -1, 0, 0, 64, 65, 0, 0, solid)).toBe(65);
    expect(firstBlockingLayer("y", +1, 0, 0, 64, 65, 0, 0, solid)).toBe(64);
  });

  it("applies the same ordering on Z", () => {
    const solid = solidAlong("z", [3, 4]);
    expect(firstBlockingLayer("z", +1, 0, 0, 0, 0, 3, 4, solid)).toBe(3);
    expect(firstBlockingLayer("z", -1, 0, 0, 0, 0, 3, 4, solid)).toBe(4);
  });

  it("scans the whole cross-section of a layer, not just one cell", () => {
    // Only one cell in layer 5 is solid, and it is not the first one scanned.
    const solid = (x: number, y: number, z: number) => x === 5 && y === 2 && z === 7;
    expect(firstBlockingLayer("x", 1, 4, 6, 0, 3, 6, 8, solid)).toBe(5);
  });

  it("returns null when nothing blocks", () => {
    expect(firstBlockingLayer("x", 1, 0, 4, 0, 4, 0, 4, () => false)).toBeNull();
  });

  it("is unaffected by direction when only one layer is solid", () => {
    const solid = solidAlong("x", [10]);
    expect(firstBlockingLayer("x", +1, 9, 10, 0, 0, 0, 0, solid)).toBe(10);
    expect(firstBlockingLayer("x", -1, 9, 10, 0, 0, 0, 0, solid)).toBe(10);
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

  it("ejects a player embedded in a 2-thick wall sideways, not up over it", () => {
    // Straddling two solid columns is the case where scan order matters. Moving
    // -X, the nearest blocking face is the HIGHEST solid index, but the scan
    // returned the lowest, resolving the player to a spot still inside the far
    // column. resolveOverlap's foot-safety then lifted them a block per frame
    // until they popped out the top of the wall.
    const twoThickWall = (x: number, y: number) =>
      y <= 64 || ((x === 9 || x === 10) && y >= 65 && y <= 67) ? STONE : AIR;

    // x = 10.0 spans [9.7, 10.3] — overlaps solid columns 9 and 10 at once.
    // Hold W facing -X so update() actually drives a negative-delta move;
    // velocity is recomputed from input every frame, so presetting it is moot.
    const player = new PlayerController(10.0, GROUND_TOP, 20.5);
    player.onGround = true;

    for (let frame = 0; frame < 30; frame++) {
      player.update(1 / 60, heldKeys("KeyW"), facing(-1, 0), twoThickWall, registry);
      expect(
        player.position.y,
        `frame ${frame}: player was extruded up the wall instead of pushed out of it`
      ).toBe(GROUND_TOP);
    }

    const spanLo = Math.floor(player.position.x - 0.3);
    const spanHi = Math.floor(player.position.x + 0.3);
    expect(
      spanLo === 9 || spanLo === 10 || spanHi === 9 || spanHi === 10,
      `player still overlaps a wall column (x=${player.position.x})`
    ).toBe(false);
  });

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
