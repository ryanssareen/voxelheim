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
  const green = mat(0x5a7a5a);
  const darkGreen = mat(0x3a5a3a);
  const pants = mat(0x2a2a6e);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.25), green);
  body.position.set(0, 0.85, 0);
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), darkGreen);
  head.position.set(0, 1.35, 0);
  group.add(head);

  // Eyes
  const eyeMat = mat(0x000000);
  for (const z of [0.08, -0.08]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), eyeMat);
    eye.position.set(0, 0.05, z);
    head.add(eye);
  }

  // Arms (stretched forward like zombie)
  const arms: THREE.Mesh[] = [];
  for (const z of [0.2, -0.2]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.55, 0.15), green);
    arm.position.set(0.15, 0.85, z);
    arm.rotation.x = -Math.PI / 3; // arms stretched forward
    group.add(arm);
    arms.push(arm);
  }

  const legs: THREE.Mesh[] = [];
  for (const z of [0.08, -0.08]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.18), pants);
    leg.position.set(0, 0.28, z);
    group.add(leg);
    legs.push(leg);
  }

  return { group, legs, head, body };
}

function createSkeleton(): MobModelData {
  const group = new THREE.Group();
  const bone = mat(0xe0e0e0);
  const dark = mat(0x2a2a2a);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 0.15), bone);
  body.position.set(0, 0.83, 0);
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), bone);
  head.position.set(0, 1.3, 0);
  group.add(head);

  // Dark eye sockets
  for (const z of [0.06, -0.06]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.02), dark);
    eye.position.set(0, 0.04, z);
    head.add(eye);
  }

  // Thin arms
  for (const z of [0.15, -0.15]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), bone);
    arm.position.set(0, 0.83, z);
    group.add(arm);
  }

  const legs: THREE.Mesh[] = [];
  for (const z of [0.05, -0.05]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), bone);
    leg.position.set(0, 0.28, z);
    group.add(leg);
    legs.push(leg);
  }

  return { group, legs, head, body };
}

function createCreeper(): MobModelData {
  const group = new THREE.Group();
  const green = mat(0x4caf50);
  const darkGreen = mat(0x2e7d32);

  // Tall body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.35), green);
  body.position.set(0, 0.7, 0);
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), green);
  head.position.set(0, 1.22, 0);
  group.add(head);

  // Face (sad creeper face)
  const faceMat = mat(0x1a1a1a);
  // Eyes
  for (const z of [0.06, -0.06]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), faceMat);
    eye.position.set(0, 0.05, z);
    head.add(eye);
  }
  // Mouth
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.02), faceMat);
  mouth.position.set(0, -0.06, 0);
  head.add(mouth);

  // 4 short legs
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[0.08, 0.08], [0.08, -0.08], [-0.08, 0.08], [-0.08, -0.08]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.35, 0.15), darkGreen);
    leg.position.set(x, 0.175, z);
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
