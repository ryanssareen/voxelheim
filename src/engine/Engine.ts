import * as THREE from "three";
import { Clock } from "@engine/Clock";
import { InputManager } from "@engine/InputManager";
import { Camera } from "@engine/player/Camera";
import { PlayerController } from "@engine/player/PlayerController";
import { PlayerModel } from "@engine/player/PlayerModel";
import { HandRenderer } from "@engine/player/HandRenderer";
import { OffhandRenderer } from "@engine/player/OffhandRenderer";
import { MultiplayerManager } from "@engine/multiplayer/MultiplayerManager";
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
import { BLOCK_ID, BLOCK_DEFINITIONS } from "@data/blocks";
import { getToolDef } from "@data/items";

const MOUSE_SENSITIVITY = 0.002;
const DEFAULT_SPAWN = { x: 32, y: 50, z: 32 };
const FLAT_SPAWN = { x: 32, y: 35, z: 32 };
const INFINITE_SPAWN = { x: 8, y: 80, z: 8 };
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
  private multiplayer: MultiplayerManager | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private directionalLight: THREE.DirectionalLight | null = null;
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
  private stuckTimer = 0;
  private lastDeathPos: { x: number; y: number; z: number } | null = null;
  private fallStartY = 0;
  private wasFalling = false;
  private lavaDamageTimer = 0;
  private frameCount = 0;
  private worldType: WorldType = "island";
  private gameMode: "survival" | "creative" | "hardcore" = "survival";
  private spawn = { ...DEFAULT_SPAWN };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init(worldId?: string, sessionId?: string): Promise<void> {
    this.renderer = new Renderer(this.canvas);
    await this.renderer.init();

    // Load world config
    this.worldId = worldId ?? null;
    let savedMeta: WorldMeta | null = null;

    let worldType: WorldType = "island";
    let gameMode: "survival" | "creative" | "hardcore" = "survival";

    if (worldId) {
      savedMeta = await loadWorldMeta(worldId);
      if (savedMeta) {
        this.seed = savedMeta.seed;
        if (savedMeta.worldType === "flat" || savedMeta.worldType === "infinite") {
          worldType = savedMeta.worldType;
        }
        if (savedMeta.gameMode === "creative" || savedMeta.gameMode === "hardcore") {
          gameMode = savedMeta.gameMode;
        }
        if (savedMeta.hardcoreLocked) {
          useGameStore.getState().setHardcoreLocked(true);
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
        if (config.gameMode === "creative" || config.gameMode === "hardcore") {
          gameMode = config.gameMode;
        }
      } catch {
        /* ignore */
      }
    }

    this.worldType = worldType;
    this.gameMode = gameMode;
    useGameStore.getState().setGameMode(gameMode);

    // Set spawn based on world type (fresh copy each init — never mutate module-level defaults)
    const spawn = worldType === "infinite"
      ? { ...INFINITE_SPAWN }
      : worldType === "flat"
        ? { ...FLAT_SPAWN }
        : { ...DEFAULT_SPAWN };
    this.spawn = spawn;

    // Determine actual player start position BEFORE generating terrain
    // so we generate chunks around where the player will actually be
    const startPos = savedMeta?.playerPos
      ? { x: savedMeta.playerPos.x, y: savedMeta.playerPos.y, z: savedMeta.playerPos.z }
      : { ...spawn };

    this.chunkManager = new ChunkManager(this.renderer, this.seed, worldType);

    if (worldType === "infinite") {
      this.chunkManager.generateSpawnArea(startPos.x, startPos.z);
    } else {
      this.chunkManager.update(0, 0, 0);
    }

    // Load saved chunk modifications
    if (worldId) {
      const savedChunks = await loadWorldChunks(worldId);
      if (savedChunks.size > 0) {
        this.chunkManager.loadModifiedChunks(savedChunks);
      }
    }

    // Always find safe Y on solid ground
    startPos.y = this.findSafeSpawnY(startPos.x, startPos.z);

    this.input.init(this.canvas);
    this.input.onPointerLockLost = () => {
      // Don't pause if dead or inventory is open
      const invS = useInventoryStore.getState();
      if (!useGameStore.getState().isDead && !invS.isOpen && !invS.tableOpen && !invS.furnaceOpen && !invS.creativeOpen) {
        useGameStore.getState().setPaused(true);
      }
    };

    this.player = new PlayerController(startPos.x, startPos.y, startPos.z);
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

    if (sessionId) {
      this.multiplayer = new MultiplayerManager(
        this.renderer.getScene(),
        this.chunkManager,
        this.itemDrops
      );
      const session = await this.multiplayer.connect(sessionId);

      if (worldId) {
        await this.multiplayer.saveWorldState(this.chunkManager.getModifiedChunks());
      } else {
        const sessionChunks = await this.multiplayer.loadWorldState();
        if (sessionChunks.size > 0) {
          this.chunkManager.loadModifiedChunks(sessionChunks);
        }
      }

      this.itemDrops.setNetworkHandlers({
        onDropSpawn: (drop) => {
          this.multiplayer?.broadcastDrop(drop);
        },
        claimDrop: (dropId) =>
          this.multiplayer?.claimDrop(dropId) ?? Promise.resolve(true),
      });

      this.dayNight.timeOfDay =
        ((Date.now() - session.createdAt) / 600_000) % 1;
    }

    this.chunkManager.setBlockChangeListener((change) => {
      if (change.source !== "local") return;
      this.multiplayer?.broadcastBlockChange(
        change.x,
        change.y,
        change.z,
        change.blockId
      );
    });

    // Mob manager
    this.mobManager = new MobManager(this.renderer.getScene());
    this.mobManager.setItemDrops(this.itemDrops);

    // Get light references from scene for day/night updates
    this.renderer.getScene().traverse((obj) => {
      if (obj instanceof THREE.AmbientLight) this.ambientLight = obj;
      if (obj instanceof THREE.DirectionalLight) this.directionalLight = obj;
    });

    // Restore state
    if (savedMeta) {
      useGameStore.setState({
        shardsCollected: savedMeta.shardsCollected,
        health: savedMeta.health ?? 20,
        hunger: savedMeta.hunger ?? 20,
      });
      if (savedMeta.hotbarSlots) {
        // Pad saved slots to current TOTAL_SLOTS length (handles old saves)
        const saved = savedMeta.hotbarSlots as Array<{ blockId: number; count: number; durability?: number }>;
        const padded = Array.from({ length: 36 }, (_, i) =>
          saved[i] ?? { blockId: 0, count: 0 }
        );
        useHotbarStore.setState({ slots: padded });
      }
    } else {
      useGameStore.getState().resetObjective();
      useGameStore.setState({ health: 20, hunger: 20 });
      useHotbarStore.getState().resetSlots();
    }

    this.renderer.resize(this.canvas.clientWidth, this.canvas.clientHeight);

    // Distance fog for infinite worlds
    if (worldType === "infinite") {
      const settings = useSettingsStore.getState();
      this.renderer.setupFog(settings.renderDistance);
    }

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

    const modifiedChunks = this.chunkManager.getModifiedChunks();

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
      worldType: this.worldType,
      gameMode: this.gameMode,
      hardcoreLocked: useGameStore.getState().hardcoreLocked || undefined,
    };

    await saveWorld(meta, modifiedChunks);
    await this.multiplayer?.saveWorldState(modifiedChunks);
  }

  /** Find the highest solid block at (x, z) and return spawn Y above it. */
  private findSafeSpawnY(x: number, z: number): number {
    if (!this.chunkManager) return this.spawn.y;

    // Infinite worlds: use terrain generator directly — faster and works before chunks load
    if (this.worldType === "infinite") {
      const terrainGen = this.chunkManager.getTerrainGenerator();
      const surfaceY = terrainGen.getSurfaceHeight(Math.floor(x), Math.floor(z));
      return surfaceY + 2; // +2 to be safely above surface
    }

    const maxY = 63;
    for (let y = maxY; y >= 0; y--) {
      if (this.registry.isSolid(this.chunkManager.getBlock(Math.floor(x), y, Math.floor(z)))) {
        return y + 1;
      }
    }
    return this.spawn.y;
  }

  /** Drop all inventory items at the player's current position. */
  private dropAllItems(): void {
    if (!this.itemDrops || !this.player) return;
    const slots = useHotbarStore.getState().slots;
    const pos = this.lastDeathPos ?? this.player.position;
    for (const slot of slots) {
      if (slot.count <= 0 || slot.blockId === BLOCK_ID.AIR) continue;
      for (let i = 0; i < slot.count; i++) {
        this.itemDrops.spawnDrop(
          slot.blockId,
          Math.floor(pos.x),
          Math.floor(pos.y),
          Math.floor(pos.z),
          0
        );
      }
    }
  }

  /** Respawn after death. Clears inventory. Finds safe spawn if original is void. */
  respawn(): void {
    if (!this.player) return;

    // Infinite: ensure spawn chunks are loaded before respawning
    if (this.worldType === "infinite" && this.chunkManager) {
      this.chunkManager.generateSpawnArea(this.spawn.x, this.spawn.z);
    }

    // Check if default spawn is safe (has solid ground below)
    const spawnY = this.findSafeSpawnY(this.spawn.x, this.spawn.z);

    // If default spawn column is completely dug out, search nearby
    if (spawnY <= 0) {
      const searchRadius = 5;
      for (let r = 1; r <= searchRadius; r++) {
        for (const [dx, dz] of [[r,0],[-r,0],[0,r],[0,-r],[r,r],[-r,-r],[r,-r],[-r,r]]) {
          const sy = this.findSafeSpawnY(this.spawn.x + dx, this.spawn.z + dz);
          if (sy > 0) {
            this.player.position = { x: this.spawn.x + dx, y: sy, z: this.spawn.z + dz };
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

    this.player.position = { x: this.spawn.x, y: spawnY, z: this.spawn.z };
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
    if (this.frameCount % 60 === 0) {
      const settings = useSettingsStore.getState();
      if (this.music) {
        this.music.setEnabled(settings.musicEnabled);
        this.music.setVolume(settings.musicVolume);
      }
      if (this.worldType === "infinite" && this.renderer) {
        this.renderer.updateFogDistance(settings.renderDistance);
      }
    }

    const state = useGameStore.getState();
    if (state.isDead) return;

    // When paused: still run gravity/physics and rendering, but skip all input
    if (state.isPaused) {
      // Apply gravity so players don't float when they pause mid-air
      if (this.player && this.chunkManager) {
        if (!this.player.onGround) {
          this.player.velocity.y -= 20 * dt; // GRAVITY
          if (this.player.velocity.y < -10) this.player.velocity.y = -10;
        }
        this.player.velocity.x = 0;
        this.player.velocity.z = 0;
        // Y-axis collision only
        const getBlock = (wx: number, wy: number, wz: number) => this.chunkManager!.getBlock(wx, wy, wz);
        const dy = this.player.velocity.y * dt;
        if (dy !== 0) {
          this.player.position.y += dy;
          const h = this.player.height;
          const hw = 0.3;
          const minX = Math.floor(this.player.position.x - hw);
          const maxX = Math.floor(this.player.position.x + hw);
          const minY = Math.floor(this.player.position.y);
          const maxY = Math.floor(this.player.position.y + h);
          const minZ = Math.floor(this.player.position.z - hw);
          const maxZ = Math.floor(this.player.position.z + hw);
          for (let bx = minX; bx <= maxX; bx++) {
            for (let by = minY; by <= maxY; by++) {
              for (let bz = minZ; bz <= maxZ; bz++) {
                if (!this.registry.isSolid(getBlock(bx, by, bz))) continue;
                if (dy < 0) {
                  this.player.position.y = by + 1;
                  this.player.velocity.y = 0;
                  this.player.onGround = true;
                } else {
                  this.player.position.y = by - h;
                  this.player.velocity.y = 0;
                }
              }
            }
          }
          if (dy < 0 && this.player.velocity.y !== 0) {
            this.player.onGround = false;
          }
        }
      }
      // Day/night keeps ticking while paused so all players stay in sync
      if (this.dayNight) {
        this.dayNight.update(dt);
        const scene = this.renderer!.getScene();
        (scene.background as THREE.Color).copy(this.dayNight.getSkyColor());
        if (scene.fog) {
          (scene.fog as THREE.Fog).color.copy(this.dayNight.getSkyColor());
        }
        if (this.ambientLight) this.ambientLight.intensity = this.dayNight.getAmbientIntensity();
        if (this.directionalLight) {
          this.directionalLight.intensity = this.dayNight.getDirectionalIntensity();
          const sunPos = this.dayNight.getSunPosition();
          this.directionalLight.position.set(sunPos.x, sunPos.y, sunPos.z);
        }
        useGameStore.getState().setTimeOfDay(this.dayNight.timeOfDay);
      }
      this.camera.applyToThreeCamera(
        this.renderer!.getCamera(),
        this.player!.position,
        this.player!.isCrouching ? 1.2 : 1.6
      );
      this.renderer!.render();
      return;
    }

    // Infinite world: stream chunks around player each frame
    if (this.worldType === "infinite" && this.player && this.chunkManager) {
      this.chunkManager.update(this.player.position.x, this.player.position.y, this.player.position.z);
      this.chunkManager.processGenerationQueue();
      this.chunkManager.processMeshQueue();
    }

    // E key: toggle inventory / close crafting table (single press)
    const eDown = this.input.isKeyDown("KeyE");
    if (eDown && !this.eWasDown) {
      const inv = useInventoryStore.getState();
      if (inv.furnaceOpen) {
        inv.closeFurnace();
        this.canvas.requestPointerLock();
      } else if (inv.tableOpen) {
        inv.closeTable();
        this.canvas.requestPointerLock();
      } else if (inv.creativeOpen) {
        inv.closeCreative();
        this.canvas.requestPointerLock();
      } else if (inv.isOpen) {
        inv.close();
        this.canvas.requestPointerLock();
      } else {
        // Creative mode: open creative inventory instead of survival inventory
        if (this.gameMode === "creative") {
          inv.openCreative();
        } else {
          inv.open();
        }
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
      }
    }
    this.eWasDown = eDown;

    // Skip game input while inventory or crafting table is open
    const invState = useInventoryStore.getState();
    if (invState.isOpen || invState.tableOpen || invState.furnaceOpen || invState.creativeOpen) {
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
    const creative = this.gameMode === "creative";
    this.player!.update(
      dt,
      this.input,
      this.camera,
      (wx, wy, wz) => this.chunkManager!.getBlock(wx, wy, wz),
      this.registry,
      creative
    );

    // Note: stuck-in-terrain recovery was removed. The collision system
    // (moveAxis + resolveOverlap without upward push) handles all cases.
    // Void death at Y < -10 catches truly stuck players.

    // Update item drops (floating pickups) — run early so pickup always works
    this.itemDrops!.update(dt, this.player!.position);

    // Fall damage (Minecraft-style: damage = fallDistance - 3) — skip in creative
    const isFalling = !this.player!.onGround && this.player!.velocity.y < 0;
    if (!creative) {
      if (isFalling && !this.wasFalling) {
        this.fallStartY = this.player!.position.y;
      }
      if (this.wasFalling && this.player!.onGround) {
        const fallDistance = this.fallStartY - this.player!.position.y;
        if (fallDistance > 3) {
          const damage = Math.floor(fallDistance - 3);
          useGameStore.getState().damagePlayer(damage, "fall");
        }
      }
    } else {
      // Reset fall tracking when flying to avoid ghost fall damage on landing
      if (this.player!.isFlying) {
        this.fallStartY = this.player!.position.y;
      }
    }
    this.wasFalling = isFalling;

    // Lava damage — skip in creative
    if (!creative && this.chunkManager) {
      const px = Math.floor(this.player!.position.x);
      const py = Math.floor(this.player!.position.y);
      const pz = Math.floor(this.player!.position.z);
      const feetBlock = this.chunkManager.getBlock(px, py, pz);
      if (feetBlock === BLOCK_ID.LAVA) {
        this.lavaDamageTimer -= dt;
        if (this.lavaDamageTimer <= 0) {
          useGameStore.getState().damagePlayer(2, "void");
          this.lavaDamageTimer = 0.5;
        }
      } else {
        this.lavaDamageTimer = 0;
      }
    }

    // Void recovery (flat/infinite/creative) or void death (island survival)
    if (this.player!.position.y < VOID_Y) {
      if (creative || this.worldType === "flat" || this.worldType === "infinite") {
        // Recover: teleport to surface at same X/Z, keep items
        const safeY = this.findSafeSpawnY(this.player!.position.x, this.player!.position.z);
        this.player!.position.y = safeY;
        this.player!.velocity = { x: 0, y: 0, z: 0 };
        this.player!.onGround = false;
        this.fallStartY = 0;
        this.wasFalling = false;
      } else {
        useGameStore.getState().killPlayer("void");
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
        return;
      }
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
      const toolDef = getToolDef(selectedBlockId);
      const damage = toolDef ? toolDef.attackDamage : 1;
      hitMob.takeDamage(damage, { x: this.player!.position.x, z: this.player!.position.z });
      this.playerAttackCooldown = 0.4;
      if (toolDef) {
        useHotbarStore.getState().damageSelectedTool();
      }
    }

    // Only break blocks if we didn't hit a mob
    const breakState = this.blockInteraction!.update(
      this.player!.position,
      lookDir,
      isLeftHeld && !hitMob,
      rightClick,
      selectedBlockId,
      dt,
      creative
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
    if (scene.fog) {
      (scene.fog as THREE.Fog).color.copy(this.dayNight!.getSkyColor());
    }
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
      (amount, fromX, fromZ, mobType) => {
        const cause = (mobType === "zombie" || mobType === "skeleton" || mobType === "creeper") ? mobType : undefined;
        useGameStore.getState().damagePlayer(amount, cause);
        this.player!.applyKnockback(fromX, fromZ, 6);
        // Exhaustion from taking damage (mild)
        this.hungerExhaustion += 1;
      },
      creative
    );

    // Hunger mechanics — skip entirely in creative (no hunger drain, no starvation)
    if (creative) {
      this.hungerExhaustion = 0;
      this.passiveHungerTimer = 0;
      this.regenTimer = 0;
      this.starvationTimer = 0;
    }
    // Exhaustion accumulates from actions, -1 hunger when exhaustion >= 4
    const gs = useGameStore.getState();
    const isPlayerMoving = this.player!.velocity.x !== 0 || this.player!.velocity.z !== 0;

    if (!creative) {
      // Passive exhaustion: very slow background drain (every 5 minutes)
      this.passiveHungerTimer += dt;
      if (this.passiveHungerTimer >= 300) {
        this.passiveHungerTimer -= 300;
        this.hungerExhaustion += 1;
      }
      // Walking exhaustion: very gentle
      if (isPlayerMoving && !this.player!.isSprinting) {
        this.hungerExhaustion += 0.002 * dt;
      }
      // Sprinting exhaustion: moderate
      if (isPlayerMoving && this.player!.isSprinting) {
        this.hungerExhaustion += 0.03 * dt;
      }
      // Convert exhaustion to hunger drain (6 exhaustion = 1 hunger point — more generous)
      if (this.hungerExhaustion >= 6) {
        const drain = Math.floor(this.hungerExhaustion / 6);
        this.hungerExhaustion -= drain * 6;
        useGameStore.getState().setHunger(useGameStore.getState().hunger - drain);
      }

      // Hunger effects
      const currentHunger = useGameStore.getState().hunger;
      const currentHealth = useGameStore.getState().health;
      // Sprint block when hunger <= 6
      if (currentHunger <= 6) {
        this.player!.isSprinting = false;
      }
      // Regen when hunger > 14 (more generous than MC's 18+), costs less exhaustion
      if (currentHunger > 14 && currentHealth < gs.maxHealth) {
        this.regenTimer += dt;
        if (this.regenTimer >= 2.5) {
          this.regenTimer -= 2.5;
          useGameStore.getState().setHealth(useGameStore.getState().health + 1);
          this.hungerExhaustion += 3; // regen costs less hunger
        }
      } else {
        this.regenTimer = 0;
      }
      // Starvation when hunger <= 0 (slower — every 6 seconds)
      if (currentHunger <= 0) {
        this.starvationTimer += dt;
        if (this.starvationTimer >= 6) {
          this.starvationTimer -= 6;
          useGameStore.getState().damagePlayer(1, "starvation");
        }
      } else {
        this.starvationTimer = 0;
      }
    }

    // Check for health death — drop items at death position
    if (useGameStore.getState().isDead && !state.isDead) {
      this.lastDeathPos = { ...this.player!.position };
      this.dropAllItems();
      // Hardcore: save immediately to persist locked state
      if (this.gameMode === "hardcore") {
        void this.save();
      }
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

    this.multiplayer?.update(dt, {
      x: this.player!.position.x,
      y: this.player!.position.y,
      z: this.player!.position.z,
      yaw: this.camera.yaw,
      pitch: this.camera.pitch,
      isCrouching: this.player!.isCrouching,
    });

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
    this.chunkManager?.setBlockChangeListener(null);
    await this.multiplayer?.disconnect();
    this.multiplayer = null;
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
