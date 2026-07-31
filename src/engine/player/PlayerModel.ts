import * as THREE from "three";
import { useHotbarStore, type ItemStack } from "@store/useHotbarStore";
import { BLOCK_ID } from "@data/blocks";

/**
 * Worn armour used to be six slightly-oversized transparent boxes at 0.85
 * opacity in a single flat colour. That reads as shrink-wrap, the helmet cube
 * swallowed the face entirely, and the transparency z-fought with the limb
 * underneath.
 *
 * Each piece is now a small group of opaque boxes parented to the limb it
 * covers, so it inherits the walk swing and crouch for free:
 *
 *   chestplate  torso shell + collar + belt, pauldrons parented to each arm
 *   leggings    hip belt + a thigh plate per leg
 *   boots       ankle cuff + foot shell per leg
 *
 * The head is left bare — helmets still count for damage reduction but are not
 * rendered, so the face reads at every camera distance. Plates carry vertical
 * seams on a specular Phong material: the glint comes from the light, not from
 * baked highlights, so it moves as the player turns.
 */

/**
 * Original tier colours kept and pushed bluer, still light. The knight read
 * comes from the deep blue trim, the vertical plate seams and the specular
 * highlight — not from desaturating the body to steel.
 */
interface ArmorMaterial {
  shell: number;
  trim: number;
}

const ARMOR_MATERIALS: Record<number, ArmorMaterial> = {
  [BLOCK_ID.IRON_CHESTPLATE]: { shell: 0xccd2dc, trim: 0x5b6474 },
  [BLOCK_ID.IRON_LEGGINGS]: { shell: 0xccd2dc, trim: 0x5b6474 },
  [BLOCK_ID.IRON_BOOTS]: { shell: 0xccd2dc, trim: 0x5b6474 },
  [BLOCK_ID.DIAMOND_CHESTPLATE]: { shell: 0x66d2f2, trim: 0x2a6f9e },
  [BLOCK_ID.DIAMOND_LEGGINGS]: { shell: 0x66d2f2, trim: 0x2a6f9e },
  [BLOCK_ID.DIAMOND_BOOTS]: { shell: 0x66d2f2, trim: 0x2a6f9e },
  // Improvised sets keep the same plate treatment, tinted by the material.
  [BLOCK_ID.STONE]: { shell: 0xa6aab2, trim: 0x4a4e56 },
  [BLOCK_ID.DIRT]: { shell: 0x9c7a24, trim: 0x40300a },
  [BLOCK_ID.LOG]: { shell: 0x8a6448, trim: 0x3d2a1c },
  [BLOCK_ID.SAND]: { shell: 0xe6d894, trim: 0x6d6340 },
  [BLOCK_ID.CRYSTAL]: { shell: 0x6fdcf4, trim: 0x256f8e },
  [BLOCK_ID.LEAVES]: { shell: 0x5c8a52, trim: 0x24401f },
};

const DEFAULT_MATERIAL: ArmorMaterial = { shell: 0xc4c8d0, trim: 0x4c5058 };

/** Scale a packed hex colour toward black (t<1) or white (t>1). */
function shadeHex(hex: number, t: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(t <= 1 ? v * t : v + (255 - v) * (t - 1))));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

type Role = "shell" | "trim";

/**
 * Plate texture: vertical seams and a one-direction bevel on the vertical
 * edges. No rivets and no baked highlights — a fixed-UV detail dot repeats on
 * every face of every plate box, which reads as random specks. The Phong
 * specular term makes the glint instead, so it moves with the light rather
 * than printing the same bright square on all six faces. Horizontal edges are
 * left clean so stacked plates read as one suit rather than a stack of crates.
 */
const textureCache = new Map<number, THREE.Texture>();

function plateTexture(base: number): THREE.Texture | null {
  const cached = textureCache.get(base);
  if (cached) return cached;

  // The model can be constructed without a canvas (SSR, headless tests); an
  // unmapped plate still renders, just without the seams.
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const css = (t: number) => "#" + shadeHex(base, t).toString(16).padStart(6, "0");

  g.fillStyle = css(1);
  g.fillRect(0, 0, 16, 16);
  // vertical seams only
  g.fillStyle = css(0.44);
  g.fillRect(0, 0, 1, 16);
  g.fillRect(15, 0, 1, 16);
  // vertical bevel, one light direction
  g.fillStyle = css(1.4);
  g.fillRect(1, 0, 1, 16);
  g.fillStyle = css(0.66);
  g.fillRect(14, 0, 1, 16);
  // a shallow rib to break the flat field
  g.fillStyle = css(0.86);
  g.fillRect(8, 0, 1, 16);
  g.fillStyle = css(1.16);
  g.fillRect(7, 0, 1, 16);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  textureCache.set(base, tex);
  return tex;
}

interface ArmorPiece {
  group: THREE.Group;
  shell: THREE.MeshPhongMaterial;
  trim: THREE.MeshPhongMaterial;
}

interface PlayerModelOptions {
  syncArmor?: boolean;
  shirtColor?: number;
  pantsColor?: number;
  skinColor?: number;
  hairColor?: number;
  shoeColor?: number;
}

/**
 * Simple blocky player model (Steve-style) made from box geometries.
 * Visible in 3rd person camera modes, hidden in 1st person.
 */
export class PlayerModel {
  public readonly group: THREE.Group;
  private readonly syncArmor: boolean;

  private head: THREE.Mesh;
  private body: THREE.Mesh;
  private leftArm: THREE.Mesh;
  private rightArm: THREE.Mesh;
  private leftLeg: THREE.Mesh;
  private rightLeg: THREE.Mesh;

  private chest: ArmorPiece;
  private pauldronLeft: ArmorPiece;
  private pauldronRight: ArmorPiece;
  private leggings: ArmorPiece;
  private legPlateLeft: ArmorPiece;
  private legPlateRight: ArmorPiece;
  private bootLeft: ArmorPiece;
  private bootRight: ArmorPiece;

  private readonly skinMat: THREE.MeshLambertMaterial;
  private readonly shirtMat: THREE.MeshLambertMaterial;
  private readonly pantsMat: THREE.MeshLambertMaterial;
  private readonly hairMat: THREE.MeshLambertMaterial;
  private readonly shoeMat: THREE.MeshLambertMaterial;

  private walkTime = 0;
  private lastArmorHash = "";

  constructor(options: PlayerModelOptions = {}) {
    this.group = new THREE.Group();
    this.syncArmor = options.syncArmor ?? true;

    this.skinMat = new THREE.MeshLambertMaterial({ color: options.skinColor ?? 0xc8a882 });
    this.shirtMat = new THREE.MeshLambertMaterial({ color: options.shirtColor ?? 0x4a90d9 });
    this.pantsMat = new THREE.MeshLambertMaterial({ color: options.pantsColor ?? 0x3b3b6e });
    this.hairMat = new THREE.MeshLambertMaterial({ color: options.hairColor ?? 0x3a2a1a });
    this.shoeMat = new THREE.MeshLambertMaterial({ color: options.shoeColor ?? 0x4a4a4a });
    const skin = this.skinMat;

    // ── body ──────────────────────────────────────────────
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
    this.head.position.set(0, 1.55, 0);
    const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.15, 0.52), this.hairMat);
    hairMesh.position.set(0, 0.2, 0);
    this.head.add(hairMesh);

    const eyeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
    for (const sx of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), eyeMat);
      eye.position.set(sx, 0.05, -0.26);
      this.head.add(eye);
      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), pupilMat);
      pupil.position.set(sx, 0.05, -0.27);
      this.head.add(pupil);
    }

    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.3), this.shirtMat);
    this.body.position.set(0, 0.95, 0);

    this.leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), skin);
    this.leftArm.position.set(-0.375, 0.95, 0);
    this.rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), skin);
    this.rightArm.position.set(0.375, 0.95, 0);

    this.leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.25), this.pantsMat);
    this.leftLeg.position.set(-0.125, 0.35, 0);
    this.rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.25), this.pantsMat);
    this.rightLeg.position.set(0.125, 0.35, 0);

    for (const leg of [this.leftLeg, this.rightLeg]) {
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.3), this.shoeMat);
      shoe.position.set(0, -0.3, -0.02);
      leg.add(shoe);
    }

    // ── armour ────────────────────────────────────────────
    // Boxes are given as [w, h, d, x, y, z, role]; coordinates are local to the
    // limb the piece is parented to. No helmet — the head is left bare.
    this.chest = this.buildPiece([
      [0.56, 0.56, 0.36, 0, 0.06, 0, "shell"], // torso shell
      [0.34, 0.1, 0.32, 0, 0.4, 0, "trim"], // collar
      [0.58, 0.11, 0.38, 0, -0.3, 0, "trim"], // belt
      [0.08, 0.5, 0.02, 0, 0.06, -0.19, "trim"], // centre seam
    ]);
    this.body.add(this.chest.group);

    // Pauldrons ride the arms so they swing with the walk cycle. One plate each,
    // not a stack — two outlined boxes read as a break in the armour.
    this.pauldronLeft = this.buildPiece([[0.32, 0.46, 0.32, 0, 0.15, 0, "shell"]]);
    this.leftArm.add(this.pauldronLeft.group);
    this.pauldronRight = this.buildPiece([[0.32, 0.46, 0.32, 0, 0.15, 0, "shell"]]);
    this.rightArm.add(this.pauldronRight.group);

    // Leggings: a hip belt on the torso plus one continuous thigh plate per leg.
    this.leggings = this.buildPiece([[0.56, 0.14, 0.36, 0, -0.36, 0, "shell"]]);
    this.body.add(this.leggings.group);
    this.legPlateLeft = this.buildPiece([[0.285, 0.46, 0.295, 0, 0.1, 0, "shell"]]);
    this.leftLeg.add(this.legPlateLeft.group);
    this.legPlateRight = this.buildPiece([[0.285, 0.46, 0.295, 0, 0.1, 0, "shell"]]);
    this.rightLeg.add(this.legPlateRight.group);

    this.bootLeft = this.buildPiece([
      [0.3, 0.26, 0.32, 0, -0.24, -0.01, "shell"], // greave into the foot
      [0.31, 0.05, 0.35, 0, -0.36, -0.03, "trim"], // sole
    ]);
    this.leftLeg.add(this.bootLeft.group);
    this.bootRight = this.buildPiece([
      [0.3, 0.26, 0.32, 0, -0.24, -0.01, "shell"],
      [0.31, 0.05, 0.35, 0, -0.36, -0.03, "trim"],
    ]);
    this.rightLeg.add(this.bootRight.group);

    this.group.add(this.head, this.body, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);
  }

  /** Build one armour piece from a box list, hidden until a slot is filled. */
  private buildPiece(
    boxes: Array<[number, number, number, number, number, number, Role]>
  ): ArmorPiece {
    const group = new THREE.Group();
    group.visible = false;
    // Phong with a specular term and flat shading: plates catch light like
    // metal. Opaque — the old 0.85-opacity shells z-fought with the limb.
    const shell = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      specular: 0xffffff,
      shininess: 38,
      flatShading: true,
    });
    const trim = new THREE.MeshPhongMaterial({
      color: 0x9a9a9a,
      specular: 0xdddddd,
      shininess: 22,
      flatShading: true,
    });
    for (const [w, h, d, x, y, z, role] of boxes) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), role === "trim" ? trim : shell);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      group.add(mesh);
    }
    return { group, shell, trim };
  }

  /** Update position, rotation, and walk animation. */
  update(
    position: { x: number; y: number; z: number },
    yaw: number,
    isMoving: boolean,
    isCrouching: boolean,
    dt: number
  ): void {
    this.group.position.set(position.x, position.y, position.z);
    this.group.rotation.set(0, yaw, 0);

    if (isMoving) {
      this.walkTime += dt * 8;
      const swing = Math.sin(this.walkTime) * 0.5;
      this.leftArm.rotation.x = swing;
      this.rightArm.rotation.x = -swing;
      this.leftLeg.rotation.x = -swing;
      this.rightLeg.rotation.x = swing;
    } else {
      this.walkTime = 0;
      this.leftArm.rotation.x = 0;
      this.rightArm.rotation.x = 0;
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
    }

    if (this.syncArmor) {
      const armorSlots = useHotbarStore.getState().armor;
      const armorHash = armorSlots.map((s) => `${s.blockId}:${s.count}`).join(",");
      if (armorHash !== this.lastArmorHash) {
        this.lastArmorHash = armorHash;
        this.updateArmor(armorSlots);
      }
    }

    // Armour is parented to the limbs, so crouch needs no per-piece fixup.
    if (isCrouching) {
      this.body.position.y = 0.8;
      this.head.position.y = 1.35;
      this.leftArm.position.y = 0.8;
      this.rightArm.position.y = 0.8;
    } else {
      this.body.position.y = 0.95;
      this.head.position.y = 1.55;
      this.leftArm.position.y = 0.95;
      this.rightArm.position.y = 0.95;
    }
  }

  /**
   * Drive armor visuals from an external source (remote players, whose armor
   * arrives over the network rather than from the local hotbar store). Diffed
   * so it only rebuilds when the worn set actually changes.
   */
  setArmor(armorSlots: ItemStack[]): void {
    const armorHash = armorSlots.map((s) => `${s.blockId}:${s.count}`).join(",");
    if (armorHash === this.lastArmorHash) return;
    this.lastArmorHash = armorHash;
    this.updateArmor(armorSlots);
  }

  private updateArmor(armorSlots: ItemStack[]): void {
    const apply = (pieces: ArmorPiece[], slot: ItemStack | undefined) => {
      const worn = !!slot && slot.count > 0 && slot.blockId !== BLOCK_ID.AIR;
      for (const piece of pieces) {
        piece.group.visible = worn;
        if (!worn || !slot) continue;
        const mat = ARMOR_MATERIALS[slot.blockId] ?? DEFAULT_MATERIAL;
        piece.shell.map = plateTexture(mat.shell);
        piece.shell.color.setHex(0xffffff);
        piece.shell.needsUpdate = true;
        piece.trim.color.setHex(mat.trim);
      }
    };
    // 0=helmet (not rendered — the head stays bare), 1=chestplate, 2=leggings, 3=boots
    apply([this.chest, this.pauldronLeft, this.pauldronRight], armorSlots[1]);
    apply([this.leggings, this.legPlateLeft, this.legPlateRight], armorSlots[2]);
    apply([this.bootLeft, this.bootRight], armorSlots[3]);
  }

  /** Show or hide the model (hide in 1st person). */
  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  updateColors(colors: Partial<PlayerModelOptions>): void {
    if (colors.skinColor !== undefined) this.skinMat.color.setHex(colors.skinColor);
    if (colors.hairColor !== undefined) this.hairMat.color.setHex(colors.hairColor);
    if (colors.shirtColor !== undefined) this.shirtMat.color.setHex(colors.shirtColor);
    if (colors.pantsColor !== undefined) this.pantsMat.color.setHex(colors.pantsColor);
    if (colors.shoeColor !== undefined) this.shoeMat.color.setHex(colors.shoeColor);
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) {
          obj.material.dispose();
        }
      }
    });
  }
}
