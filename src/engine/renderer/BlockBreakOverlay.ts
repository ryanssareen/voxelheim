import * as THREE from "three";

/**
 * Minecraft-style block breaking: a set of progressively-cracked textures
 * projected over the block being mined.
 *
 * The crack pattern is generated once, deterministically (fixed seed, no
 * Math.random), as a per-texel "birth stage" grid: texel value `n` means the
 * texel is part of the crack from stage `n` onwards. Stage `n`'s texture is
 * therefore every texel with `birth <= n`, which makes the damage accumulate
 * rather than flicker into a fresh pattern each stage.
 *
 * Canvas work is guarded — the engine is constructed in headless tests and
 * during SSR, where there is no 2D context. Without one the overlay simply
 * never becomes visible; nothing throws.
 */

/** Number of discrete damage stages, matching vanilla. */
export const BREAK_STAGE_COUNT = 10;

/** Texture resolution; 16px keeps the chunky pixel-art crack look. */
const CRACK_TEX_SIZE = 16;

/** Fixed seed — cracks must be identical across reloads and machines. */
const CRACK_SEED = 0x9e3779b9;

const FISSURE_COUNT = 8;

/**
 * Texels a fissure lays down at its birth stage before it starts extending.
 * Without a head each new fissure appears as a single texel, which is
 * invisible at a glance.
 */
const FISSURE_HEAD = 3;

/**
 * Maps break progress to a stage index.
 * Returns -1 when nothing should be drawn (progress at or below zero).
 */
export function breakStageForProgress(progress: number): number {
  if (!Number.isFinite(progress) || progress <= 0) return -1;
  if (progress >= 1) return BREAK_STAGE_COUNT - 1;
  return Math.min(BREAK_STAGE_COUNT - 1, Math.floor(progress * BREAK_STAGE_COUNT));
}

/** Small deterministic PRNG (mulberry32). */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds the per-texel birth-stage grid. `-1` means the texel is never part of
 * the crack. Pure and deterministic — this is the contract the tests lock down.
 */
export function buildCrackStages(
  size: number = CRACK_TEX_SIZE,
  stages: number = BREAK_STAGE_COUNT,
  seed: number = CRACK_SEED
): Int8Array {
  const grid = new Int8Array(size * size).fill(-1);
  const rng = makeRng(seed);
  const last = stages - 1;

  const mark = (x: number, y: number, stage: number): void => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= size || iy >= size) return;
    const s = Math.max(0, Math.min(last, Math.round(stage)));
    const i = iy * size + ix;
    if (grid[i] === -1 || grid[i] > s) grid[i] = s;
  };

  /** Walks a jagged line outward, marking texels with a rising stage. */
  const fissure = (
    x0: number,
    y0: number,
    angle0: number,
    steps: number,
    birth: number,
    thicken: boolean
  ): { x: number; y: number } => {
    let x = x0;
    let y = y0;
    let angle = angle0;
    const head = Math.min(FISSURE_HEAD, steps - 1);
    for (let s = 0; s < steps; s++) {
      const stage =
        s <= head ? birth : birth + ((s - head) / (steps - head)) * (stages - birth);
      mark(x, y, stage);
      // A clean single-texel line reads as a scratch; nudging a neighbour every
      // other step gives the fissure an uneven, chipped edge.
      if (thicken && s % 2 === 1) {
        mark(x + (rng() < 0.5 ? 1 : -1), y, stage + 1);
      }
      // Jitter for a jagged edge, then spring back toward the original ray.
      // Without the spring the drift accumulates, the walk curls in on the
      // centre, and whole quadrants of the block stay untouched.
      angle += (rng() - 0.5) * 0.9;
      angle += (angle0 - angle) * 0.35;
      const len = 1.1 + rng() * 0.8;
      x += Math.cos(angle) * len;
      y += Math.sin(angle) * len;
    }
    return { x, y };
  };

  const centre = size / 2;
  for (let f = 0; f < FISSURE_COUNT; f++) {
    const birth = Math.min(last, Math.floor((f * last) / FISSURE_COUNT));
    const sx = centre + (rng() - 0.5) * 3;
    const sy = centre + (rng() - 0.5) * 3;
    const angle = (f / FISSURE_COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.9;
    const steps = 9 + Math.floor(rng() * 4);
    const end = fissure(sx, sy, angle, steps, birth, true);

    // A branch part-way along, born later, so the crack visibly spreads as
    // well as lengthens.
    const branchBirth = Math.min(last, birth + 2);
    const bx = sx + Math.cos(angle) * (steps * 0.45);
    const by = sy + Math.sin(angle) * (steps * 0.45);
    fissure(
      bx,
      by,
      angle + (rng() < 0.5 ? 1.2 : -1.2),
      3 + Math.floor(rng() * 3),
      branchBirth,
      false
    );

    // Late-stage spall at the far end: the block is close to shattering.
    if (f % 2 === 0) {
      mark(end.x, end.y, last);
      mark(end.x + 1, end.y, last);
      mark(end.x, end.y + 1, last);
    }
  }

  // Widening pass: old fissures gain a neighbour three stages after they
  // appear. Late stages then read as chunks spalling out of an established
  // crack rather than as ever-more hairlines.
  const snapshot = Int8Array.from(grid);
  const spread = makeRng(seed ^ 0x5bf03635);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const birth = snapshot[y * size + x];
      if (birth === -1 || birth > last - 3) continue;
      if (spread() > 0.55) continue;
      const dx = spread() < 0.5 ? 1 : -1;
      const dy = spread() < 0.5 ? 1 : -1;
      if (spread() < 0.5) mark(x + dx, y, birth + 3);
      else mark(x, y + dy, birth + 3);
    }
  }

  return grid;
}

/** Renders one stage's canvas. Returns null when no 2D context is available. */
function drawStage(grid: Int8Array, size: number, stage: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  if (!g) return null;

  g.clearRect(0, 0, size, size);

  // Chisel highlight first so the dark core paints over any overlap.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const birth = grid[y * size + x];
      if (birth === -1 || birth > stage) continue;
      const bx = x + 1;
      const by = y + 1;
      if (bx >= size || by >= size) continue;
      const below = grid[by * size + bx];
      if (below !== -1 && below <= stage) continue;
      g.fillStyle = "rgba(255,255,255,0.14)";
      g.fillRect(bx, by, 1, 1);
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const birth = grid[y * size + x];
      if (birth === -1 || birth > stage) continue;
      // Older texels are worn deeper; fresh ones stay lighter hairlines.
      const age = (stage - birth) / Math.max(1, BREAK_STAGE_COUNT - 1);
      const alpha = 0.52 + age * 0.34;
      g.fillStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
      g.fillRect(x, y, 1, 1);
    }
  }

  return canvas;
}

/**
 * Renders progressive breaking cracks on the block being mined.
 * Slightly oversized to prevent z-fighting with block faces.
 */
export class BlockBreakOverlay {
  private readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.BoxGeometry;
  private readonly textures: THREE.CanvasTexture[] = [];
  private readonly materials: THREE.MeshBasicMaterial[] = [];
  private readonly fallback: THREE.MeshBasicMaterial;
  private stage = -1;

  constructor() {
    this.geometry = new THREE.BoxGeometry(1.002, 1.002, 1.002);

    // Used when there is no canvas (SSR / headless tests) and as the mesh's
    // resting material. Fully transparent, so an unmapped overlay is invisible
    // rather than a black box.
    this.fallback = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    const grid = buildCrackStages();
    for (let s = 0; s < BREAK_STAGE_COUNT; s++) {
      const canvas = drawStage(grid, CRACK_TEX_SIZE, s);
      if (!canvas) break;
      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      this.textures.push(texture);
      this.materials.push(
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          depthTest: true,
          // The overlay must never occlude anything behind it, and the shell
          // must not fight with itself where near and far faces meet.
          depthWrite: false,
          side: THREE.FrontSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        })
      );
    }

    this.mesh = new THREE.Mesh(this.geometry, this.fallback);
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
  }

  /** Returns the mesh to add to the scene. */
  getMesh(): THREE.Mesh {
    return this.mesh;
  }

  /** Update overlay position and crack stage based on break progress. */
  update(
    target: { x: number; y: number; z: number } | null,
    progress: number
  ): void {
    const stage = target ? breakStageForProgress(progress) : -1;

    if (!target || stage < 0 || this.materials.length === 0) {
      this.mesh.visible = false;
      this.stage = -1;
      return;
    }

    this.mesh.visible = true;
    this.mesh.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);

    if (stage !== this.stage) {
      this.stage = stage;
      this.mesh.material = this.materials[Math.min(stage, this.materials.length - 1)];
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.fallback.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.materials.length = 0;
    this.textures.length = 0;
  }
}
