import * as THREE from "three";
import { Clock } from "@engine/Clock";
import { InputManager } from "@engine/InputManager";
import { Camera } from "@engine/player/Camera";
import { PlayerController } from "@engine/player/PlayerController";
import { PlayerModel } from "@engine/player/PlayerModel";
import { HandRenderer } from "@engine/player/HandRenderer";
import { OffhandRenderer } from "@engine/player/OffhandRenderer";
import { BlockInteraction } from "@engine/player/BlockInteraction";
import { BlockBreakOverlay } from "@engine/renderer/BlockBreakOverlay";
import { Renderer } from "@engine/renderer/Renderer";
import { ChunkManager } from "@engine/world/ChunkManager";
import { ItemDropManager } from "@engine/world/ItemDropManager";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { DayNightCycle } from "@engine/world/DayNightCycle";
import { MobManager } from "@engine/entities/MobManager";
import { MusicManager } from "@engine/audio/MusicManager";
import { useHotbarStore } from "@store/useHotbarStore";
import { useGameStore } from "@store/useGameStore";
import { useSettingsStore } from "@store/useSettingsStore";
import { useInventoryStore } from "@store/useInventoryStore";
import {
  saveWorld,
  loadWorldMeta,
  loadWorldChunks,
  type WorldMeta,
} from "@systems/persistence/WorldStorage";
import type { WorldType } from "@engine/world/constants";
import { BLOCK_DEFINITIONS } from "@data/blocks";

const MOUSE_SENSITIVITY = 0.002;
const SPAWN = { x: 32, y: 50, z: 32 };
const VOID_Y = -10;
const AUTOSAVE_INTERVAL = 15_000; // Save every 15 seconds

export class Engine {
  private readonly canvas: HTMLCanvasElement;
  private readonly clock = new Clock();
  private readonly input = new InputManager();
  private readonly camera = new Camera();
  private readonly registry = BlockRegistry.getInstance();
  public renderer: Renderer | null = null;
  private chunkManager: ChunkManager | null = null;
  private player: PlayerController | null = null;
  private playerModel: PlayerModel | null = null;
  private handRenderer: HandRenderer | null = null;
  private offhandRenderer: OffhandRenderer | null = null;
  private blockInteraction: BlockInteraction | null = null;
  private breakOverlay: BlockBreakOverlay | null = null;
  private itemDrops: ItemDropManager | null = null;
  private dayNight: DayNightCycle | null = null;
  private mobManager: MobManager | null = null;
  private music: MusicManager | null = null;
  private ambientLight: any = null;
  private directionalLight: any = null;
  private animationFrameId = 0;
  private running = false;
  private pWasDown = false;
  private eWasDown = false;
  private worldId: string | null = null;
  private seed = "voxelheim-mvp";
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private playerAttackCooldown = 0;
  private qWasDown = false;
  private hungerExhaustion = 0;
  private passiveHungerTimer = 0;
  private regenTimer = 0;
  private starvationTimer = 0;
  private fallStartY = 0;
  private wasFalling = false;
  private frameCount = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init(worldId?: string): Promise<void> {
    this.renderer = new Renderer(this.canvas);
    await this.renderer.init();

    // Load world config
    this.worldId = worldId ?? null;
    let savedMeta: WorldMeta | null = null;

    let worldType: WorldType = "island";

    if (worldId) {
      savedMeta = await loadWorldMeta(worldId);
      if (savedMeta) {
        this.seed = savedMeta.seed;
        if (savedMeta.worldType === "flat" || savedMeta.worldType === "infinite") {
          worldType = savedMeta.worldType;
        }
      }
    } else {
      // Read seed from sessionStorage (from create world page)
      try {
        const config = JSON.parse(
          sessionStorage.getItem("voxelheim-world-config") || "{}"
        );
        if (config.seed) this.seed = config.seed;
        if (config.worldType === "flat" || config.worldType === "infinite") {
          worldType = config.worldType;
        }
      } catch {
        /* ignore */
      }
    }

    // Adjust spawn based on world type
    if (worldType === "infinite") {
      SPAWN.x = 64; SPAWN.y = 50; SPAWN.z = 64;
    } else if (worldType === "flat") {
      SPAWN.x = 32; SPAWN.y = 35; SPAWN.z = 32;
    }

    this.chunkManager = new ChunkManager(this.renderer, this.seed, worldType);
    this.chunkManager.update(0, 0, 0);

    // Load saved chunk modifications
    if (worldId) {
      const savedChunks = await loadWorldChunks(worldId);
      if (savedChunks.size > 0) {
        this.chunkManager.loadModifiedChunks(savedChunks);
      }
    }

    this.input.init(this.canvas);
    this.input.onPointerLockLost = () => {
      // Don't pause if dead or inventory is open
      if (!useGameStore.getState().isDead && !useInventoryStore.getState().isOpen) {
        useGameStore.getState().setPaused(true);
      }
    };

    // Player
    const spawnPos = savedMeta?.playerPos ?? SPAWN;
    this.player = new PlayerController(spawnPos.x, spawnPos.y, spawnPos.z);
    if (savedMeta) {
      this.camera.yaw = savedMeta.playerYaw;
      this.camera.pitch = savedMeta.playerPitch;
    }

    this.itemDrops = new ItemDropManager(this.renderer.getScene());
    this.itemDrops.setGetBlock((x, y, z) => this.chunkManager!.getBlock(x, y, z));
    this.blockInteraction = new BlockInteraction(this.chunkManager, this.registry, this.itemDrops);

    // Player model (3rd person)
    this.playerModel = new PlayerModel();
    this.renderer.getScene().add(this.playerModel.group);

    // Hand (1st person)
    this.handRenderer = new HandRenderer(this.renderer.getCamera());
    this.offhandRenderer = new OffhandRenderer(this.renderer.getCamera());

    // Break overlay
    this.breakOverlay = new BlockBreakOverlay();
    this.renderer.getScene().add(this.breakOverlay.getMesh());

    // Day/night cycle
    this.dayNight = new DayNightCycle();

    // Mob manager
    this.mobManager = new MobManager(this.renderer.getScene());
    this.mobManager.setItemDrops(this.itemDrops);

    // Get light references from scene for day/night updates
    this.renderer.getScene().traverse((obj: any) => {
      if (obj.isAmbientLight) this.ambientLight = obj;
      if (obj.isDirectionalLight) this.directionalLight = obj;
    });

    // Restore state
    if (savedMeta) {
      useGameStore.setState({
        shardsCollected: savedMeta.shardsCollected,
        health: savedMeta.health ?? 20,
        hunger: savedMeta.hunger ?? 20,
      });
      if (savedMeta.hotbarSlots) {
        useHotbarStore.setState({ slots: savedMeta.hotbarSlots });
      }
    } else {
      useGameStore.getState().resetObjective();
      useGameStore.setState({ health: 20, hunger: 20 });
      useHotbarStore.getState().resetSlots();
    }

    this.renderer.resize(this.canvas.clientWidth, this.canvas.clientHeight);

    // Ambient music
    this.music = new MusicManager();
    this.music.init();
    const settings = useSettingsStore.getState();
    this.music.setVolume(settings.musicVolume);
    this.music.setEnabled(settings.musicEnabled);
    this.music.start();

    // Auto-save
    this.autoSaveTimer = setInterval(() => this.save(), AUTOSAVE_INTERVAL);

    this.running = true;
    this.gameLoop();
  }

  /** Save current world state to IndexedDB. */
  async save(): Promise<void> {
    if (!this.worldId || !this.chunkManager || !this.player) return;

    const meta: WorldMeta = {
      id: this.worldId,
      name: "World", // TODO: store name
      seed: this.seed,
      createdAt: Date.now(),
      lastPlayedAt: Date.now(),
      playerPos: { ...this.player.position },
      playerYaw: this.camera.yaw,
      playerPitch: this.camera.pitch,
      shardsCollected: useGameStore.getState().shardsCollected,
      hotbarSlots: useHotbarStore.getState().slots,
      health: useGameStore.getState().health,
      hunger: useGameStore.getState().hunger,
    };

    await saveWorld(meta, this.chunkManager.getModifiedChunks());
  }

  /** Find the highest solid block at (x, z) and return spawn Y above it. */
  private findSafeSpawnY(x: number, z: number): number {
    if (!this.chunkManager) return SPAWN.y;
    // Scan from top of world downward to find first solid block
    for (let y = 63; y >= 0; y--) {
      if (this.registry.isSolid(this.chunkManager.getBlock(Math.floor(x), y, Math.floor(z)))) {
        return y + 1; // Spawn on top of this block
      }
    }
    return SPAWN.y; // Fallback if no solid found
  }

  /** Respawn after death. Clears inventory. Finds safe spawn if original is void. */
  respawn(): void {
    if (!this.player) return;

    // Check if default spawn is safe (has solid ground below)
    let spawnY = this.findSafeSpawnY(SPAWN.x, SPAWN.z);

    // If default spawn column is completely dug out, search nearby
    if (spawnY <= 0) {
      const searchRadius = 5;
      for (let r = 1; r <= searchRadius; r++) {
        for (const [dx, dz] of [[r,0],[-r,0],[0,r],[0,-r],[r,r],[-r,-r],[r,-r],[-r,r]]) {
          const sy = this.findSafeSpawnY(SPAWN.x + dx, SPAWN.z + dz);
          if (sy > 0) {
            this.player.position = { x: SPAWN.x + dx, y: sy, z: SPAWN.z + dz };
            this.player.velocity = { x: 0, y: 0, z: 0 };
            this.player.onGround = false;
            useHotbarStore.getState().resetSlots();
            useGameStore.getState().respawnPlayer();
            this.hungerExhaustion = 0;
            this.passiveHungerTimer = 0;
            this.regenTimer = 0;
            this.starvationTimer = 0;
            this.fallStartY = 0;
            this.wasFalling = false;
            return;
          }
        }
      }
    }

    this.player.position = { x: SPAWN.x, y: spawnY, z: SPAWN.z };
    this.player.velocity = { x: 0, y: 0, z: 0 };
    this.player.onGround = false;
    useHotbarStore.getState().resetSlots();
    useGameStore.getState().respawnPlayer();
    this.hungerExhaustion = 0;
    this.passiveHungerTimer = 0;
    this.regenTimer = 0;
    this.starvationTimer = 0;
    this.fallStartY = 0;
    this.wasFalling = false;
  }

  private gameLoop = (): void => {
    if (!this.running) return;
    this.animationFrameId = requestAnimationFrame(this.gameLoop);

    try {
      this.gameLoopInner();
    } catch (err) {
      console.error("[Voxelheim] Game loop error:", err);
    }
  };

  private gameLoopInner(): void {
    const dt = this.clock.getDelta();
    if (dt === 0) return;

    this.frameCount++;
    if (this.frameCount % 60 === 0 && this.music) {
      const settings = useSettingsStore.getState();
      this.music.setEnabled(settings.musicEnabled);
      this.music.setVolume(settings.musicVolume);
    }

    const state = useGameStore.getState();
    if (state.isPaused || state.isDead) return;

    // E key: toggle inventory (single press)
    const eDown = this.input.isKeyDown("KeyE");
    if (eDown && !this.eWasDown) {
      const inv = useInventoryStore.getState();
      if (inv.isOpen) {
        inv.close();
        this.canvas.requestPointerLock();
      } else {
        inv.open();
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
      }
    }
    this.eWasDown = eDown;

    // Skip game input while inventory is open
    if (useInventoryStore.getState().isOpen) {
      this.input.getMouseDelta(); // consume
      this.input.getMouseButton(); // consume
      this.camera.applyToThreeCamera(
        this.renderer!.getCamera(),
        this.player!.position,
        this.player!.isCrouching ? 1.2 : 1.6
      );
      this.renderer!.render();
      return;
    }

    // P key camera cycling
    const pDown = this.input.isKeyDown("KeyP");
    if (pDown && !this.pWasDown) this.camera.cycleMode();
    this.pWasDown = pDown;

    // Hotbar selection: keys 1-9
    for (let i = 1; i <= 9; i++) {
      if (this.input.isKeyDown(`Digit${i}`)) {
        useHotbarStore.getState().select(i - 1);
      }
    }

    // Q key: drop held item
    const qDown = this.input.isKeyDown("KeyQ");
    if (qDown && !this.qWasDown) {
      const hotbar = useHotbarStore.getState();
      const droppedId = hotbar.removeSelectedItem();
      if (droppedId !== 0) {
        const fwd = this.camera.getLookDirection();
        this.itemDrops!.spawnDrop(
          droppedId,
          Math.floor(this.player!.position.x + fwd.x),
          Math.floor(this.player!.position.y + 1),
          Math.floor(this.player!.position.z + fwd.z)
        );
      }
    }
    this.qWasDown = qDown;

    // Camera rotation
    if (this.input.isPointerLocked()) {
      const { dx, dy } = this.input.getMouseDelta();
      this.camera.update(dx, dy, MOUSE_SENSITIVITY);
    } else {
      this.input.getMouseDelta();
    }

    // Player physics
    this.player!.update(
      dt,
      this.input,
      this.camera,
      (wx, wy, wz) => this.chunkManager!.getBlock(wx, wy, wz),
      this.registry
    );

    // Update item drops (floating pickups) — run early so pickup always works
    this.itemDrops!.update(dt, this.player!.position);

    // Fall damage (Minecraft-style: damage = fallDistance - 3)
    const isFalling = !this.player!.onGround && this.player!.velocity.y < 0;
    if (isFalling && !this.wasFalling) {
      this.fallStartY = this.player!.position.y;
    }
    if (this.wasFalling && this.player!.onGround) {
      const fallDistance = this.fallStartY - this.player!.position.y;
      if (fallDistance > 3) {
        const damage = Math.floor(fallDistance - 3);
        useGameStore.getState().damagePlayer(damage);
      }
    }
    this.wasFalling = isFalling;

    // Void death
    if (this.player!.position.y < VOID_Y) {
      useGameStore.getState().setHealth(0);
      useGameStore.getState().setDead(true);
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      return;
    }

    // Block interaction (timed breaking)
    const isLeftHeld = this.input.isMouseButtonDown(0);
    const { right: rightClick } = this.input.getMouseButton();
    const lookDir = this.camera.getLookDirection();
    const selectedBlockId = useHotbarStore.getState().getSelectedBlockId();

    // Check mob hit FIRST — mob takes priority over block breaking
    this.playerAttackCooldown = Math.max(0, this.playerAttackCooldown - dt);
    let hitMob: import("@engine/entities/Mob").Mob | null = null;
    const eyePos = {
      x: this.player!.position.x,
      y: this.player!.position.y + 1.6,
      z: this.player!.position.z,
    };
    if (isLeftHeld) {
      hitMob = this.mobManager!.hitTest(eyePos, lookDir, 5);
      if (hitMob) {
        const blockTarget = this.blockInteraction!.getTargetBlock(this.player!.position, lookDir);
        if (blockTarget.hit && blockTarget.blockPos) {
          const mobDist = Math.sqrt(
            (hitMob.position.x - eyePos.x) ** 2 +
            (hitMob.position.y + hitMob.config.height / 2 - eyePos.y) ** 2 +
            (hitMob.position.z - eyePos.z) ** 2
          );
          const blockDist = Math.sqrt(
            (blockTarget.blockPos.x + 0.5 - eyePos.x) ** 2 +
            (blockTarget.blockPos.y + 0.5 - eyePos.y) ** 2 +
            (blockTarget.blockPos.z + 0.5 - eyePos.z) ** 2
          );
          if (blockDist < mobDist) {
            hitMob = null;
          }
        }
      }
    }

    if (hitMob && isLeftHeld && this.playerAttackCooldown <= 0) {
      hitMob.takeDamage(1, { x: this.player!.position.x, z: this.player!.position.z });
      this.playerAttackCooldown = 0.4;
    }

    // Only break blocks if we didn't hit a mob
    const breakState = this.blockInteraction!.update(
      this.player!.position,
      lookDir,
      isLeftHeld && !hitMob,
      rightClick,
      selectedBlockId,
      dt
    );

    // Eating: right-click with food in hand when not aiming at a block
    if (rightClick && selectedBlockId !== 0) {
      const blockDef = BLOCK_DEFINITIONS[selectedBlockId];
      if (blockDef?.special === "food" && blockDef.hungerRestore) {
        const target = this.blockInteraction!.getTargetBlock(this.player!.position, lookDir);
        if (!target.hit) {
          const gs2 = useGameStore.getState();
          if (gs2.hunger < gs2.maxHunger) {
            gs2.setHunger(gs2.hunger + blockDef.hungerRestore);
            useHotbarStore.getState().removeSelectedItem();
          }
        }
      }
    }

    // Update day/night cycle
    this.dayNight!.update(dt);
    const scene = this.renderer!.getScene();
    (scene.background as THREE.Color).copy(this.dayNight!.getSkyColor());
    if (this.ambientLight) this.ambientLight.intensity = this.dayNight!.getAmbientIntensity();
    if (this.directionalLight) {
      this.directionalLight.intensity = this.dayNight!.getDirectionalIntensity();
      const sunPos = this.dayNight!.getSunPosition();
      this.directionalLight.position.set(sunPos.x, sunPos.y, sunPos.z);
    }
    useGameStore.getState().setTimeOfDay(this.dayNight!.timeOfDay);

    // Update mobs
    this.mobManager!.update(
      dt,
      this.chunkManager!,
      this.player!.position,
      this.dayNight!.timeOfDay,
      (amount, fromX, fromZ) => {
        useGameStore.getState().damagePlayer(amount);
        this.player!.applyKnockback(fromX, fromZ, 6);
        // Exhaustion from taking damage
        this.hungerExhaustion += 2;
      }
    );

    // Hunger mechanics (Minecraft-style exhaustion system)
    // Exhaustion accumulates from actions, -1 hunger when exhaustion >= 4
    const gs = useGameStore.getState();
    const isPlayerMoving = this.player!.velocity.x !== 0 || this.player!.velocity.z !== 0;

    // Passive exhaustion: very slow background drain
    this.passiveHungerTimer += dt;
    if (this.passiveHungerTimer >= 90) {
      this.passiveHungerTimer -= 90;
      this.hungerExhaustion += 1;
    }
    // Walking exhaustion: ~0.1 per second
    if (isPlayerMoving && !this.player!.isSprinting) {
      this.hungerExhaustion += 0.01 * dt;
    }
    // Sprinting exhaustion: ~0.6 per second
    if (isPlayerMoving && this.player!.isSprinting) {
      this.hungerExhaustion += 0.1 * dt;
    }
    // Convert exhaustion to hunger drain (4 exhaustion = 1 hunger point)
    if (this.hungerExhaustion >= 4) {
      const drain = Math.floor(this.hungerExhaustion / 4);
      this.hungerExhaustion -= drain * 4;
      useGameStore.getState().setHunger(useGameStore.getState().hunger - drain);
    }

    // Hunger effects
    const currentHunger = useGameStore.getState().hunger;
    const currentHealth = useGameStore.getState().health;
    // Sprint block when hunger <= 6
    if (currentHunger <= 6) {
      this.player!.isSprinting = false;
    }
    // Regen when hunger > 17 (like MC: 18+), costs exhaustion
    if (currentHunger > 17 && currentHealth < gs.maxHealth) {
      this.regenTimer += dt;
      if (this.regenTimer >= 4) {
        this.regenTimer -= 4;
        useGameStore.getState().setHealth(useGameStore.getState().health + 1);
        this.hungerExhaustion += 6; // regen costs hunger
      }
    } else {
      this.regenTimer = 0;
    }
    // Starvation when hunger <= 0
    if (currentHunger <= 0) {
      this.starvationTimer += dt;
      if (this.starvationTimer >= 4) {
        this.starvationTimer -= 4;
        useGameStore.getState().damagePlayer(1);
      }
    } else {
      this.starvationTimer = 0;
    }

    // Check for health death
    if (useGameStore.getState().isDead && !state.isDead) {
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      return;
    }

    // Update break overlay and HUD
    this.breakOverlay!.update(breakState.breakTarget, breakState.breakProgress);
    useGameStore.getState().setBreakProgress(breakState.breakProgress);

    // Update hand state
    let handState: "idle" | "walking" | "breaking" | "placing" = "idle";
    if (breakState.isBreaking) {
      handState = "breaking";
    } else if (rightClick) {
      handState = "placing";
    } else if (
      this.player!.velocity.x !== 0 ||
      this.player!.velocity.z !== 0
    ) {
      handState = "walking";
    }
    this.handRenderer!.setHeldBlock(selectedBlockId);
    this.handRenderer!.update(dt, handState);
    this.handRenderer!.setVisible(this.camera.mode === "first-person");

    // Offhand (left hand)
    const offhandBlockId = useHotbarStore.getState().getOffhandBlockId();
    this.offhandRenderer!.setHeldBlock(offhandBlockId);
    const isWalking = this.player!.velocity.x !== 0 || this.player!.velocity.z !== 0;
    this.offhandRenderer!.update(dt, isWalking);
    if (offhandBlockId === 0) {
      this.offhandRenderer!.setVisible(false);
    } else {
      this.offhandRenderer!.setVisible(this.camera.mode === "first-person");
    }

    // Player model (3rd person)
    const isMoving =
      this.player!.velocity.x !== 0 || this.player!.velocity.z !== 0;
    this.playerModel!.update(
      this.player!.position,
      this.camera.yaw,
      isMoving,
      this.player!.isCrouching,
      dt
    );
    this.playerModel!.setVisible(this.camera.mode !== "first-person");

    // Camera
    const eyeH = this.player!.isCrouching ? 1.2 : 1.6;
    this.camera.applyToThreeCamera(
      this.renderer!.getCamera(),
      this.player!.position,
      eyeH
    );

    this.renderer!.render();
  }

  async dispose(): Promise<void> {
    this.running = false;
    cancelAnimationFrame(this.animationFrameId);
    if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
    await this.save();
    this.music?.dispose();
    this.input.dispose();
    this.handRenderer?.dispose();
    this.offhandRenderer?.dispose();
    this.breakOverlay?.dispose();
    this.itemDrops?.dispose();
    this.mobManager?.dispose();
    this.playerModel?.dispose();
    this.chunkManager?.dispose();
    this.renderer?.dispose();
    useGameStore.getState().resetObjective();
  }
}
