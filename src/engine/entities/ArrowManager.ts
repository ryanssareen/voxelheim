import * as THREE from "three";
import { BlockRegistry } from "@engine/world/BlockRegistry";

const GRAVITY = 9;
const ARROW_LIFETIME = 6; // seconds
const STUCK_LIFETIME = 10; // seconds once stuck in a block
const PLAYER_HALF_WIDTH = 0.3;
const PLAYER_HEIGHT = 1.8;

export interface Arrow {
  id: string;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  stuck: boolean;
  stuckTimer: number;
  damage: number;
  group: THREE.Group;
  /** Entity id of the attacker — avoids friendly-fire from self. */
  ownerId: string;
}

export interface ArrowHit {
  arrowId: string;
  damage: number;
  fromX: number;
  fromZ: number;
  ownerId: string;
}

/** Damage callback when an arrow hits the local player. */
export type ArrowPlayerHitHandler = (hit: ArrowHit) => void;

/**
 * Arrows are physical projectiles that players can dodge. They spawn with a
 * velocity, arc under gravity, and damage the player only on AABB collision.
 */
export class ArrowManager {
  private readonly scene: THREE.Scene;
  private readonly registry = BlockRegistry.getInstance();
  private readonly arrows: Arrow[] = [];
  private nextId = 0;
  private onPlayerHit: ArrowPlayerHitHandler | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setPlayerHitHandler(handler: ArrowPlayerHitHandler | null): void {
    this.onPlayerHit = handler;
  }

  /**
   * Spawn an arrow at `origin` with speed `speed` aimed at `target` plus a
   * random yaw perturbation for inaccuracy. Gravity is compensated with a
   * ballistic lob for long distances.
   */
  spawnAimed(
    origin: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number },
    speed: number,
    damage: number,
    ownerId: string,
  ): void {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dz = target.z - origin.z;
    const horizDist = Math.sqrt(dx * dx + dz * dz);
    if (horizDist < 0.01) return;

    // Ballistic arc: t = horizDist / horizSpeed. Compensate y so arrow lands on target.
    const t = horizDist / speed;
    const vy = dy / t + 0.5 * GRAVITY * t;

    // Small random yaw error for imperfect aim
    const angle = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.06;
    const vx = Math.sin(angle) * speed;
    const vz = Math.cos(angle) * speed;

    const pos = new THREE.Vector3(origin.x, origin.y, origin.z);
    const vel = new THREE.Vector3(vx, vy, vz);

    const group = this.buildArrowMesh();
    group.position.copy(pos);
    this.orientAlongVelocity(group, vel);
    this.scene.add(group);

    this.arrows.push({
      id: `arrow-${this.nextId++}`,
      position: pos,
      velocity: vel,
      age: 0,
      stuck: false,
      stuckTimer: 0,
      damage,
      group,
      ownerId,
    });
  }

  update(
    dt: number,
    playerPos: { x: number; y: number; z: number },
    getBlock: (x: number, y: number, z: number) => number,
  ): void {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i];
      arrow.age += dt;

      if (arrow.stuck) {
        arrow.stuckTimer += dt;
        if (arrow.stuckTimer > STUCK_LIFETIME || arrow.age > ARROW_LIFETIME + STUCK_LIFETIME) {
          this.removeArrow(i);
        }
        continue;
      }

      // Step the arrow in small sub-steps so fast arrows don't tunnel past the player
      const steps = Math.max(1, Math.ceil(arrow.velocity.length() * dt / 0.3));
      const subDt = dt / steps;
      let consumed = false;

      for (let s = 0; s < steps; s++) {
        // Apply gravity
        arrow.velocity.y -= GRAVITY * subDt;
        arrow.position.x += arrow.velocity.x * subDt;
        arrow.position.y += arrow.velocity.y * subDt;
        arrow.position.z += arrow.velocity.z * subDt;

        // Hit player AABB
        if (
          arrow.position.x > playerPos.x - PLAYER_HALF_WIDTH &&
          arrow.position.x < playerPos.x + PLAYER_HALF_WIDTH &&
          arrow.position.y > playerPos.y &&
          arrow.position.y < playerPos.y + PLAYER_HEIGHT &&
          arrow.position.z > playerPos.z - PLAYER_HALF_WIDTH &&
          arrow.position.z < playerPos.z + PLAYER_HALF_WIDTH
        ) {
          this.onPlayerHit?.({
            arrowId: arrow.id,
            damage: arrow.damage,
            fromX: arrow.position.x - arrow.velocity.x * 0.1,
            fromZ: arrow.position.z - arrow.velocity.z * 0.1,
            ownerId: arrow.ownerId,
          });
          this.removeArrow(i);
          consumed = true;
          break;
        }

        // Hit block
        const bx = Math.floor(arrow.position.x);
        const by = Math.floor(arrow.position.y);
        const bz = Math.floor(arrow.position.z);
        if (by >= 0 && this.registry.isSolid(getBlock(bx, by, bz))) {
          arrow.stuck = true;
          arrow.velocity.set(0, 0, 0);
          break;
        }
      }

      if (consumed) continue;

      // Update visual
      arrow.group.position.copy(arrow.position);
      if (!arrow.stuck) {
        this.orientAlongVelocity(arrow.group, arrow.velocity);
      }

      if (arrow.age > ARROW_LIFETIME) {
        this.removeArrow(i);
      }
    }
  }

  dispose(): void {
    for (const arrow of this.arrows) {
      this.scene.remove(arrow.group);
      this.disposeGroup(arrow.group);
    }
    this.arrows.length = 0;
  }

  private removeArrow(index: number): void {
    const arrow = this.arrows[index];
    this.scene.remove(arrow.group);
    this.disposeGroup(arrow.group);
    this.arrows.splice(index, 1);
  }

  private disposeGroup(group: THREE.Group): void {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
      }
    });
  }

  private buildArrowMesh(): THREE.Group {
    const group = new THREE.Group();
    // Shaft — thin brown cylinder along Z
    const shaftGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6);
    shaftGeo.rotateX(Math.PI / 2);
    const shaftMat = new THREE.MeshLambertMaterial({ color: 0x6b3f14 });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    group.add(shaft);

    // Head — dark cone at the tip
    const headGeo = new THREE.ConeGeometry(0.06, 0.16, 6);
    headGeo.rotateX(Math.PI / 2);
    headGeo.translate(0, 0, 0.42);
    const headMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
    const head = new THREE.Mesh(headGeo, headMat);
    group.add(head);

    // Fletching — cross of tiny feathers near the back
    const feathGeo = new THREE.BoxGeometry(0.02, 0.12, 0.18);
    feathGeo.translate(0, 0, -0.28);
    const feathMat = new THREE.MeshLambertMaterial({ color: 0xe0e0e0 });
    const feath1 = new THREE.Mesh(feathGeo, feathMat);
    const feath2 = new THREE.Mesh(feathGeo.clone().rotateZ(Math.PI / 2), feathMat);
    group.add(feath1, feath2);

    return group;
  }

  private orientAlongVelocity(group: THREE.Group, velocity: THREE.Vector3): void {
    const len = velocity.length();
    if (len < 0.01) return;
    // Arrow mesh points along +Z by construction; look forward along velocity
    const target = new THREE.Vector3().copy(group.position).addScaledVector(velocity, 1 / len);
    group.lookAt(target);
  }
}
