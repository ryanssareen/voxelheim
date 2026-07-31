import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { Camera } from "@engine/player/Camera";

describe("Camera", () => {
  it("default forward is (0, 0, -1)", () => {
    const cam = new Camera();
    const f = cam.getForward();
    expect(f.x).toBeCloseTo(0);
    expect(f.y).toBeCloseTo(0);
    expect(f.z).toBeCloseTo(-1);
  });

  it("yaw rotated 90° → forward is (-1, 0, 0)", () => {
    const cam = new Camera();
    cam.yaw = Math.PI / 2;
    const f = cam.getForward();
    expect(f.x).toBeCloseTo(-1);
    expect(f.z).toBeCloseTo(0);
  });

  it("clamps pitch at +89°", () => {
    const cam = new Camera();
    cam.update(0, -100000, 0.01); // large negative dy → large positive pitch
    const maxPitch = (89 * Math.PI) / 180;
    expect(cam.pitch).toBeCloseTo(maxPitch);
  });

  it("clamps pitch at -89°", () => {
    const cam = new Camera();
    cam.update(0, 100000, 0.01); // large positive dy → large negative pitch
    const maxPitch = (89 * Math.PI) / 180;
    expect(cam.pitch).toBeCloseTo(-maxPitch);
  });

  it("getLookDirection includes pitch", () => {
    const cam = new Camera();
    cam.pitch = Math.PI / 4; // 45° up
    const dir = cam.getLookDirection();
    expect(dir.y).toBeGreaterThan(0);
    expect(Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z)).toBeCloseTo(1);
  });
});

/**
 * Third person used to sit a fixed 5 blocks behind the eye with no regard for
 * what was in between, so standing underground or backed against a wall put the
 * camera inside solid terrain — you saw block backfaces and the void beyond.
 */
describe("Camera third-person obstruction", () => {
  const EYE_H = 1.6;
  const FEET = { x: 0, y: 65, z: 0 };
  const eyeY = FEET.y + EYE_H;
  const openWorld = () => false;

  /** With default yaw the eye looks -Z, so the back camera swings out toward +Z. */
  const wallAtPositiveZ = (limit: number) => (_x: number, _y: number, z: number) =>
    z >= limit;

  function place(
    mode: "third-person-back" | "third-person-front",
    isSolidAt: (x: number, y: number, z: number) => boolean
  ) {
    const cam = new Camera();
    cam.mode = mode;
    const three = new THREE.PerspectiveCamera(75, 1, 0.1, 300);
    cam.applyToThreeCamera(three, FEET, EYE_H, isSolidAt);
    return three.position;
  }

  const voxelIsSolid = (
    p: THREE.Vector3,
    isSolidAt: (x: number, y: number, z: number) => boolean
  ) => isSolidAt(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));

  it("keeps the full distance when nothing is in the way", () => {
    const p = place("third-person-back", openWorld);
    expect(p.z).toBeCloseTo(5, 6);
    expect(p.y).toBeCloseTo(eyeY, 6);
  });

  it("pulls in short of a wall behind the player", () => {
    const solid = wallAtPositiveZ(2);
    const p = place("third-person-back", solid);
    expect(p.z).toBeLessThan(2);
    expect(p.z).toBeGreaterThan(0);
    expect(voxelIsSolid(p, solid), "camera ended up inside the wall").toBe(false);
  });

  it("never lands inside geometry at any pitch", () => {
    // Sweep pitch through the full range against a box that encloses the player.
    const box = (x: number, y: number, z: number) =>
      x <= -3 || x >= 3 || y <= 62 || y >= 69 || z <= -3 || z >= 3;
    for (let deg = -89; deg <= 89; deg += 7) {
      const cam = new Camera();
      cam.mode = "third-person-back";
      cam.pitch = (deg * Math.PI) / 180;
      const three = new THREE.PerspectiveCamera(75, 1, 0.1, 300);
      cam.applyToThreeCamera(three, FEET, EYE_H, box);
      expect(
        voxelIsSolid(three.position, box),
        `pitch ${deg}° put the camera inside a block`
      ).toBe(false);
    }
  });

  it("applies the same clamp to the front-facing camera", () => {
    // Front mode swings the opposite way, toward -Z.
    const solid = (_x: number, _y: number, z: number) => z <= -2;
    const p = place("third-person-front", solid);
    expect(p.z).toBeGreaterThan(-2);
    expect(voxelIsSolid(p, solid), "front camera ended up inside the wall").toBe(false);
  });

  it("falls back to the eye position when fully enclosed", () => {
    const p = place("third-person-back", () => true);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
    const fromEye = Math.hypot(p.x - FEET.x, p.y - eyeY, p.z - FEET.z);
    expect(fromEye).toBeLessThan(1);
  });

  it("still works without a solidity probe (first-person and legacy callers)", () => {
    const cam = new Camera();
    cam.mode = "third-person-back";
    const three = new THREE.PerspectiveCamera(75, 1, 0.1, 300);
    cam.applyToThreeCamera(three, FEET, EYE_H);
    expect(three.position.z).toBeCloseTo(5, 6);
  });
});

/**
 * Once the boom can shorten, the camera can end up close enough that the player
 * model fills the view or clips through the near plane. It has to hide itself.
 */
describe("Camera player-model visibility", () => {
  const EYE_H = 1.6;
  const FEET = { x: 0, y: 65, z: 0 };

  function visibilityWith(
    mode: "first-person" | "third-person-back",
    isSolidAt?: (x: number, y: number, z: number) => boolean
  ) {
    const cam = new Camera();
    cam.mode = mode;
    const three = new THREE.PerspectiveCamera(75, 1, 0.1, 300);
    cam.applyToThreeCamera(three, FEET, EYE_H, isSolidAt);
    return cam.isPlayerModelVisible();
  }

  it("hides the model in first person", () => {
    expect(visibilityWith("first-person", () => false)).toBe(false);
  });

  it("shows the model when the boom has room", () => {
    expect(visibilityWith("third-person-back", () => false)).toBe(true);
  });

  it("hides the model when a wall squeezes the boom in close", () => {
    // Solid from z=1 outward leaves well under a block of boom.
    expect(visibilityWith("third-person-back", (_x, _y, z) => z >= 1)).toBe(false);
  });

  it("hides the model when fully enclosed", () => {
    expect(visibilityWith("third-person-back", () => true)).toBe(false);
  });

  it("still shows the model at a moderate pull-in", () => {
    // Solid from z=4 leaves ~3.7 of boom — plenty to see the body.
    expect(visibilityWith("third-person-back", (_x, _y, z) => z >= 4)).toBe(true);
  });

  it("defaults to visible in third person before any frame is applied", () => {
    const cam = new Camera();
    cam.mode = "third-person-back";
    expect(cam.isPlayerModelVisible()).toBe(true);
  });
});
