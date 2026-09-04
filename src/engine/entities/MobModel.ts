import * as THREE from "three";

export type MobType = "pig" | "cow" | "sheep" | "zombie" | "skeleton" | "creeper";

export interface MobModelData {
  group: THREE.Group;
  legs: THREE.Mesh[];
  head?: THREE.Mesh;
  body: THREE.Mesh;
}

/**
 * Two problems with the previous models:
 *
 *  1. Every surface was one flat MeshLambertMaterial colour, so a pig, a zombie
 *     and a creeper differed only in hue — no hide, wool, bone or mottle.
 *  2. Face and patch details were sub-boxes standing 0.01–0.02 off the parent
 *     surface. At distance that z-fights and shimmers, and the details read as
 *     stickers rather than markings.
 *
 * Fixes:
 *  - Species surface textures generated as VALUE maps. A map can only darken
 *    (white is its ceiling), so each map is measured and material.color is
 *    brightened by 1/mean — the surface lands on the authored colour with real
 *    variation either side of it. Mob.ts's damage flash is unaffected: it
 *    captures whatever colour the material carries.
 *  - Detail meshes get polygonOffset and a real standoff, so they stop
 *    z-fighting at range.
 *  - flatShading on, NearestFilter everywhere: facets stay crisp and blocky
 *    instead of smoothing into plastic.
 *
 * The creeper face is left exactly as authored; only its body surface changed.
 */

// ────────────── value-map textures ──────────────

interface SurfaceMap {
  /** Null when no real 2D canvas is available (SSR, headless tests). */
  tex: THREE.Texture | null;
  mean: number;
}

/** A flat surface with no map — the fallback when canvas is unavailable. */
const NO_MAP: SurfaceMap = { tex: null, mean: 1 };

function hash(x: number, y: number, seed: number): number {
  let h = (x * 73856093) ^ (y * 19349663) ^ (seed * 83492791);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 1000) / 1000;
}

function makeTexture(draw: (g: CanvasRenderingContext2D) => void): SurfaceMap {
  // Mobs are constructed in headless tests and could be constructed during SSR,
  // where there is no canvas to paint into. Fall back to an unmapped surface
  // rather than throwing — the mob still renders in its authored colour.
  if (typeof document === "undefined") return NO_MAP;
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const g = canvas.getContext("2d");
  if (!g) return NO_MAP;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 16, 16);
  draw(g);

  // White is the brightest a map can be, so the highlight levels ARE white and
  // the rest of the field sits below it. That darkens the mean, so measure it
  // and hand it back — surf() brightens material.color by 1/mean to land back
  // on the authored colour.
  let sum = 0;
  try {
    const data = g.getImageData(0, 0, 16, 16).data;
    for (let i = 0; i < data.length; i += 4) sum += data[i];
  } catch {
    return NO_MAP;
  }
  const mean = sum / (16 * 16) / 255;
  if (!(mean > 0)) return NO_MAP;

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return { tex, mean };
}

/** Grey level as a css colour. 1 = white, the brightest a value map can be. */
function lvl(v: number): string {
  const n = Math.max(0, Math.min(255, Math.round(v * 255)));
  const h = n.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}

/** Clumped 2px hide grain — soft, irregular, no visible tiling seam. */
function hideMap(seed: number, strength = 1): SurfaceMap {
  return makeTexture((g) => {
    for (let y = 0; y < 16; y += 2) {
      for (let x = 0; x < 16; x += 2) {
        const n = hash(x, y, seed);
        const v = 1 + (n < 0.28 ? -0.17 : n < 0.52 ? -0.11 : n > 0.88 ? 0 : -0.06) * strength;
        if (v === 1) continue;
        g.fillStyle = lvl(v);
        g.fillRect(x, y, 2, 2);
      }
    }
  });
}

/** Wool: 2px curls with darker crevices between clumps. */
function woolMap(seed: number): SurfaceMap {
  return makeTexture((g) => {
    for (let y = 0; y < 16; y += 2) {
      for (let x = 0; x < 16; x += 2) {
        const n = hash(x, y, seed);
        g.fillStyle = lvl(n < 0.34 ? 0.78 : n < 0.6 ? 0.87 : 1);
        g.fillRect(x, y, 2, 2);
        // Crevices are gated, otherwise one per clump forms a regular grid.
        const c = hash(x + 5, y + 9, seed);
        if (c > 0.55) {
          g.fillStyle = lvl(0.72);
          g.fillRect(x + (c > 0.78 ? 0 : 1), y + 1, 1, 1);
        }
      }
    }
  });
}

/** Bone: vertical hairline cracks plus a few pits. */
function boneMap(seed: number): SurfaceMap {
  return makeTexture((g) => {
    for (const x of [3, 7, 12]) {
      g.fillStyle = lvl(0.76);
      g.fillRect(x, 0, 1, 16);
      g.fillStyle = lvl(1);
      g.fillRect(x - 1, 0, 1, 16);
    }
    for (let i = 0; i < 6; i++) {
      const n = hash(i, i * 5, seed);
      g.fillStyle = lvl(0.72);
      g.fillRect(Math.floor(n * 14) + 1, Math.floor(hash(i * 3, i, seed) * 14) + 1, 1, 1);
    }
  });
}

/** Large irregular mottle — rot blotches, creeper camouflage. */
function mottleMap(seed: number): SurfaceMap {
  return makeTexture((g) => {
    for (let y = 0; y < 16; y += 4) {
      for (let x = 0; x < 16; x += 4) {
        const n = hash(x, y, seed);
        g.fillStyle = lvl(n < 0.3 ? 0.74 : n < 0.55 ? 0.84 : n > 0.85 ? 1 : 0.92);
        g.fillRect(x, y, 4, 4);
        // ragged edge so the blotches do not read as a grid
        const m = hash(x + 1, y + 2, seed);
        g.fillStyle = lvl(m < 0.5 ? 0.8 : 1);
        g.fillRect(x + (m < 0.5 ? 0 : 2), y + 2, 2, 2);
      }
    }
  });
}

// ────────────── materials ──────────────

const PIG_HIDE = () => hideMap(11, 0.8);
const COW_HIDE = () => hideMap(23);
const WOOL = () => woolMap(31);
const SKIN = () => hideMap(43, 0.6);
const ROT = () => mottleMap(53);
const BONE = () => boneMap(61);
const MOTTLE = () => mottleMap(71);

/**
 * Textured surface material. The map is a value map, so `color` still drives
 * hue — and it is brightened by 1/mean so the textured surface lands on the
 * authored colour rather than a darker version of it. Mob.ts captures this
 * compensated colour into originalColors, so the damage flash is unaffected.
 */
function surf(color: number, map: SurfaceMap): THREE.MeshLambertMaterial {
  if (!map.tex) return new THREE.MeshLambertMaterial({ color, flatShading: true });
  const c = new THREE.Color(color).multiplyScalar(1 / map.mean);
  c.r = Math.min(1, c.r);
  c.g = Math.min(1, c.g);
  c.b = Math.min(1, c.b);
  return new THREE.MeshLambertMaterial({ color: c, map: map.tex, flatShading: true });
}

/**
 * Detail material for markings that sit on top of a surface. polygonOffset
 * pushes them toward the viewer in depth only, so they never z-fight with the
 * face they lie on.
 */
function detail(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

// ────────────── mobs ──────────────

function createPig(): MobModelData {
  const group = new THREE.Group();
  const hide = PIG_HIDE();
  const pink = surf(0xf0a0a0, hide);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.3), pink);
  body.position.set(0, 0.35, 0);
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.28), pink);
  head.position.set(0.3, 0.45, 0);
  group.add(head);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.15), detail(0xd08080));
  snout.position.set(0.18, -0.02, 0);
  head.add(snout);
  // nostrils, so the snout reads as a snout
  for (const z of [0.035, -0.035]) {
    const nostril = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.03), detail(0x9a5a5a));
    nostril.position.set(0.05, 0, z);
    snout.add(nostril);
  }
  for (const z of [0.08, -0.08]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.03), detail(0x24201e));
    eye.position.set(0.155, 0.06, z);
    head.add(eye);
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.03), detail(0xd88f8f));
    ear.position.set(-0.02, 0.15, z);
    head.add(ear);
  }

  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [
    [0.15, 0.08],
    [0.15, -0.08],
    [-0.15, 0.08],
    [-0.15, -0.08],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.1), pink);
    leg.position.set(x, 0.09, z);
    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.04, 0.11), detail(0x8a5252));
    hoof.position.set(0, -0.08, 0);
    leg.add(hoof);
    group.add(leg);
    legs.push(leg);
  }

  return { group, legs, head, body };
}

function createCow(): MobModelData {
  const group = new THREE.Group();
  const hide = COW_HIDE();
  const brown = surf(0x8b6914, hide);
  const white = surf(0xf5f5dc, hide);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.35), brown);
  body.position.set(0, 0.4, 0);
  group.add(body);

  // Patches on both flanks rather than one slab through the middle.
  for (const z of [0.181, -0.181]) {
    const patch = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.01), white);
    patch.position.set(0.06, 0.02, z);
    body.add(patch);
    const patch2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.01), white);
    patch2.position.set(-0.18, -0.08, z);
    body.add(patch2);
  }

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), brown);
  head.position.set(0.38, 0.5, 0);
  group.add(head);

  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.18), detail(0xd8c8a8));
  muzzle.position.set(0.17, -0.06, 0);
  head.add(muzzle);
  for (const z of [0.09, -0.09]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.04), detail(0x24201e));
    eye.position.set(0.155, 0.07, z);
    head.add(eye);
    const horn = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.04), detail(0xe0d8c0));
    horn.position.set(0, 0.18, z);
    head.add(horn);
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.06), detail(0x7a5c12));
    ear.position.set(-0.02, 0.1, z * 1.7);
    head.add(ear);
  }

  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [
    [0.18, 0.1],
    [0.18, -0.1],
    [-0.18, 0.1],
    [-0.18, -0.1],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.1), brown);
    leg.position.set(x, 0.11, z);
    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.11), detail(0x3d3428));
    hoof.position.set(0, -0.1, 0);
    leg.add(hoof);
    group.add(leg);
    legs.push(leg);
  }

  return { group, legs, head, body };
}

function createSheep(): MobModelData {
  const group = new THREE.Group();
  const wool = surf(0xf0f0f0, WOOL());
  const skin = surf(0xc0b090, SKIN());

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.4), wool);
  body.position.set(0, 0.4, 0);
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), skin);
  head.position.set(0.32, 0.48, 0);
  group.add(head);

  // Wool cap over the crown, so the head is not a bare cube.
  const fleece = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.27), wool);
  fleece.position.set(-0.04, 0.11, 0);
  head.add(fleece);
  for (const z of [0.07, -0.07]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.03), detail(0x24201e));
    eye.position.set(0.13, 0.03, z);
    head.add(eye);
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.06), detail(0xa8987a));
    ear.position.set(0, 0.06, z * 1.9);
    head.add(ear);
  }
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.06), detail(0x8a7a5e));
  nose.position.set(0.13, -0.06, 0);
  head.add(nose);

  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [
    [0.15, 0.1],
    [0.15, -0.1],
    [-0.15, 0.1],
    [-0.15, -0.1],
  ]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), skin);
    leg.position.set(x, 0.11, z);
    group.add(leg);
    legs.push(leg);
  }

  return { group, legs, head, body };
}

function createZombie(): MobModelData {
  const group = new THREE.Group();
  const rot = ROT();
  const skinGreen = surf(0x5a8a5a, rot);
  const shirtCyan = surf(0x3a9a8a, hideMap(53, 0.7));
  const pantsPurple = surf(0x2e2e6e, hideMap(59, 0.7));

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.25), shirtCyan);
  body.position.set(0, 0.95, 0);
  group.add(body);
  // torn hem
  const hem = new THREE.Mesh(new THREE.BoxGeometry(0.51, 0.06, 0.26), detail(0x2b7266));
  hem.position.set(0, -0.32, 0);
  body.add(hem);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinGreen);
  head.position.set(0, 1.52, 0);
  group.add(head);

  // Sunken sockets: a dark recess with the eye set inside it.
  for (const z of [0.1, -0.1]) {
    const socket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.11, 0.04), detail(0x2c4630));
    socket.position.set(0.255, 0.06, z);
    head.add(socket);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.02), detail(0x14180f));
    eye.position.set(0.02, 0, 0);
    socket.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.04, 0.03), detail(0x3f6242));
    brow.position.set(0.26, 0.14, z);
    head.add(brow);
  }
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.04), detail(0x44693f));
  nose.position.set(0.26, 0.0, 0);
  head.add(nose);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.03), detail(0x14180f));
  mouth.position.set(0.258, -0.1, 0);
  head.add(mouth);

  for (const z of [0.2, -0.2]) {
    const armPivot = new THREE.Group();
    armPivot.position.set(0, 1.15, z);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.15), shirtCyan);
    arm.position.set(0, -0.3, 0);
    armPivot.add(arm);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.15), skinGreen);
    hand.position.set(0, -0.36, 0);
    arm.add(hand);
    // exposed forearm where the sleeve is torn
    const tear = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.16), detail(0x4f7d4f));
    tear.position.set(0, -0.24, 0);
    arm.add(tear);
    // Model forward is local +X: pivoting about Z reaches the arms that way.
    armPivot.rotation.z = Math.PI / 2.5;
    group.add(armPivot);
  }

  const legs: THREE.Mesh[] = [];
  for (const z of [0.08, -0.08]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), pantsPurple);
    leg.position.set(0, 0.3, z);
    group.add(leg);
    legs.push(leg);
  }

  return { group, legs, head, body };
}

function createSkeleton(): MobModelData {
  const group = new THREE.Group();
  const boneTex = BONE();
  const bone = surf(0xd6d6d6, boneTex);

  // Minecraft's 8/12/2-px head/body/limb ratios, scaled to the 1.6 hitbox.
  // +X stays the face, matching the other five models and Mob.ts's yaw
  // offset; z is the shoulder axis.
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.4), bone);
  body.position.set(0, 0.9, 0);
  group.add(body);

  // Ribs on the chest (+x face), not the flanks.
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.03, 0.34), detail(0x8f8f8f));
    rib.position.set(0.105, 0.18 - i * 0.11, 0);
    body.add(rib);
  }
  const sternum = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.4, 0.04), detail(0xf0f0f0));
  sternum.position.set(0.105, 0.04, 0);
  body.add(sternum);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), bone);
  head.position.set(0, 1.4, 0);
  group.add(head);

  for (const z of [0.09, -0.09]) {
    const socket = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, 0.09), detail(0x0a0a0a));
    socket.position.set(0.2, 0.04, z);
    head.add(socket);
  }
  const noseHole = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.05), detail(0x0a0a0a));
  noseHole.position.set(0.205, -0.04, 0);
  head.add(noseHole);
  // Jaw with gaps between the teeth instead of one grey bar.
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.24), detail(0x2a2a2a));
  jaw.position.set(0.206, -0.13, 0);
  head.add(jaw);
  for (const z of [0.09, 0.03, -0.03, -0.09]) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.03), detail(0xf4f4f4));
    tooth.position.set(0.208, -0.115, z);
    head.add(tooth);
  }

  for (const z of [0.25, -0.25]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), bone);
    arm.position.set(0, 0.9, z);
    group.add(arm);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), detail(0xa8a8a8));
    hand.position.set(0, -0.27, 0);
    arm.add(hand);
    // elbow knuckle, so the limb is not a featureless stick
    const elbow = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.04, 0.105), detail(0xb4b4b4));
    elbow.position.set(0, 0, 0);
    arm.add(elbow);
  }

  const bowStick = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.6, 0.04),
    surf(0x6b4a2b, hideMap(83, 0.9))
  );
  bowStick.position.set(0.28, 0.95, -0.25);
  bowStick.rotation.z = 0.15;
  group.add(bowStick);
  const bowString = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.5, 0.01), detail(0xeeeeee));
  bowString.position.set(-0.05, 0, 0);
  bowStick.add(bowString);

  const legs: THREE.Mesh[] = [];
  for (const z of [0.1, -0.1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), bone);
    leg.position.set(0, 0.3, z);
    const knee = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.04, 0.105), detail(0xb4b4b4));
    knee.position.set(0, 0.0, 0);
    leg.add(knee);
    group.add(leg);
    legs.push(leg);
  }

  return { group, legs, head, body };
}

function createCreeper(): MobModelData {
  const group = new THREE.Group();
  // Body surface refined to a camouflage mottle; the face is left as authored.
  const mottle = MOTTLE();
  const green = surf(0x5da85d, mottle);
  const darkGreen = surf(0x3a7a3a, mottle);
  const faceMat = detail(0x1a1a1a);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.3), green);
  body.position.set(0, 0.75, 0);
  group.add(body);

  const patch1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.31), darkGreen);
  patch1.position.set(0.05, 0.1, 0);
  body.add(patch1);
  const patch2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.31), darkGreen);
  patch2.position.set(-0.1, -0.2, 0);
  body.add(patch2);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), green);
  head.position.set(0, 1.37, 0);
  group.add(head);

  const headPatch = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.01), darkGreen);
  headPatch.position.set(0.26, 0.08, 0.08);
  head.add(headPatch);

  for (const z of [0.1, -0.1]) {
    const eyeOuter = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.02), faceMat);
    eyeOuter.position.set(0.26, 0.08, z);
    head.add(eyeOuter);
    const eyeInner = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), faceMat);
    eyeInner.position.set(0.26, 0.0, z * 0.5);
    head.add(eyeInner);
  }

  const mouthCenter = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.02), faceMat);
  mouthCenter.position.set(0.26, -0.1, 0);
  head.add(mouthCenter);
  for (const z of [0.06, -0.06]) {
    const mouthSide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), faceMat);
    mouthSide.position.set(0.26, -0.19, z);
    head.add(mouthSide);
  }
  for (const z of [0.12, -0.12]) {
    const mouthCorner = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), faceMat);
    mouthCorner.position.set(0.26, -0.19, z);
    head.add(mouthCorner);
  }

  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [
    [0.12, 0.12],
    [0.12, -0.12],
    [-0.12, 0.12],
    [-0.12, -0.12],
  ] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.38, 0.2), darkGreen);
    leg.position.set(x, 0.19, z);
    group.add(leg);
    legs.push(leg);
  }

  return { group, legs, head, body };
}

/** Shadow radius per species; anything not listed uses the default below. */
const SHADOW_RADIUS: Partial<Record<MobType, number>> = {
  cow: 0.4,
  sheep: 0.35,
  skeleton: 0.25,
};
const DEFAULT_SHADOW_RADIUS = 0.3;

function addShadow(group: THREE.Group, radius: number): void {
  const geo = new THREE.CircleGeometry(radius, 16);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(geo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  group.add(shadow);
}

/** Create a blocky 3D model for the given mob type. */
export function createMobModel(type: MobType): MobModelData {
  let result: MobModelData;
  switch (type) {
    case "pig":
      result = createPig();
      break;
    case "cow":
      result = createCow();
      break;
    case "sheep":
      result = createSheep();
      break;
    case "zombie":
      result = createZombie();
      break;
    case "skeleton":
      result = createSkeleton();
      break;
    case "creeper":
      result = createCreeper();
      break;
  }
  addShadow(result.group, SHADOW_RADIUS[type] ?? DEFAULT_SHADOW_RADIUS);
  return result;
}
