import * as THREE from "three";

export type MobType = "pig" | "cow" | "sheep" | "zombie" | "skeleton" | "creeper";

export interface MobModelData {
  group: THREE.Group;
  legs: THREE.Mesh[];
  head?: THREE.Mesh;
  body: THREE.Mesh;
}

function mat(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

function createPig(): MobModelData {
  const group = new THREE.Group();
  const pink = mat(0xf0a0a0);
  const darkPink = mat(0xd08080);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.3), pink);
  body.position.set(0, 0.35, 0);
  group.add(body);

  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.28), pink);
  head.position.set(0.3, 0.45, 0);
  group.add(head);

  // Snout
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.15), darkPink);
  snout.position.set(0.17, -0.02, 0);
  head.add(snout);

  // Legs
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[0.15, 0.08], [0.15, -0.08], [-0.15, 0.08], [-0.15, -0.08]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.1), pink);
    leg.position.set(x, 0.09, z);
    group.add(leg);
    legs.push(leg);
  }

  return { group, legs, head, body };
}

function createCow(): MobModelData {
  const group = new THREE.Group();
  const brown = mat(0x8b6914);
  const white = mat(0xf5f5dc);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.35), brown);
  body.position.set(0, 0.4, 0);
  group.add(body);

  // White patch
  const patch = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.36), white);
  patch.position.set(0.05, 0.02, 0);
  body.add(patch);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), brown);
  head.position.set(0.38, 0.5, 0);
  group.add(head);

  // Horns
  const hornMat = mat(0xe0d8c0);
  for (const z of [0.12, -0.12]) {
    const horn = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.04), hornMat);
    horn.position.set(0, 0.18, z);
    head.add(horn);
  }

  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[0.18, 0.1], [0.18, -0.1], [-0.18, 0.1], [-0.18, -0.1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.1), brown);
    leg.position.set(x, 0.11, z);
    group.add(leg);
    legs.push(leg);
  }

  return { group, legs, head, body };
}

function createSheep(): MobModelData {
  const group = new THREE.Group();
  const wool = mat(0xf0f0f0);
  const skin = mat(0xc0b090);

  // Woolly body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.4), wool);
  body.position.set(0, 0.4, 0);
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), skin);
  head.position.set(0.32, 0.48, 0);
  group.add(head);

  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[0.15, 0.1], [0.15, -0.1], [-0.15, 0.1], [-0.15, -0.1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.08), skin);
    leg.position.set(x, 0.11, z);
    group.add(leg);
    legs.push(leg);
  }

  return { group, legs, head, body };
}

function createZombie(): MobModelData {
  const group = new THREE.Group();
  const skinGreen = mat(0x5a8a5a);
  const shirtCyan = mat(0x3a9a8a);
  const pantsPurple = mat(0x2e2e6e);
  const darkGreen = mat(0x3a5a3a);

  // Body (teal/cyan shirt)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.25), shirtCyan);
  body.position.set(0, 0.95, 0);
  group.add(body);

  // Head (8x8x8 proportional)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinGreen);
  head.position.set(0, 1.52, 0);
  group.add(head);

  // Face details - dark hollow eyes
  const eyeMat = mat(0x1a1a1a);
  for (const z of [0.1, -0.1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.02), eyeMat);
    eye.position.set(0.26, 0.06, z);
    head.add(eye);
  }
  // Brow ridge (darker green above eyes)
  const browMat = mat(0x2a4a2a);
  for (const z of [0.1, -0.1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.04, 0.02), browMat);
    brow.position.set(0.26, 0.13, z);
    head.add(brow);
  }
  // Nose
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), darkGreen);
  nose.position.set(0.26, 0.0, 0);
  head.add(nose);
  // Mouth (dark frown)
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.02), eyeMat);
  mouth.position.set(0.26, -0.1, 0);
  head.add(mouth);

  // Arms (stretched forward like classic zombie)
  for (const z of [0.2, -0.2]) {
    // Upper arm (shirt color)
    const armPivot = new THREE.Group();
    armPivot.position.set(0, 1.15, z);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.15), shirtCyan);
    arm.position.set(0.2, 0, 0);
    armPivot.add(arm);
    // Hand (green skin)
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.15), skinGreen);
    hand.position.set(0, -0.36, 0);
    arm.add(hand);
    armPivot.rotation.x = -Math.PI / 2.5;
    group.add(armPivot);
  }

  // Legs (dark purple pants)
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
  const bone = mat(0xd4cfc4);
  const boneDark = mat(0xb0a898);
  const dark = mat(0x1a1a1a);
  const gray = mat(0x555555);

  // Ribcage body (thinner than other humanoids)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.18), bone);
  body.position.set(0, 0.95, 0);
  group.add(body);

  // Rib lines (horizontal dark stripes)
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.19), boneDark);
    rib.position.set(0, 0.15 - i * 0.15, 0);
    body.add(rib);
  }

  // Skull head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), bone);
  head.position.set(0, 1.52, 0);
  group.add(head);

  // Deep dark eye sockets
  for (const z of [0.1, -0.1]) {
    const socket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.06), dark);
    socket.position.set(0.23, 0.06, z);
    head.add(socket);
  }
  // Nose hole (triangle-ish)
  const noseHole = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), dark);
  noseHole.position.set(0.26, -0.02, 0);
  head.add(noseHole);
  // Jaw/teeth line
  const jawLine = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.02), gray);
  jawLine.position.set(0.26, -0.12, 0);
  head.add(jawLine);
  // Individual teeth marks
  for (const z of [0.04, -0.04]) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.02), bone);
    tooth.position.set(0.26, -0.09, z);
    head.add(tooth);
  }

  // Thin bony arms
  for (const z of [0.18, -0.18]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), bone);
    arm.position.set(0, 0.95, z);
    group.add(arm);
    // Bony hand
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), boneDark);
    hand.position.set(0, -0.3, 0);
    arm.add(hand);
  }

  // Bow (held in right hand area) — simple cross shape
  const bowStick = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.04), mat(0x5D4037));
  bowStick.position.set(0.08, 0.75, -0.28);
  bowStick.rotation.z = 0.2;
  group.add(bowStick);
  // Bowstring
  const bowString = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.4, 0.01), mat(0xcccccc));
  bowString.position.set(0.04, 0, 0.03);
  bowStick.add(bowString);

  // Thin legs
  const legs: THREE.Mesh[] = [];
  for (const z of [0.06, -0.06]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), bone);
    leg.position.set(0, 0.3, z);
    group.add(leg);
    legs.push(leg);
  }

  return { group, legs, head, body };
}

function createCreeper(): MobModelData {
  const group = new THREE.Group();
  // Creeper uses mottled green - lighter and darker patches
  const green = mat(0x5da85d);
  const darkGreen = mat(0x3a7a3a);
  const faceMat = mat(0x1a1a1a);

  // Tall rectangular body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.3), green);
  body.position.set(0, 0.75, 0);
  group.add(body);

  // Darker mottled patches on body
  const patch1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.31), darkGreen);
  patch1.position.set(0.05, 0.1, 0);
  body.add(patch1);
  const patch2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.31), darkGreen);
  patch2.position.set(-0.1, -0.2, 0);
  body.add(patch2);

  // Head — same width as body, cube-shaped
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), green);
  head.position.set(0, 1.37, 0);
  group.add(head);

  // Dark patches on head
  const headPatch = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.01), darkGreen);
  headPatch.position.set(0.26, 0.08, 0.08);
  head.add(headPatch);

  // === ICONIC CREEPER FACE ===
  // Eyes — two tall rectangles, wider apart
  for (const z of [0.1, -0.1]) {
    // Each eye is a tall pixel shape
    const eyeOuter = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.02), faceMat);
    eyeOuter.position.set(0.26, 0.08, z);
    head.add(eyeOuter);
    // Inner eye extension (going down-inward for the droopy look)
    const eyeInner = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), faceMat);
    eyeInner.position.set(0.26, 0.0, z * 0.5);
    head.add(eyeInner);
  }

  // Mouth — the iconic frown: vertical line down from between eyes, then wider at bottom
  // Vertical center strip
  const mouthCenter = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.02), faceMat);
  mouthCenter.position.set(0.26, -0.1, 0);
  head.add(mouthCenter);
  // Bottom wider part (the frown extensions)
  for (const z of [0.06, -0.06]) {
    const mouthSide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), faceMat);
    mouthSide.position.set(0.26, -0.19, z);
    head.add(mouthSide);
  }
  // Even wider bottom corners
  for (const z of [0.12, -0.12]) {
    const mouthCorner = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), faceMat);
    mouthCorner.position.set(0.26, -0.19, z);
    head.add(mouthCorner);
  }

  // 4 short stubby legs (no arms — creepers have no arms!)
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [
    [0.12, 0.12], [0.12, -0.12],
    [-0.12, 0.12], [-0.12, -0.12],
  ] as const) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.38, 0.2), darkGreen);
    leg.position.set(x, 0.19, z);
    group.add(leg);
    legs.push(leg);
  }

  return { group, legs, head, body };
}

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
    case "pig": result = createPig(); break;
    case "cow": result = createCow(); break;
    case "sheep": result = createSheep(); break;
    case "zombie": result = createZombie(); break;
    case "skeleton": result = createSkeleton(); break;
    case "creeper": result = createCreeper(); break;
  }
  const shadowRadius = type === "cow" ? 0.4 : type === "sheep" ? 0.35 : 0.3;
  addShadow(result.group, shadowRadius);
  return result;
}
