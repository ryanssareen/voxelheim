import { Clock } from "@engine/Clock";
import { InputManager } from "@engine/InputManager";
import { Camera } from "@engine/player/Camera";
import { PlayerController } from "@engine/player/PlayerController";
import { PlayerModel } from "@engine/player/PlayerModel";
import { HandRenderer } from "@engine/player/HandRenderer";
import { BlockInteraction } from "@engine/player/BlockInteraction";
import { BlockBreakOverlay } from "@engine/renderer/BlockBreakOverlay";
import { Renderer } from "@engine/renderer/Renderer";
import { ChunkManager } from "@engine/world/ChunkManager";
import { ItemDropManager } from "@engine/world/ItemDropManager";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { useHotbarStore } from "@store/useHotbarStore";
import { useGameStore } from "@store/useGameStore";
import { useInventoryStore } from "@store/useInventoryStore";
import {
  saveWorld,
  loadWorldMeta,
  loadWorldChunks,
  type WorldMeta,
} from "@systems/persistence/WorldStorage";

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
  private blockInteraction: BlockInteraction | null = null;
  private breakOverlay: BlockBreakOverlay | null = null;
  private itemDrops: ItemDropManager | null = null;
  private animationFrameId = 0;
  private running = false;
  private pWasDown = false;
  private eWasDown = false;
  private worldId: string | null = null;
  private seed = "voxelheim-mvp";
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init(worldId?: string): Promise<void> {
    this.renderer = new Renderer(this.canvas);
    await this.renderer.init();

    // Load world config
    this.worldId = worldId ?? null;
    let savedMeta: WorldMeta | null = null;

    if (worldId) {
      savedMeta = await loadWorldMeta(worldId);
      if (savedMeta) {
        this.seed = savedMeta.seed;
      }
    } else {
      // Read seed from sessionStorage (from create world page)
      try {
        const config = JSON.parse(
          sessionStorage.getItem("voxelheim-world-config") || "{}"
        );
        if (config.seed) this.seed = config.seed;
      } catch {
        /* ignore */
      }
    }

    this.chunkManager = new ChunkManager(this.renderer, this.seed);
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
    this.blockInteraction = new BlockInteraction(this.chunkManager, this.registry, this.itemDrops);

    // Player model (3rd person)
    this.playerModel = new PlayerModel();
    this.renderer.getScene().add(this.playerModel.group);

    // Hand (1st person)
    this.handRenderer = new HandRenderer(this.renderer.getCamera());

    // Break overlay
    this.breakOverlay = new BlockBreakOverlay();
    this.renderer.getScene().add(this.breakOverlay.getMesh());

    // Restore state
    if (savedMeta) {
      useGameStore.setState({ shardsCollected: savedMeta.shardsCollected });
      // Restore hotbar
      if (savedMeta.hotbarSlots) {
        useHotbarStore.setState({ slots: savedMeta.hotbarSlots });
      }
    } else {
      useGameStore.getState().resetObjective();
      useHotbarStore.getState().resetSlots();
    }

    this.renderer.resize(this.canvas.clientWidth, this.canvas.clientHeight);

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
            useGameStore.getState().setDead(false);
            return;
          }
        }
      }
    }

    this.player.position = { x: SPAWN.x, y: spawnY, z: SPAWN.z };
    this.player.velocity = { x: 0, y: 0, z: 0 };
    this.player.onGround = false;
    useHotbarStore.getState().resetSlots();
    useGameStore.getState().setDead(false);
  }

  private gameLoop = (): void => {
    if (!this.running) return;
    this.animationFrameId = requestAnimationFrame(this.gameLoop);

    const dt = this.clock.getDelta();
    if (dt === 0) return;

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

    // Hotbar selection: keys 1-8
    for (let i = 1; i <= 8; i++) {
      if (this.input.isKeyDown(`Digit${i}`)) {
        useHotbarStore.getState().select(i - 1);
      }
    }

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

    // Void death
    if (this.player!.position.y < VOID_Y) {
      useGameStore.getState().setDead(true);
      // Exit pointer lock so user can click death screen buttons
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

    const breakState = this.blockInteraction!.update(
      this.player!.position,
      lookDir,
      isLeftHeld,
      rightClick,
      selectedBlockId,
      dt
    );

    // Update item drops (floating pickups)
    this.itemDrops!.update(dt, this.player!.position);

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
    this.handRenderer!.update(dt, handState);
    this.handRenderer!.setVisible(this.camera.mode === "first-person");

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
  };

  async dispose(): Promise<void> {
    this.running = false;
    cancelAnimationFrame(this.animationFrameId);
    if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
    await this.save();
    this.input.dispose();
    this.handRenderer?.dispose();
    this.breakOverlay?.dispose();
    this.itemDrops?.dispose();
    this.playerModel?.dispose();
    this.chunkManager?.dispose();
    this.renderer?.dispose();
    useGameStore.getState().resetObjective();
  }
}
