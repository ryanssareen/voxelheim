import * as THREE from "three";
import { useHotbarStore, type ItemStack } from "@store/useHotbarStore";
import { BLOCK_ID } from "@data/blocks";

const ARMOR_COLORS: Record<number, number> = {
  [BLOCK_ID.STONE]: 0x999999,
  [BLOCK_ID.DIRT]: 0x8b6914,
  [BLOCK_ID.LOG]: 0x5d4037,
  [BLOCK_ID.SAND]: 0xfdd835,
  [BLOCK_ID.CRYSTAL]: 0x00ccdd,
  [BLOCK_ID.LEAVES]: 0x2e7d32,
};

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

  private helmetMesh: THREE.Mesh;
  private chestplateMesh: THREE.Mesh;
  private leggingsLeft: THREE.Mesh;
  private leggingsRight: THREE.Mesh;
  private bootsLeft: THREE.Mesh;
  private bootsRight: THREE.Mesh;

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
    const shirt = this.shirtMat;
    const pants = this.pantsMat;
    const hair = this.hairMat;
    const shoes = this.shoeMat;

    // Head (8x8x8 pixels → 0.5x0.5x0.5 blocks)
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
    this.head.position.set(0, 1.55, 0);
    // Hair on top
    const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.15, 0.52), hair);
    hairMesh.position.set(0, 0.2, 0);
    this.head.add(hairMesh);

    // Eyes
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });

    const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), eyeMat);
    leftEye.position.set(-0.1, 0.05, -0.26);
    this.head.add(leftEye);
    const leftPupil = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), pupilMat);
    leftPupil.position.set(-0.1, 0.05, -0.27);
    this.head.add(leftPupil);

    const rightEye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), eyeMat);
    rightEye.position.set(0.1, 0.05, -0.26);
    this.head.add(rightEye);
    const rightPupil = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), pupilMat);
    rightPupil.position.set(0.1, 0.05, -0.27);
    this.head.add(rightPupil);

    // Body (0.5 wide, 0.75 tall, 0.25 deep)
    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.3), shirt);
    this.body.position.set(0, 0.95, 0);

    // Arms (0.25 wide, 0.75 tall)
    this.leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), skin);
    this.leftArm.position.set(-0.375, 0.95, 0);

    this.rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), skin);
    this.rightArm.position.set(0.375, 0.95, 0);

    // Legs (0.25 wide, 0.75 tall)
    this.leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.25), pants);
    this.leftLeg.position.set(-0.125, 0.35, 0);

    this.rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.25), pants);
    this.rightLeg.position.set(0.125, 0.35, 0);

    // Shoes
    const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.3), shoes);
    leftShoe.position.set(0, -0.3, -0.02);
    this.leftLeg.add(leftShoe);

    const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.3), shoes);
    rightShoe.position.set(0, -0.3, -0.02);
    this.rightLeg.add(rightShoe);

    // Armor overlay meshes (slightly larger, hidden by default)
    const armorMat = new THREE.MeshLambertMaterial({ color: 0x999999, transparent: true, opacity: 0.85 });

    this.helmetMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.56, 0.56), armorMat.clone());
    this.helmetMesh.position.set(0, 1.55, 0);
    this.helmetMesh.visible = false;

    this.chestplateMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.8, 0.36), armorMat.clone());
    this.chestplateMesh.position.set(0, 0.95, 0);
    this.chestplateMesh.visible = false;

    this.leggingsLeft = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.72, 0.27), armorMat.clone());
    this.leggingsLeft.visible = false;
    this.leggingsRight = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.72, 0.27), armorMat.clone());
    this.leggingsRight.visible = false;

    this.bootsLeft = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.15, 0.32), armorMat.clone());
    this.bootsLeft.visible = false;
    this.bootsRight = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.15, 0.32), armorMat.clone());
    this.bootsRight.visible = false;

    this.leftLeg.add(this.leggingsLeft);
    this.rightLeg.add(this.leggingsRight);
    this.leftLeg.add(this.bootsLeft);
    this.bootsLeft.position.set(0, -0.28, -0.02);
    this.rightLeg.add(this.bootsRight);
    this.bootsRight.position.set(0, -0.28, -0.02);

    this.group.add(this.head, this.body, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);
    this.group.add(this.helmetMesh, this.chestplateMesh);
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

    // Walk animation: swing arms and legs
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

    // Sync armor visuals from store
    if (this.syncArmor) {
      const armorSlots = useHotbarStore.getState().armor;
      const armorHash = armorSlots.map(s => `${s.blockId}:${s.count}`).join(",");
      if (armorHash !== this.lastArmorHash) {
        this.lastArmorHash = armorHash;
        this.updateArmor(armorSlots);
      }
    }

    // Armor follows body positions
    this.helmetMesh.position.copy(this.head.position);
    this.chestplateMesh.position.copy(this.body.position);

    // Crouch: lower body slightly
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

  private updateArmor(armorSlots: ItemStack[]): void {
    const setSlot = (mesh: THREE.Mesh, slot: ItemStack) => {
      if (slot.count > 0 && slot.blockId !== BLOCK_ID.AIR) {
        mesh.visible = true;
        const color = ARMOR_COLORS[slot.blockId] ?? 0x888888;
        (mesh.material as THREE.MeshLambertMaterial).color.setHex(color);
      } else {
        mesh.visible = false;
      }
    };
    // 0=helmet, 1=chestplate, 2=leggings, 3=boots
    setSlot(this.helmetMesh, armorSlots[0]);
    setSlot(this.chestplateMesh, armorSlots[1]);
    setSlot(this.leggingsLeft, armorSlots[2]);
    setSlot(this.leggingsRight, armorSlots[2]);
    setSlot(this.bootsLeft, armorSlots[3]);
    setSlot(this.bootsRight, armorSlots[3]);
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
