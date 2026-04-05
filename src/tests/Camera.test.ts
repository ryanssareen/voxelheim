import { describe, it, expect } from "vitest";
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
