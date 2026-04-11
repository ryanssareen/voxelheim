import * as THREE from "three";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { createMobModel, type MobType, type MobModelData } from "@engine/entities/MobModel";
import { BLOCK_ID } from "@data/blocks";
import { findPath, findNearestCover, type PathPoint } from "@engine/entities/MobPathfinder";

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

interface DamageNumber {
  sprite: THREE.Sprite;
  lifetime: number;
  startY: number;
}

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
  public worldBounds: { min: number; max: number; center: number } | null = null;

  // Health bar
  private healthBarSprite: THREE.Sprite | null = null;
  private healthBarCanvas: HTMLCanvasElement | null = null;
  private healthBarVisible = false;
  private healthBarFadeTimer = 0;

  // Name tag (hostile only)
  private nameTagSprite: THREE.Sprite | null = null;

  // Damage numbers
  private damageNumbers: DamageNumber[] = [];

  // Pathfinding (hostile only)
  private currentPath: PathPoint[] | null = null;
  private pathIndex = 0;
  private pathRecalcTimer: number;

  // Sunlight burning (hostile only)
  public isBurning = false;
  private burnTickTimer = 0;
  private burnSprite: THREE.Sprite | null = null;
  private coverTarget: PathPoint | null = null;
  private seekingCover = false;

  constructor(type: MobType, x: number, y: number, z: number) {
    this.type = type;
    this.config = MOB_CONFIGS[type];
    this.health = this.config.health;
    this.position = { x, y, z };
    this.yaw = Math.random() * Math.PI * 2;
    this.aiTargetYaw = this.yaw;
    this.model = createMobModel(type);
    this.pathRecalcTimer = Math.random(); // stagger across mobs

    // Store original colors for hurt flash
    this.model.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshLambertMaterial) {
        this.originalColors.set(obj, obj.material.color.getHex());
      }
    });

    // Create name tag for hostile mobs
    if (this.config.hostile) {
      this.createNameTag();
    }
  }

  get group(): THREE.Group {
    return this.model.group;
  }

  update(
    dt: number,
    getBlock: (x: number, y: number, z: number) => number,
    registry: BlockRegistry,
    playerPos: { x: number; y: number; z: number },
    timeOfDay?: number,
    creative = false
  ): void {
    this.age += dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    // Death animation
    if (this.deathTimer >= 0) {
      this.deathTimer -= dt;
      const tilt = Math.min(1, (0.5 - this.deathTimer) / 0.5) * (Math.PI / 2);
      this.model.group.rotation.z = tilt;
      this.model.group.position.y = this.position.y - tilt * 0.3;
      this.updateDamageNumbers(dt);
      return;
    }
    if (this.dead) return;

    // Sunlight burning for hostile mobs
    if (this.config.hostile && timeOfDay !== undefined) {
      this.updateBurning(dt, getBlock, registry, playerPos, timeOfDay);
    }

    // AI — hostile mobs wander (like passive) in creative mode
    if (this.config.hostile && !creative) {
      this.updateHostileAI(dt, playerPos, getBlock, registry);
    } else {
      this.updatePassiveAI(dt, playerPos, getBlock, registry);
    }

    // Gravity (capped to prevent ground clipping)
    if (!this.onGround) {
      this.velocity.y -= GRAVITY * dt;
      if (this.velocity.y < -15) this.velocity.y = -15;
    }

    // Void kill — fell below the world
    if (this.position.y < 0) {
      this.dead = true;
      return;
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

    // Damage numbers
    this.updateDamageNumbers(dt);

    // Hurt flash
    if (this.hurtFlashTimer > 0) {
      this.hurtFlashTimer -= dt;
      const flashColor = this.isBurning ? 0xff6600 : 0xff0000;
      this.model.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshLambertMaterial) {
          obj.material.color.setHex(this.hurtFlashTimer > 0 ? flashColor : (this.originalColors.get(obj) ?? 0xffffff));
        }
      });
    }

    // Burn visual — orange tint when burning (and not in hurt flash)
    if (this.isBurning && this.hurtFlashTimer <= 0) {
      const flicker = Math.sin(this.age * 8) > 0;
      if (flicker) {
        this.model.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshLambertMaterial) {
            obj.material.color.setHex(0xff8800);
          }
        });
      } else {
        this.model.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshLambertMaterial) {
            obj.material.color.setHex(this.originalColors.get(obj) ?? 0xffffff);
          }
        });
      }
    }
  }

  // ─── Burning ───────────────────────────────────────────

  private updateBurning(
    dt: number,
    getBlock: (x: number, y: number, z: number) => number,
    registry: BlockRegistry,
    playerPos: { x: number; y: number; z: number },
    timeOfDay: number
  ): void {
    const isDay = timeOfDay <= 0.35 || timeOfDay >= 0.75;
    if (!isDay) {
      this.isBurning = false;
      this.seekingCover = false;
      this.coverTarget = null;
      this.hideBurnSprite();
      return;
    }

    // Check if exposed to sky (no solid block above within 10 blocks)
    const px = Math.floor(this.position.x);
    const py = Math.floor(this.position.y);
    const pz = Math.floor(this.position.z);
    let hasCover = false;
    for (let above = py + 2; above <= py + 10; above++) {
      if (registry.isSolid(getBlock(px, above, pz))) {
        hasCover = true;
        break;
      }
    }

    if (hasCover) {
      this.isBurning = false;
      this.seekingCover = false;
      this.coverTarget = null;
      this.hideBurnSprite();
      return;
    }

    // Exposed to sunlight — burn!
    this.isBurning = true;
    this.showBurnSprite();

    // Burn damage tick (every 1.9-2.9 seconds)
    this.burnTickTimer -= dt;
    if (this.burnTickTimer <= 0) {
      this.burnTickTimer = 1.9 + Math.random();
      this.takeDamage(2); // 2 damage per tick, 5 ticks to kill 10HP (~5-6s)
    }

    // Seek cover AI — but only if player is NOT within attack range
    const distToPlayer = Math.sqrt(
      (playerPos.x - this.position.x) ** 2 +
      (playerPos.z - this.position.z) ** 2
    );
    if (distToPlayer <= this.config.attackRange * 1.5) {
      // Player is close — attacking overrides seeking cover
      this.seekingCover = false;
      this.coverTarget = null;
      return;
    }

    // Find cover if we don't have a target
    this.seekingCover = true;
    if (!this.coverTarget) {
      const isSolid = (id: number) => registry.isSolid(id);
      this.coverTarget = findNearestCover(
        this.position.x, this.position.y, this.position.z,
        getBlock, isSolid
      );
      // If we found cover, pathfind to it
      if (this.coverTarget) {
        const isSolid2 = (id: number) => registry.isSolid(id);
        this.currentPath = findPath(
          this.position.x, this.position.y, this.position.z,
          this.coverTarget.x, this.coverTarget.y, this.coverTarget.z,
          getBlock, isSolid2
        );
        this.pathIndex = 0;
      }
    }
  }

  private showBurnSprite(): void {
    if (this.burnSprite) return;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d")!;
    // Draw simple fire icon
    ctx.fillStyle = "#ff6600";
    ctx.beginPath();
    ctx.moveTo(16, 2);
    ctx.lineTo(24, 20);
    ctx.lineTo(20, 16);
    ctx.lineTo(22, 28);
    ctx.lineTo(16, 22);
    ctx.lineTo(10, 28);
    ctx.lineTo(12, 16);
    ctx.lineTo(8, 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffcc00";
    ctx.beginPath();
    ctx.moveTo(16, 8);
    ctx.lineTo(20, 18);
    ctx.lineTo(16, 14);
    ctx.lineTo(12, 18);
    ctx.closePath();
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    this.burnSprite = new THREE.Sprite(material);
    this.burnSprite.scale.set(0.4, 0.4, 1);
    this.burnSprite.position.set(0, this.config.height + 0.5, 0);
    this.model.group.add(this.burnSprite);
  }

  private hideBurnSprite(): void {
    if (!this.burnSprite) return;
    this.model.group.remove(this.burnSprite);
    (this.burnSprite.material as THREE.SpriteMaterial).map?.dispose();
    this.burnSprite.material.dispose();
    this.burnSprite = null;
  }

  // ─── Pathfinding ───────────────────────────────────────

  private followPath(dt: number): boolean {
    if (!this.currentPath || this.pathIndex >= this.currentPath.length) return false;

    const wp = this.currentPath[this.pathIndex];
    const dx = wp.x - this.position.x;
    const dz = wp.z - this.position.z;
    const wpDist = Math.sqrt(dx * dx + dz * dz);

    if (wpDist < 0.5) {
      this.pathIndex++;
      return this.pathIndex < this.currentPath.length;
    }

    const dirX = dx / wpDist;
    const dirZ = dz / wpDist;
    this.velocity.x = dirX * this.config.speed;
    this.velocity.z = dirZ * this.config.speed;
    this.yaw = Math.atan2(-dirX, -dirZ);
    this.isMoving = true;

    // Auto-jump for step-ups
    if (wp.y > this.position.y + 0.5 && this.onGround) {
      this.velocity.y = 7;
      this.onGround = false;
    }

    return true;
  }

  // ─── AI ────────────────────────────────────────────────

  private hasGroundAhead(
    getBlock: (x: number, y: number, z: number) => number,
    registry: BlockRegistry
  ): boolean {
    const lookX = -Math.sin(this.yaw);
    const lookZ = -Math.cos(this.yaw);
    const aheadX = Math.floor(this.position.x + lookX * 1.2);
    const aheadZ = Math.floor(this.position.z + lookZ * 1.2);
    const feetY = Math.floor(this.position.y);
    return (
      registry.isSolid(getBlock(aheadX, feetY - 1, aheadZ)) ||
      registry.isSolid(getBlock(aheadX, feetY, aheadZ))
    );
  }

  private isBlockedAhead(
    getBlock: (x: number, y: number, z: number) => number,
    registry: BlockRegistry
  ): boolean {
    const lookX = -Math.sin(this.yaw);
    const lookZ = -Math.cos(this.yaw);
    const aheadX = Math.floor(this.position.x + lookX * 0.8);
    const aheadZ = Math.floor(this.position.z + lookZ * 0.8);
    const feetY = Math.floor(this.position.y);
    return registry.isSolid(getBlock(aheadX, feetY, aheadZ)) ||
           registry.isSolid(getBlock(aheadX, feetY + 1, aheadZ));
  }

  private updatePassiveAI(
    dt: number,
    playerPos: { x: number; y: number; z: number },
    getBlock: (x: number, y: number, z: number) => number,
    registry: BlockRegistry
  ): void {
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
      let diff = this.aiTargetYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * dt * 3;

      if (!this.hasGroundAhead(getBlock, registry) || this.isBlockedAhead(getBlock, registry)) {
        this.aiTargetYaw = this.yaw + Math.PI * (0.5 + Math.random());
        this.aiTimer = 0.5 + Math.random();
        this.velocity.x = 0;
        this.velocity.z = 0;
        return;
      }

      this.velocity.x = -Math.sin(this.yaw) * this.config.speed;
      this.velocity.z = -Math.cos(this.yaw) * this.config.speed;

      if (this.worldBounds) {
        const b = this.worldBounds;
        if (this.position.x < b.min || this.position.x > b.max ||
            this.position.z < b.min || this.position.z > b.max) {
          this.aiTargetYaw = Math.atan2(b.center - this.position.x, b.center - this.position.z);
          this.aiTimer = 1 + Math.random() * 2;
        }
      }
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
  }

  private updateHostileAI(
    dt: number,
    playerPos: { x: number; y: number; z: number },
    getBlock: (x: number, y: number, z: number) => number,
    registry: BlockRegistry
  ): void {
    // If burning and seeking cover, follow cover path
    if (this.seekingCover && this.coverTarget) {
      if (this.followPath(dt)) return;
      // Reached cover or no path — stop seeking
      this.seekingCover = false;
      this.coverTarget = null;
      this.currentPath = null;
    }

    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < this.config.detectRange) {
      // Recalculate path periodically
      this.pathRecalcTimer -= dt;
      if (this.pathRecalcTimer <= 0 || !this.currentPath) {
        this.pathRecalcTimer = 1.0;
        const isSolid = (id: number) => registry.isSolid(id);
        this.currentPath = findPath(
          this.position.x, this.position.y, this.position.z,
          playerPos.x, playerPos.y, playerPos.z,
          getBlock, isSolid
        );
        this.pathIndex = 0;
      }

      if (this.type === "skeleton" && dist < this.config.attackRange && dist > 6) {
        // Stand and shoot
        this.yaw = Math.atan2(-dx, -dz);
        this.velocity.x = 0;
        this.velocity.z = 0;
        this.isMoving = false;
      } else if (dist > this.config.attackRange) {
        // Follow path to player
        if (!this.followPath(dt)) {
          // Fallback: direct line movement
          const wouldFall = !this.hasGroundAhead(getBlock, registry);
          if (wouldFall) {
            this.velocity.x = 0;
            this.velocity.z = 0;
            this.isMoving = false;
          } else {
            this.yaw = Math.atan2(-dx, -dz);
            this.velocity.x = (dx / dist) * this.config.speed;
            this.velocity.z = (dz / dist) * this.config.speed;
            this.isMoving = true;
          }
        }
      } else {
        // Within attack range
        this.yaw = Math.atan2(-dx, -dz);
        if (this.type === "creeper" && !this.exploding) {
          this.exploding = true;
          this.explodeTimer = 1.5;
        }
        this.velocity.x = 0;
        this.velocity.z = 0;
        this.isMoving = false;
        this.currentPath = null;
      }
    } else {
      // Wander (same as passive)
      this.currentPath = null;
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

        if (!this.hasGroundAhead(getBlock, registry) || this.isBlockedAhead(getBlock, registry)) {
          this.aiTargetYaw = this.yaw + Math.PI * (0.5 + Math.random());
          this.aiTimer = 0.5 + Math.random();
          this.velocity.x = 0;
          this.velocity.z = 0;
          return;
        }

        this.velocity.x = -Math.sin(this.yaw) * this.config.speed * 0.5;
        this.velocity.z = -Math.cos(this.yaw) * this.config.speed * 0.5;

        if (this.worldBounds) {
          const b = this.worldBounds;
          if (this.position.x < b.min || this.position.x > b.max ||
              this.position.z < b.min || this.position.z > b.max) {
            this.aiTargetYaw = Math.atan2(b.center - this.position.x, b.center - this.position.z);
            this.aiTimer = 1 + Math.random() * 2;
          }
        }
      } else {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }
    }

    // Creeper explosion countdown
    if (this.exploding) {
      this.explodeTimer -= dt;
      const flash = Math.sin(this.explodeTimer * 10) > 0;
      this.model.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshLambertMaterial) {
          obj.material.color.setHex(flash ? 0xffffff : (this.originalColors.get(obj) ?? 0x4caf50));
        }
      });
      if (this.explodeTimer <= 0) {
        this.dead = true;
      }
    }
  }

  // ─── Damage / Combat ──────────────────────────────────

  takeDamage(amount: number, attackerPos?: { x: number; z: number }): void {
    this.health -= amount;
    this.hurtFlashTimer = 0.3;
    this.healthBarFadeTimer = 3;
    this.updateHealthBar();
    this.spawnDamageNumber(amount);
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

  distanceTo(pos: { x: number; y: number; z: number }): number {
    const dx = pos.x - this.position.x;
    const dy = (pos.y + 0.9) - (this.position.y + this.config.height / 2);
    const dz = pos.z - this.position.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // ─── Name tag ─────────────────────────────────────────

  private createNameTag(): void {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 32;
    const ctx = canvas.getContext("2d")!;

    const name = this.type.charAt(0).toUpperCase() + this.type.slice(1);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(8, 4, 112, 24);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 64, 16);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
      depthWrite: false,
    });
    this.nameTagSprite = new THREE.Sprite(material);
    this.nameTagSprite.scale.set(1.2, 0.3, 1);
    this.nameTagSprite.position.set(0, this.config.height + 0.35, 0);
    this.model.group.add(this.nameTagSprite);
  }

  // ─── Damage numbers ───────────────────────────────────

  private spawnDamageNumber(amount: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext("2d")!;

    ctx.font = "bold 24px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Black outline
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.strokeText(amount.toString(), 32, 16);
    // Red fill
    ctx.fillStyle = this.isBurning ? "#ff8800" : "#ff4444";
    ctx.fillText(amount.toString(), 32, 16);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.6, 0.3, 1);
    const startY = this.config.height + 0.5;
    sprite.position.set((Math.random() - 0.5) * 0.3, startY, (Math.random() - 0.5) * 0.3);
    this.model.group.add(sprite);
    this.damageNumbers.push({ sprite, lifetime: 1.0, startY });
  }

  private updateDamageNumbers(dt: number): void {
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      dn.lifetime -= dt;
      if (dn.lifetime <= 0) {
        this.model.group.remove(dn.sprite);
        (dn.sprite.material as THREE.SpriteMaterial).map?.dispose();
        dn.sprite.material.dispose();
        this.damageNumbers.splice(i, 1);
      } else {
        const progress = 1.0 - dn.lifetime;
        dn.sprite.position.y = dn.startY + progress * 1.5;
        (dn.sprite.material as THREE.SpriteMaterial).opacity =
          dn.lifetime < 0.3 ? dn.lifetime / 0.3 : 1.0;
      }
    }
  }

  // ─── Health bar ───────────────────────────────────────

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

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, w, h);

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

  // ─── Movement ─────────────────────────────────────────

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

  // ─── Cleanup ──────────────────────────────────────────

  dispose(): void {
    for (const dn of this.damageNumbers) {
      this.model.group.remove(dn.sprite);
      (dn.sprite.material as THREE.SpriteMaterial).map?.dispose();
      dn.sprite.material.dispose();
    }
    this.damageNumbers.length = 0;
    this.hideBurnSprite();
    this.model.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
      }
    });
  }
}
