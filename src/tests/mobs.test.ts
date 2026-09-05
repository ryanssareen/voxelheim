import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { Mob } from "@engine/entities/Mob";
import { createMobModel } from "@engine/entities/MobModel";
import { MobManager } from "@engine/entities/MobManager";
import { playCreeperHiss } from "@engine/entities/MobSfx";
import { useSettingsStore } from "@store/useSettingsStore";
import type { BlockRegistry } from "@engine/world/BlockRegistry";
import type { ChunkManager } from "@engine/world/ChunkManager";

const AIR = 0;
const STONE = 1;
const GROUND_TOP = 65; // flat terrain fills y <= 64, entities stand at y = 65

// Creeper's model is authored to a height of 1.2; MOB_CONFIGS scales it up to
// 1.5 so it reads as roughly player-sized, via a resting group scale of
// 1.5 / 1.2 that the fuse swell (1x -> ~1.3x) multiplies on top of.
const CREEPER_BASE_SCALE = 1.5 / 1.2;

const registry = { isSolid: (id: number) => id === STONE } as unknown as BlockRegistry;

/** Flat terrain, no obstacles. */
function flatWorld(x: number, y: number): number {
  return y <= 64 ? STONE : AIR;
}

/** Flat terrain with a 3-tall wall plane at the given x coordinate. */
function flatWorldWithWallX(coord: number) {
  return (x: number, y: number) =>
    y <= 64 || (x === coord && y >= 65 && y <= 67) ? STONE : AIR;
}

/**
 * Mob construction and takeDamage render to a 2D canvas (name tags, damage
 * numbers) and mob surfaces paint value-map textures. Neither is needed for
 * the physics/state under test, so stub just enough DOM to get past it — same
 * pattern as src/tests/collision.test.ts.
 */
function stubCanvas(): void {
  const ctx2d = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.stubGlobal("document", {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }),
  });
}

beforeAll(stubCanvas);

describe("E1 knockback", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("displaces a zombie 0.3-0.8 blocks and never drops it below the ground", () => {
    const mob = new Mob("zombie", 8, GROUND_TOP, 20.5);
    const playerPos = { x: 7, y: GROUND_TOP, z: 20.5 };
    mob.takeDamage(1, { x: playerPos.x, z: playerPos.z });

    for (let frame = 0; frame < 60; frame++) {
      mob.update(1 / 60, flatWorld, registry, playerPos);
      expect(mob.position.y, `frame ${frame}: mob left the ground`).toBeGreaterThanOrEqual(GROUND_TOP);
    }

    expect(mob.position.x - 8).toBeGreaterThan(0.3);
    expect(mob.position.x - 8).toBeLessThan(0.8);
  });

  it("bumps attackCooldown to the stagger duration immediately on hit", () => {
    const mob = new Mob("zombie", 8, GROUND_TOP, 20.5);
    mob.takeDamage(1, { x: 7, z: 20.5 });
    expect(mob.attackCooldown).toBeGreaterThanOrEqual(0.3);
  });

  it("adds the impulse on top of AI velocity rather than overwriting it, then lets it decay away", () => {
    const mob = new Mob("pig", 8, GROUND_TOP, 20.5);
    const playerPos = { x: 7, y: GROUND_TOP, z: 20.5 };
    mob.takeDamage(1, { x: playerPos.x, z: playerPos.z });

    let sawCombinedSpeedAboveFlee = false;
    for (let frame = 0; frame < 90; frame++) {
      mob.update(1 / 60, flatWorld, registry, playerPos);
      const combined = Math.abs(mob.velocity.x) + Math.abs((mob as unknown as { knockback: { x: number } }).knockback.x);
      if (combined > 4.01) sawCombinedSpeedAboveFlee = true;
    }

    // At some point while the impulse is still live, it must have added to
    // (not replaced) the pig's own 4 m/s flee velocity.
    expect(sawCombinedSpeedAboveFlee).toBe(true);

    // After 90 frames (1.5s) the impulse has fully decayed — only flee speed remains.
    expect(Math.abs(mob.velocity.x)).toBeLessThanOrEqual(4.0001);
    const remainingKnockback = (mob as unknown as { knockback: { x: number } }).knockback.x;
    expect(Math.abs(remainingKnockback)).toBeLessThan(0.01);
  });

  it("still parks flush against a wall and never falls through the floor (collision.test.ts parity)", () => {
    const mob = new Mob("zombie", 8, GROUND_TOP, 20.5);
    mob.onGround = true;
    const getBlock = flatWorldWithWallX(10);
    const playerPos = { x: 7, y: GROUND_TOP, z: 20.5 };
    mob.takeDamage(1, { x: playerPos.x, z: playerPos.z });

    for (let frame = 0; frame < 300; frame++) {
      mob.update(1 / 60, getBlock, registry, playerPos);
      expect(mob.position.y, `frame ${frame}: mob sank below the ground`).toBeGreaterThanOrEqual(GROUND_TOP);
    }

    expect(mob.dead, "mob void-died after knockback").toBe(false);
    expect(mob.position.x, "mob passed through the wall").toBeLessThanOrEqual(10);
  });
});

describe("E5 idle breathing", () => {
  beforeEach(() => {
    // Forced idle: Math.random() = 0 always takes the "stay put" branch of
    // updatePassiveAI's aiTimer roll (0 > 0.4 is false).
    vi.spyOn(Math, "random").mockReturnValue(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("oscillates the body around its rest height instead of drifting", () => {
    const mob = new Mob("pig", 8, GROUND_TOP, 20.5);
    const restY = (mob as unknown as { bodyRestY: number }).bodyRestY;
    expect(restY).toBeCloseTo(0.35, 6);

    const playerPos = { x: 1000, y: GROUND_TOP, z: 1000 }; // far away, no head tracking
    let min = Infinity;
    let max = -Infinity;
    for (let frame = 0; frame < 300; frame++) {
      mob.update(1 / 60, flatWorld, registry, playerPos);
      const bodyY = (mob as unknown as { model: { body: THREE.Mesh } }).model.body.position.y;
      expect(Math.abs(bodyY - restY), `frame ${frame}: body drifted`).toBeLessThanOrEqual(0.0100001);
      min = Math.min(min, bodyY);
      max = Math.max(max, bodyY);
    }
    expect(max - min, "breathing produced no visible oscillation").toBeGreaterThan(0.005);
  });

  it("snaps the body back to rest height when the mob starts moving", () => {
    const mob = new Mob("pig", 8, GROUND_TOP, 20.5);
    const restY = (mob as unknown as { bodyRestY: number }).bodyRestY;
    const playerPos = { x: 1000, y: GROUND_TOP, z: 1000 };

    // Idle for a while so breathing has visibly offset the body.
    for (let frame = 0; frame < 20; frame++) mob.update(1 / 60, flatWorld, registry, playerPos);

    // Force movement (bypasses the aiTimer roll entirely).
    (mob as unknown as { isMoving: boolean }).isMoving = true;
    mob.update(1 / 60, flatWorld, registry, playerPos);

    const bodyY = (mob as unknown as { model: { body: THREE.Mesh } }).model.body.position.y;
    expect(bodyY).toBeCloseTo(restY, 6);
  });
});

describe("E4 facing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("aligns the model's local +X with the direction of travel while wandering", () => {
    // Math.random() = 0.5 clears the > 0.4 threshold so updatePassiveAI's
    // aiTimer roll always picks "start moving" with a fixed target yaw.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const mob = new Mob("pig", 8, GROUND_TOP, 20.5);
    const playerPos = { x: 1000, y: GROUND_TOP, z: 1000 };

    for (let frame = 0; frame < 30; frame++) mob.update(1 / 60, flatWorld, registry, playerPos);

    const vx = mob.velocity.x;
    const vz = mob.velocity.z;
    const speed = Math.sqrt(vx * vx + vz * vz);
    expect(speed).toBeGreaterThan(0.1); // actually moving

    const face = new THREE.Vector3(1, 0, 0).applyQuaternion(mob.group.quaternion);
    const dot = (face.x * vx + face.z * vz) / speed;
    expect(dot).toBeGreaterThan(0.99);
  });

  it("keeps the model on its feet after the yaw offset (bounding box unaffected)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const mob = new Mob("zombie", 8, GROUND_TOP, 20.5);
    const playerPos = { x: 1000, y: GROUND_TOP, z: 1000 };
    for (let frame = 0; frame < 10; frame++) mob.update(1 / 60, flatWorld, registry, playerPos);

    const box = new THREE.Box3().setFromObject(mob.group);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
  });

  it("turns the head toward the player using the correct pitch axis", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const mob = new Mob("zombie", 8, GROUND_TOP, 20.5);

    // Player level with the mob and close enough to track, but outside melee
    // range so the AI does not zero velocity/yaw out from under the test.
    const level = { x: 12, y: GROUND_TOP, z: 20.5 };
    for (let frame = 0; frame < 5; frame++) mob.update(1 / 60, flatWorld, registry, level);

    // Now the player is well above — pitch should tilt the face upward.
    const above = { x: 12, y: GROUND_TOP + 6, z: 20.5 };
    for (let frame = 0; frame < 5; frame++) mob.update(1 / 60, flatWorld, registry, above);

    const head = (mob as unknown as { model: { head: THREE.Mesh } }).model.head;
    const headForward = new THREE.Vector3(1, 0, 0);
    const worldQuat = new THREE.Quaternion();
    head.getWorldQuaternion(worldQuat);
    headForward.applyQuaternion(worldQuat);
    expect(headForward.y).toBeGreaterThan(0);
  });
});

describe("E3 skeleton model", () => {
  it("fits inside its 1.6-tall hitbox and uses the re-proportioned dimensions", () => {
    const model = createMobModel("skeleton");
    const box = new THREE.Box3().setFromObject(model.group);
    expect(box.max.y).toBeLessThanOrEqual(1.6 + 1e-6);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.01);

    expect(model.head).toBeDefined();
    const head = model.head as THREE.Mesh;
    const headGeo = head.geometry as THREE.BoxGeometry;
    expect(headGeo.parameters.width).toBeCloseTo(0.4, 6);

    const headBox = new THREE.Box3().setFromObject(head);
    const headZExtent = headBox.max.z - headBox.min.z;
    expect(headZExtent).toBeCloseTo(0.4, 6);

    // Arms aren't exposed on MobModelData directly — find them by their
    // authored offset (legs sit at |z| = 0.1, arms at x = 0, |z| = 0.25; the
    // bow shares the arm's z but sits forward at x = 0.28).
    const arms = model.group.children.filter(
      (c): c is THREE.Mesh =>
        c instanceof THREE.Mesh && c.position.x === 0 && Math.abs(Math.abs(c.position.z) - 0.25) < 1e-6
    );
    expect(arms.length).toBe(2);
    // Measure from each arm's own box (not its elbow-knuckle child, which
    // bulges very slightly past the arm's own flank) — the span that matters
    // for the head/shoulder ratio is the mounting width.
    const armSpan = arms.reduce((widest, arm) => {
      const geo = arm.geometry as THREE.BoxGeometry;
      const edge = Math.abs(arm.position.z) + geo.parameters.depth / 2;
      return Math.max(widest, edge * 2);
    }, 0);
    expect(armSpan).toBeCloseTo(0.6, 6);
    expect(headZExtent).toBeLessThanOrEqual(armSpan);

    // Ribs/sternum sit on the +x chest face, not the flanks.
    for (const child of model.body.children) {
      expect(Math.abs(child.position.z), "detail mesh drifted onto a flank").toBeLessThan(0.09);
      expect(child.position.x, "detail mesh is not on the +x chest face").toBeGreaterThan(0.1);
    }

    const mat = head.material as THREE.MeshLambertMaterial;
    expect(mat.color.getHex()).toBe(0xd6d6d6);
  });
});

describe("E2 creeper fuse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  type CreeperInternals = {
    exploding: boolean;
    explodeTimer: number;
    fusePhase: number;
    fuseDetonated: boolean;
    group: THREE.Group;
  };

  function igniteCreeper(): { mob: Mob; playerPos: { x: number; y: number; z: number } } {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const mob = new Mob("creeper", 8, GROUND_TOP, 20.5);
    const playerPos = { x: 9, y: GROUND_TOP, z: 20.5 }; // dist 1, within attackRange (2)
    mob.update(1 / 60, flatWorld, registry, playerPos); // ignites on this frame
    expect((mob as unknown as CreeperInternals).exploding).toBe(true);
    return { mob, playerPos };
  }

  it("swells and flashes on an accelerating pulse, then detonates", () => {
    const { mob, playerPos } = igniteCreeper();
    const internals = mob as unknown as CreeperInternals;

    const framesFor = (seconds: number) => Math.round(seconds * 60);
    for (let frame = 0; frame < framesFor(0.75) - 1; frame++) {
      mob.update(1 / 60, flatWorld, registry, playerPos);
    }
    expect(mob.group.scale.x).toBeCloseTo(1.15 * CREEPER_BASE_SCALE, 1);

    for (let frame = framesFor(0.75); frame < framesFor(1.49); frame++) {
      mob.update(1 / 60, flatWorld, registry, playerPos);
    }
    expect(mob.group.scale.x).toBeCloseTo(1.3 * CREEPER_BASE_SCALE, 1);

    expect(internals.fuseDetonated).toBe(false);
    for (let frame = framesFor(1.49); frame < framesFor(1.6); frame++) {
      mob.update(1 / 60, flatWorld, registry, playerPos);
    }
    expect(mob.dead).toBe(true);
    expect(internals.fuseDetonated).toBe(true);
  });

  it("aborts when the player retreats out of fuseAbortRange, resetting scale and colour", () => {
    const { mob } = igniteCreeper();
    const internals = mob as unknown as CreeperInternals;

    // Burn a bit of the fuse first so scale/colour actually have something to reset.
    for (let frame = 0; frame < 20; frame++) mob.update(1 / 60, flatWorld, registry, { x: 9, y: GROUND_TOP, z: 20.5 });
    expect(mob.group.scale.x).toBeGreaterThan(CREEPER_BASE_SCALE);

    const farAway = { x: 12, y: GROUND_TOP, z: 20.5 }; // dist 4 > fuseAbortRange (3.5)
    mob.update(1 / 60, flatWorld, registry, farAway);

    expect(internals.exploding).toBe(false);
    expect(mob.group.scale.x).toBeCloseTo(CREEPER_BASE_SCALE, 6);
    for (const obj of mob.group.children) {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshLambertMaterial) {
        // Every material must have been restored to its original colour.
        expect(obj.material.color.getHex()).not.toBe(0xffffff);
      }
    }

    // Stays dormant afterward — no delayed detonation. Push the player
    // beyond detectRange too, so the aborted creeper wanders instead of
    // re-chasing and re-igniting when it catches back up.
    const wayOut = { x: 1000, y: GROUND_TOP, z: 1000 };
    for (let frame = 0; frame < 180; frame++) mob.update(1 / 60, flatWorld, registry, wayOut);
    expect(mob.dead).toBe(false);
    expect(internals.fuseDetonated).toBe(false);
  });

  it("aborts when switched to creative mode", () => {
    const { mob, playerPos } = igniteCreeper();
    const internals = mob as unknown as CreeperInternals;

    mob.update(1 / 60, flatWorld, registry, playerPos, undefined, true);

    expect(internals.exploding).toBe(false);
    expect(mob.group.scale.x).toBeCloseTo(CREEPER_BASE_SCALE, 6);
  });

  it("accelerates the flash pulse as the fuse burns down", () => {
    const { mob, playerPos } = igniteCreeper();
    const internals = mob as unknown as CreeperInternals;

    const phases: number[] = [];
    for (let frame = 0; frame < 90; frame++) {
      mob.update(1 / 60, flatWorld, registry, playerPos);
      phases.push(internals.fusePhase);
    }

    const toggles = (arr: number[]) => {
      let count = 0;
      for (let i = 1; i < arr.length; i++) {
        if (Math.sign(Math.sin(arr[i])) !== Math.sign(Math.sin(arr[i - 1]))) count++;
      }
      return count;
    };

    const firstHalfToggles = toggles(phases.slice(0, 30));
    const lastHalfToggles = toggles(phases.slice(60, 90));
    expect(lastHalfToggles).toBeGreaterThan(firstHalfToggles);
  });

  it("does not detonate a creeper killed by melee (sword-killed creeper never sets fuseDetonated)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const mob = new Mob("creeper", 8, GROUND_TOP, 20.5);
    const farPlayer = { x: 1000, y: GROUND_TOP, z: 1000 }; // never ignites
    mob.takeDamage(20, { x: 9, z: 20.5 }); // lethal melee hit
    expect(mob.dead).toBe(true);

    for (let frame = 0; frame < 40; frame++) {
      mob.update(1 / 60, flatWorld, registry, farPlayer);
      expect((mob as unknown as CreeperInternals).fuseDetonated, `frame ${frame}`).toBe(false);
    }
    expect(mob.deathTimer).toBeLessThan(0);
  });

  it("gates MobManager's explosion on fuseDetonated, not on the dead/deathTimer/age coincidence", () => {
    const scene = { add: () => undefined, remove: () => undefined } as unknown as THREE.Scene;
    const manager = new MobManager(scene);
    const chunkManager = {
      worldType: "island",
      getIslandSize: () => 64,
      getBlock: (x: number, y: number) => flatWorld(x, y),
      setBlock: vi.fn(),
    } as unknown as ChunkManager;

    vi.spyOn(Math, "random").mockReturnValue(0);
    const swordVictim = new Mob("creeper", 8, GROUND_TOP, 20.5);
    swordVictim.takeDamage(20, { x: 9, z: 20.5 });
    (manager as unknown as { mobs: Mob[] }).mobs.push(swordVictim);

    const farPlayer = { x: 1000, y: GROUND_TOP, z: 1000 };
    for (let frame = 0; frame < 40; frame++) {
      manager.update(1 / 60, chunkManager, farPlayer, 0.5);
    }
    expect(chunkManager.setBlock).not.toHaveBeenCalled();
  });
});

describe("E2 creeper hiss (MobSfx)", () => {
  afterEach(() => {
    // unstubAllGlobals() also strips the file-level document stub from
    // beforeAll(stubCanvas) — put it back so later tests can still construct
    // mobs (name tags, damage numbers).
    vi.unstubAllGlobals();
    stubCanvas();
    vi.restoreAllMocks();
  });

  it("returns null and does not throw without an AudioContext (node/SSR safety)", () => {
    expect(typeof AudioContext).toBe("undefined");
    let handle: ReturnType<typeof playCreeperHiss> = null;
    expect(() => {
      handle = playCreeperHiss(3, 1.5);
    }).not.toThrow();
    expect(handle).toBeNull();
  });

  it("returns null when music is disabled, even with an AudioContext available", () => {
    useSettingsStore.getState().setMusicEnabled(false);
    try {
      vi.stubGlobal("AudioContext", makeFakeAudioContextCtor());
      expect(playCreeperHiss(3, 1.5)).toBeNull();
    } finally {
      useSettingsStore.getState().setMusicEnabled(true);
    }
  });

  it("starts one buffer source when ignited and stops it on abort, given a stubbed AudioContext", () => {
    const { ctor, instances } = trackedFakeAudioContextCtor();
    vi.stubGlobal("AudioContext", ctor);

    vi.spyOn(Math, "random").mockReturnValue(0);
    const mob = new Mob("creeper", 8, GROUND_TOP, 20.5);
    const playerPos = { x: 9, y: GROUND_TOP, z: 20.5 };
    mob.update(1 / 60, flatWorld, registry, playerPos); // ignites -> playCreeperHiss

    expect(instances.length).toBe(1);
    expect(instances[0].sources.length).toBe(1);
    expect(instances[0].sources[0].startCalls).toBe(1);
    expect(instances[0].sources[0].stopCalls).toBe(0);

    const farAway = { x: 12, y: GROUND_TOP, z: 20.5 }; // triggers abortFuse()
    mob.update(1 / 60, flatWorld, registry, farAway);

    expect(instances[0].sources[0].stopCalls).toBe(1);
  });
});

// ─── Fake AudioContext for the MobSfx tests ──────────────────────────────

interface FakeParam {
  value: number;
  setValueAtTime: (v: number, t: number) => void;
  linearRampToValueAtTime: (v: number, t: number) => void;
  cancelScheduledValues: (t: number) => void;
  setTargetAtTime: (v: number, t: number, tc: number) => void;
}

function fakeParam(): FakeParam {
  return {
    value: 0,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    cancelScheduledValues: () => undefined,
    setTargetAtTime: () => undefined,
  };
}

function makeFakeAudioContextCtor() {
  return trackedFakeAudioContextCtor().ctor;
}

function trackedFakeAudioContextCtor() {
  const instances: Array<{
    sources: Array<{ startCalls: number; stopCalls: number }>;
  }> = [];

  class FakeAudioContext {
    sampleRate = 44100;
    currentTime = 0;
    state = "running";
    destination = {};
    sources: Array<{ startCalls: number; stopCalls: number }> = [];

    constructor() {
      instances.push(this);
    }

    createBuffer(_channels: number, length: number, sampleRate: number) {
      const channelData = new Float32Array(length);
      return {
        getChannelData: () => channelData,
        sampleRate,
      };
    }

    createBufferSource() {
      const record = { startCalls: 0, stopCalls: 0 };
      this.sources.push(record);
      return {
        buffer: null as unknown,
        connect: () => undefined,
        start: () => {
          record.startCalls++;
        },
        stop: () => {
          record.stopCalls++;
        },
      };
    }

    createBiquadFilter() {
      return {
        type: "lowpass",
        frequency: fakeParam(),
        Q: fakeParam(),
        connect: () => undefined,
      };
    }

    createGain() {
      return {
        gain: fakeParam(),
        connect: () => undefined,
      };
    }

    resume() {
      return Promise.resolve();
    }
  }

  return { ctor: FakeAudioContext, instances };
}
