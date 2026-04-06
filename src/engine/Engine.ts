import { Clock } from "@engine/Clock";
import { InputManager } from "@engine/InputManager";
import { Camera } from "@engine/player/Camera";
import { PlayerController } from "@engine/player/PlayerController";
import { BlockInteraction } from "@engine/player/BlockInteraction";
import { Renderer } from "@engine/renderer/Renderer";
import { ChunkManager } from "@engine/world/ChunkManager";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import { useHotbarStore } from "@store/useHotbarStore";
import { useGameStore } from "@store/useGameStore";

const MOUSE_SENSITIVITY = 0.002;
const SEED = "voxelheim-mvp";

/**
 * Main game engine. Orchestrates all subsystems and runs the game loop.
 */
export class Engine {
  private readonly canvas: HTMLCanvasElement;
  private readonly clock = new Clock();
  private readonly input = new InputManager();
  private readonly camera = new Camera();
  private readonly registry = BlockRegistry.getInstance();
  public renderer: Renderer | null = null;
  private chunkManager: ChunkManager | null = null;
  private player: PlayerController | null = null;
  private blockInteraction: BlockInteraction | null = null;
  private animationFrameId = 0;
  private running = false;
  private pWasDown = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /** Initializes all subsystems and starts the game loop. */
  async init(): Promise<void> {
    this.renderer = new Renderer(this.canvas);
    await this.renderer.init();

    this.chunkManager = new ChunkManager(this.renderer, SEED);

    // Generate world synchronously before starting the game loop
    this.chunkManager.update(0, 0, 0);

    this.input.init(this.canvas);
    this.input.onPointerLockLost = () => {
      useGameStore.getState().setPaused(true);
    };
    this.player = new PlayerController(32, 45, 32);
    this.blockInteraction = new BlockInteraction(this.chunkManager, this.registry);

    // Reset game state
    useGameStore.getState().resetObjective();

    this.renderer.resize(this.canvas.clientWidth, this.canvas.clientHeight);

    this.running = true;
    this.gameLoop();
  }

  private gameLoop = (): void => {
    if (!this.running) return;
    this.animationFrameId = requestAnimationFrame(this.gameLoop);

    const dt = this.clock.getDelta();
    if (dt === 0) return; // First frame

    if (useGameStore.getState().isPaused) return;

    // Update chunk loading first (always, even before chunks are ready)
    this.chunkManager!.update(
      this.player!.position.x,
      this.player!.position.y,
      this.player!.position.z
    );

    // Freeze player until chunks are loaded to prevent falling through void
    if (!this.chunkManager!.isFullyLoaded()) {
      this.camera.applyToThreeCamera(
        this.renderer!.getCamera(),
        this.player!.position
      );
      this.renderer!.render();
      return;
    }

    // P key camera perspective cycling (single-press)
    const pDown = this.input.isKeyDown("KeyP");
    if (pDown && !this.pWasDown) {
      this.camera.cycleMode();
    }
    this.pWasDown = pDown;

    // Hotbar selection: number keys 1-8
    for (let i = 1; i <= 8; i++) {
      if (this.input.isKeyDown(`Digit${i}`)) {
        useHotbarStore.getState().select(i - 1);
      }
    }

    // Camera rotation from mouse
    if (this.input.isPointerLocked()) {
      const { dx, dy } = this.input.getMouseDelta();
      this.camera.update(dx, dy, MOUSE_SENSITIVITY);
    } else {
      this.input.getMouseDelta(); // Consume to reset accumulator
    }

    // Player movement + physics
    this.player!.update(
      dt,
      this.input,
      this.camera,
      (wx, wy, wz) => this.chunkManager!.getBlock(wx, wy, wz),
      this.registry
    );

    // Block interaction
    const { left, right } = this.input.getMouseButton();
    const lookDir = this.camera.getLookDirection();
    this.blockInteraction!.update(
      this.player!.position,
      lookDir,
      left,
      right,
      useHotbarStore.getState().getSelectedBlockId()
    );

    // Apply camera to renderer
    const eyeH = this.player!.isCrouching ? 1.2 : 1.6;
    this.camera.applyToThreeCamera(
      this.renderer!.getCamera(),
      this.player!.position,
      eyeH
    );

    // Render
    this.renderer!.render();
  };

  /** Stops the game loop and cleans up all subsystems. */
  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.animationFrameId);
    this.input.dispose();
    this.chunkManager?.dispose();
    this.renderer?.dispose();
    useGameStore.getState().resetObjective();
  }
}
