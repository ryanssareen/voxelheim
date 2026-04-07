import * as THREE from "three";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { createMobModel, type MobType, type MobModelData } from "@engine/entities/MobModel";
import { BLOCK_ID } from "@data/blocks";

const GRAVITY = 20;

interface MobConfig {
  health: number;
  speed: number;
  halfWidth: number;
  height: number;
  hostile: boolean;
  detectRange: number;
  attackRange: number;
  dropId: number;
}

const MOB_CONFIGS: Record<MobType, MobConfig> = {
  pig:      { health: 5,  speed: 1.5, halfWidth: 0.25, height: 0.6,  hostile: false, detectRange: 0,  attackRange: 0,   dropId: BLOCK_ID.RAW_PORK },
  cow:      { health: 5,  speed: 1.5, halfWidth: 0.3,  height: 0.7,  hostile: false, detectRange: 0,  attackRange: 0,   dropId: BLOCK_ID.RAW_BEEF },
  sheep:    { health: 5,  speed: 1.5, halfWidth: 0.25, height: 0.65, hostile: false, detectRange: 0,  attackRange: 0,   dropId: BLOCK_ID.RAW_MUTTON },
  zombie:   { health: 10, speed: 2.5, halfWidth: 0.25, height: 1.6,  hostile: true,  detectRange: 16, attackRange: 1.5, dropId: BLOCK_ID.DIRT },
  skeleton: { health: 10, speed: 2.0, halfWidth: 0.2,  height: 1.6,  hostile: true,  detectRange: 16, attackRange: 10,  dropId: BLOCK_ID.STONE },
  creeper:  { health: 10, speed: 2.0, halfWidth: 0.2,  height: 1.2,  hostile: true,  detectRange: 16, attackRange: 2,   dropId: BLOCK_ID.SAND },
};

export class Mob {
  public readonly type: MobType;
  public readonly config: MobConfig;
  public position: { x: number; y: number; z: number };
  public velocity = { x: 0, y: 0, z: 0 };
  public onGround = false;
  public health: number;
  public yaw = 0;
  public dead = false;
  public age = 0;

  private model: MobModelData;
  private walkTime = 0;
  private aiTimer = 0;
  private aiTargetYaw = 0;
  private isMoving = false;
  private fleeTimer = 0;
  private hurtFlashTimer = 0;
  private exploding = false;
  private explodeTimer = 0;
  private originalColors: Map<THREE.Mesh, number> = new Map();
  public attackCooldown = 0;
  public deathTimer = -1;
  private healthBarSprite: THREE.Sprite | null = null;
  private healthBarCanvas: HTMLCanvasElement | null = null;
  private healthBarVisible = false;
  private healthBarFadeTimer = 0;

  constructor(type: MobType, x: number, y: number, z: number) {
    this.type = type;
    this.config = MOB_CONFIGS[type];
    this.health = this.config.health;
    this.position = { x, y, z };
    this.yaw = Math.random() * Math.PI * 2;
    this.aiTargetYaw = this.yaw;
    this.model = createMobModel(type);

    // Store original colors for hurt flash
    this.model.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshLambertMaterial) {
        this.originalColors.set(obj, obj.material.color.getHex());
      }
    });
  }

  get group(): THREE.Group {
    return this.model.group;
  }

  update(
    dt: number,
    getBlock: (x: number, y: number, z: number) => number,
    registry: BlockRegistry,
    playerPos: { x: number; y: number; z: number }
  ): void {
    this.age += dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    // Death animation
    if (this.deathTimer >= 0) {
      this.deathTimer -= dt;
      const tilt = Math.min(1, (0.5 - this.deathTimer) / 0.5) * (Math.PI / 2);
      this.model.group.rotation.z = tilt;
      this.model.group.position.y = this.position.y - tilt * 0.3;
      return;
    }
    if (this.dead) return;

    // AI
    if (this.config.hostile) {
      this.updateHostileAI(dt, playerPos);
    } else {
      this.updatePassiveAI(dt, playerPos);
    }

    // Gravity
    if (!this.onGround) {
      this.velocity.y -= GRAVITY * dt;
    }

    // Apply movement
    this.moveAxis("y", this.velocity.y * dt, getBlock, registry);
    this.moveAxis("x", this.velocity.x * dt, getBlock, registry);
    this.moveAxis("z", this.velocity.z * dt, getBlock, registry);

    // Update visuals
    this.model.group.position.set(this.position.x, this.position.y, this.position.z);
    this.model.group.rotation.y = this.yaw;

    // Walk animation
    if (this.isMoving) {
      this.walkTime += dt * 6;
      const swing = Math.sin(this.walkTime) * 0.4;
      for (let i = 0; i < this.model.legs.length; i++) {
        this.model.legs[i].rotation.x = i % 2 === 0 ? swing : -swing;
      }
    } else {
      this.walkTime = 0;
      for (const leg of this.model.legs) leg.rotation.x = 0;

      // Idle breathing: subtle body bob when standing still
      const breathe = Math.sin(this.age * 2) * 0.01;
      this.model.body.position.y += breathe;
    }

    // Head tracking: look toward player when nearby
    if (this.model.head) {
      const dx = playerPos.x - this.position.x;
      const dz = playerPos.z - this.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const trackRange = this.config.hostile ? this.config.detectRange : 8;
      if (dist < trackRange && dist > 0.5) {
        const targetYaw = Math.atan2(-dx, -dz) - this.yaw;
        let headYaw = targetYaw;
        while (headYaw > Math.PI) headYaw -= Math.PI * 2;
        while (headYaw < -Math.PI) headYaw += Math.PI * 2;
        headYaw = Math.max(-1.05, Math.min(1.05, headYaw));
        this.model.head.rotation.y = headYaw;

        const dy = (playerPos.y + 1) - (this.position.y + this.config.height);
        const pitch = Math.atan2(dy, dist);
        this.model.head.rotation.x = Math.max(-0.5, Math.min(0.5, pitch));
      } else {
        this.model.head.rotation.y = 0;
        this.model.head.rotation.x = 0;
      }
    }

    // Health bar fade
    if (this.healthBarFadeTimer > 0) {
      this.healthBarFadeTimer -= dt;
      if (!this.healthBarVisible && this.health < this.config.health) {
        this.showHealthBar();
      }
      if (this.healthBarFadeTimer <= 0) {
        this.hideHealthBar();
      }
    }

    // Hurt flash
    if (this.hurtFlashTimer > 0) {
      this.hurtFlashTimer -= dt;
      this.model.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshLambertMaterial) {
          obj.material.color.setHex(this.hurtFlashTimer > 0 ? 0xff0000 : (this.originalColors.get(obj) ?? 0xffffff));
        }
      });
    }
  }

  private updatePassiveAI(dt: number, playerPos: { x: number; y: number; z: number }): void {
    // Flee if recently hit
    if (this.fleeTimer > 0) {
      this.fleeTimer -= dt;
      const dx = this.position.x - playerPos.x;
      const dz = this.position.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 0.1) {
        this.yaw = Math.atan2(dx, dz);
        this.velocity.x = (dx / dist) * 4;
        this.velocity.z = (dz / dist) * 4;
        this.isMoving = true;
      }
      return;
    }

    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      // Random: idle or wander
      if (Math.random() > 0.4) {
        this.aiTargetYaw = Math.random() * Math.PI * 2;
        this.isMoving = true;
        this.aiTimer = 2 + Math.random() * 3;
      } else {
        this.isMoving = false;
        this.aiTimer = 2 + Math.random() * 3;
      }
    }

    if (this.isMoving) {
      // Smoothly turn toward target yaw
      let diff = this.aiTargetYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * dt * 3;

      this.velocity.x = -Math.sin(this.yaw) * this.config.speed;
      this.velocity.z = -Math.cos(this.yaw) * this.config.speed;

      // Don't walk off the island
      if (this.position.x < 2 || this.position.x > 62 ||
          this.position.z < 2 || this.position.z > 62) {
        // Turn back toward center
        this.aiTargetYaw = Math.atan2(32 - this.position.x, 32 - this.position.z) + Math.PI;
      }
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
  }

  private updateHostileAI(dt: number, playerPos: { x: number; y: number; z: number }): void {
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < this.config.detectRange) {
      // Face player
      this.yaw = Math.atan2(-dx, -dz);

      if (this.type === "skeleton" && dist < this.config.attackRange && dist > 6) {
        // Skeleton stops at range
        this.velocity.x = 0;
        this.velocity.z = 0;
        this.isMoving = false;
      } else if (dist > this.config.attackRange) {
        // Chase
        this.velocity.x = (dx / dist) * this.config.speed;
        this.velocity.z = (dz / dist) * this.config.speed;
        this.isMoving = true;
      } else {
        // In attack range
        if (this.type === "creeper" && !this.exploding) {
          this.exploding = true;
          this.explodeTimer = 1.5; // 1.5 second fuse
        }
        this.velocity.x = 0;
        this.velocity.z = 0;
        this.isMoving = false;
      }
    } else {
      // Wander
      this.aiTimer -= dt;
      if (this.aiTimer <= 0) {
        this.aiTargetYaw = Math.random() * Math.PI * 2;
        this.isMoving = Math.random() > 0.5;
        this.aiTimer = 3 + Math.random() * 4;
      }
      if (this.isMoving) {
        let diff = this.aiTargetYaw - this.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.yaw += diff * dt * 2;
        this.velocity.x = -Math.sin(this.yaw) * this.config.speed * 0.5;
        this.velocity.z = -Math.cos(this.yaw) * this.config.speed * 0.5;
      } else {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }
    }

    // Creeper explosion countdown
    if (this.exploding) {
      this.explodeTimer -= dt;
      // Flash white
      const flash = Math.sin(this.explodeTimer * 10) > 0;
      this.model.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshLambertMaterial) {
          obj.material.color.setHex(flash ? 0xffffff : (this.originalColors.get(obj) ?? 0x4caf50));
        }
      });
      if (this.explodeTimer <= 0) {
        this.dead = true; // MobManager handles the explosion effect
      }
    }
  }

  takeDamage(amount: number, attackerPos?: { x: number; z: number }): void {
    this.health -= amount;
    this.hurtFlashTimer = 0.3;
    this.healthBarFadeTimer = 3;
    this.updateHealthBar();
    if (!this.config.hostile) {
      this.fleeTimer = 3;
    }
    if (attackerPos) {
      const dx = this.position.x - attackerPos.x;
      const dz = this.position.z - attackerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 0.01) {
        this.velocity.x += (dx / dist) * 3;
        this.velocity.z += (dz / dist) * 3;
        this.velocity.y = 2;
        this.onGround = false;
      }
    }
    if (this.health <= 0) {
      this.dead = true;
      this.deathTimer = 0.5;
    }
  }

  /** Distance to player for attack checks. */
  distanceTo(pos: { x: number; y: number; z: number }): number {
    const dx = pos.x - this.position.x;
    const dy = (pos.y + 0.9) - (this.position.y + this.config.height / 2);
    const dz = pos.z - this.position.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private moveAxis(
    axis: "x" | "y" | "z",
    delta: number,
    getBlock: (x: number, y: number, z: number) => number,
    registry: BlockRegistry
  ): void {
    this.position[axis] += delta;

    const hw = this.config.halfWidth;
    const h = this.config.height;
    const minX = this.position.x - hw;
    const maxX = this.position.x + hw;
    const minY = this.position.y;
    const maxY = this.position.y + h;
    const minZ = this.position.z - hw;
    const maxZ = this.position.z + hw;

    for (let bx = Math.floor(minX); bx <= Math.floor(maxX); bx++) {
      for (let by = Math.floor(minY); by <= Math.floor(maxY); by++) {
        for (let bz = Math.floor(minZ); bz <= Math.floor(maxZ); bz++) {
          if (!registry.isSolid(getBlock(bx, by, bz))) continue;

          if (axis === "y") {
            if (delta < 0) {
              this.position.y = by + 1;
              this.velocity.y = 0;
              this.onGround = true;
            } else {
              this.position.y = by - h;
              this.velocity.y = 0;
            }
            return;
          } else if (axis === "x") {
            this.position.x = delta < 0 ? bx + 1 + hw : bx - hw;
            this.velocity.x = 0;
            return;
          } else {
            this.position.z = delta < 0 ? bz + 1 + hw : bz - hw;
            this.velocity.z = 0;
            return;
          }
        }
      }
    }

    if (axis === "y" && delta <= 0) this.onGround = false;
  }

  private createHealthBar(): void {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 8;
    this.healthBarCanvas = canvas;

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;

    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.8, 0.1, 1);
    sprite.position.set(0, this.config.height + 0.15, 0);
    this.healthBarSprite = sprite;
    this.model.group.add(sprite);
    this.updateHealthBar();
  }

  private updateHealthBar(): void {
    if (!this.healthBarCanvas) return;
    const ctx = this.healthBarCanvas.getContext("2d")!;
    const w = this.healthBarCanvas.width;
    const h = this.healthBarCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, w, h);

    // Health fill
    const pct = Math.max(0, this.health / this.config.health);
    const fillW = Math.round(pct * (w - 2));
    ctx.fillStyle = pct > 0.5 ? "#4caf50" : pct > 0.25 ? "#ffeb3b" : "#f44336";
    ctx.fillRect(1, 1, fillW, h - 2);

    if (this.healthBarSprite) {
      (this.healthBarSprite.material as THREE.SpriteMaterial).map!.needsUpdate = true;
    }
  }

  private showHealthBar(): void {
    if (!this.healthBarSprite) this.createHealthBar();
    if (this.healthBarSprite) this.healthBarSprite.visible = true;
    this.healthBarVisible = true;
  }

  private hideHealthBar(): void {
    if (this.healthBarSprite) this.healthBarSprite.visible = false;
    this.healthBarVisible = false;
  }

  dispose(): void {
    this.model.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
      }
    });
  }
}
