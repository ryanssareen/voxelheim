import * as THREE from "three";

/**
 * Simple blocky player model (Steve-style) made from box geometries.
 * Visible in 3rd person camera modes, hidden in 1st person.
 */
export class PlayerModel {
  public readonly group: THREE.Group;

  private head: THREE.Mesh;
  private body: THREE.Mesh;
  private leftArm: THREE.Mesh;
  private rightArm: THREE.Mesh;
  private leftLeg: THREE.Mesh;
  private rightLeg: THREE.Mesh;

  private walkTime = 0;

  constructor() {
    this.group = new THREE.Group();

    const skin = new THREE.MeshLambertMaterial({ color: 0xc8a882 }); // skin tone
    const shirt = new THREE.MeshLambertMaterial({ color: 0x4a90d9 }); // blue shirt
    const pants = new THREE.MeshLambertMaterial({ color: 0x3b3b6e }); // dark blue pants
    const hair = new THREE.MeshLambertMaterial({ color: 0x3a2a1a }); // brown hair
    const shoes = new THREE.MeshLambertMaterial({ color: 0x4a4a4a }); // dark shoes

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

    this.group.add(this.head, this.body, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);
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

  /** Show or hide the model (hide in 1st person). */
  setVisible(visible: boolean): void {
    this.group.visible = visible;
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
