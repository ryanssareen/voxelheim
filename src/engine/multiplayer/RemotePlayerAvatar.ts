import * as THREE from "three";
import { PlayerModel } from "@engine/player/PlayerModel";
import type { MultiplayerPlayerState } from "@lib/multiplayer/types";

const POSITION_LERP = 12;
const ROTATION_LERP = 14;

function hashColor(input: string, offset: number): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index) + offset) >>> 0;
  }

  const hue = hash % 360;
  const color = new THREE.Color();
  color.setHSL(hue / 360, 0.45, 0.5);
  return color.getHex();
}

function createNameTag(name: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d");

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(0, 0, 0, 0.65)";
    context.fillRect(8, 10, canvas.width - 16, canvas.height - 20);
    context.strokeStyle = "rgba(255, 255, 255, 0.14)";
    context.lineWidth = 2;
    context.strokeRect(8, 10, canvas.width - 16, canvas.height - 20);
    context.fillStyle = "#ffffff";
    context.font = "bold 28px monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(name, canvas.width / 2, canvas.height / 2 + 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.9, 0.72, 1);
  sprite.position.set(0, 2.45, 0);
  return sprite;
}

function lerpAngle(current: number, target: number, factor: number): number {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * factor;
}

export class RemotePlayerAvatar {
  readonly group = new THREE.Group();

  private readonly model: PlayerModel;
  private readonly nameTag: THREE.Sprite;
  private currentPosition = new THREE.Vector3();
  private targetPosition = new THREE.Vector3();
  private currentYaw = 0;
  private targetYaw = 0;
  private state: MultiplayerPlayerState;
  private previousPosition = new THREE.Vector3();

  constructor(initialState: MultiplayerPlayerState) {
    this.state = initialState;
    this.model = new PlayerModel({
      syncArmor: false,
      shirtColor: hashColor(initialState.playerId, 11),
      pantsColor: hashColor(initialState.playerId, 53),
      skinColor: 0xc8a882,
      hairColor: hashColor(initialState.playerId, 101),
      shoeColor: 0x343434,
    });
    this.nameTag = createNameTag(initialState.name);

    this.currentPosition.set(initialState.x, initialState.y, initialState.z);
    this.targetPosition.copy(this.currentPosition);
    this.currentYaw = initialState.yaw;
    this.targetYaw = initialState.yaw;

    this.group.add(this.model.group);
    this.group.add(this.nameTag);
  }

  applyState(next: MultiplayerPlayerState): void {
    this.state = next;
    this.targetPosition.set(next.x, next.y, next.z);
    this.targetYaw = next.yaw;
  }

  update(dt: number): void {
    this.previousPosition.copy(this.currentPosition);
    this.currentPosition.lerp(this.targetPosition, 1 - Math.exp(-POSITION_LERP * dt));
    this.currentYaw = lerpAngle(
      this.currentYaw,
      this.targetYaw,
      1 - Math.exp(-ROTATION_LERP * dt)
    );

    const distanceMoved = this.previousPosition.distanceTo(this.currentPosition);
    this.model.update(
      {
        x: this.currentPosition.x,
        y: this.currentPosition.y,
        z: this.currentPosition.z,
      },
      this.currentYaw,
      distanceMoved > 0.015,
      this.state.isCrouching,
      dt
    );
  }

  dispose(): void {
    this.model.dispose();
    const material = this.nameTag.material;
    if (material instanceof THREE.SpriteMaterial) {
      material.map?.dispose();
      material.dispose();
    }
  }
}
