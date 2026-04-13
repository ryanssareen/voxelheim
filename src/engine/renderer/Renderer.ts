import * as THREE from "three";
import { TextureAtlas } from "@engine/renderer/TextureAtlas";
import { CHUNK_SIZE } from "@engine/world/constants";
import type { ChunkMeshData } from "@engine/renderer/ChunkMeshBuilder";

/**
 * Manages the Three.js scene, camera, lighting, materials, and chunk mesh objects.
 */
export class Renderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly atlas: TextureAtlas;
  private material: THREE.MeshLambertMaterial | null = null;
  private readonly meshes = new Map<string, THREE.Mesh>();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 300);
    this.scene.add(this.camera);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(50, 80, 30);
    this.scene.add(directional);

    this.atlas = new TextureAtlas();
  }

  /** Loads the texture atlas and creates the shared material. */
  async init(): Promise<void> {
    const texture = await this.atlas.load();
    this.material = new THREE.MeshLambertMaterial({
      map: texture,
      side: THREE.DoubleSide,
      alphaTest: 0.5,
    });
  }

  /** Returns the TextureAtlas instance for UV lookups. */
  getAtlas(): TextureAtlas {
    return this.atlas;
  }

  /** Returns the Three.js camera for external manipulation. */
  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  /** Returns the scene for adding custom objects. */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /** Enables distance fog for infinite worlds and updates the camera far plane. */
  setupFog(renderDistance: number): void {
    // Fog fully opaque 1 chunk before render distance so chunk edges are never visible
    const farDist = (renderDistance - 1) * CHUNK_SIZE;
    const nearDist = farDist * 0.5;
    const bgColor = this.scene.background as THREE.Color;
    this.scene.fog = new THREE.Fog(bgColor.clone(), nearDist, farDist);
    this.camera.far = (renderDistance + 2) * CHUNK_SIZE;
    this.camera.updateProjectionMatrix();
  }

  /** Updates fog distances when render distance changes. */
  updateFogDistance(renderDistance: number): void {
    if (!this.scene.fog) return;
    const farDist = (renderDistance - 1) * CHUNK_SIZE;
    const nearDist = farDist * 0.5;
    (this.scene.fog as THREE.Fog).near = nearDist;
    (this.scene.fog as THREE.Fog).far = farDist;
    this.camera.far = (renderDistance + 2) * CHUNK_SIZE;
    this.camera.updateProjectionMatrix();
  }

  /** Creates a Three.js Mesh from raw mesh data and adds it to the scene. */
  addChunkMesh(
    key: string,
    meshData: ChunkMeshData,
    offsetX: number,
    offsetY: number,
    offsetZ: number
  ): void {
    this.removeChunkMesh(key);

    if (meshData.vertexCount === 0) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(meshData.positions, 3)
    );
    geometry.setAttribute(
      "normal",
      new THREE.BufferAttribute(meshData.normals, 3)
    );
    geometry.setAttribute("uv", new THREE.BufferAttribute(meshData.uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));

    const mesh = new THREE.Mesh(geometry, this.material!);
    mesh.position.set(offsetX, offsetY, offsetZ);

    this.scene.add(mesh);
    this.meshes.set(key, mesh);
  }

  /** Removes a chunk mesh from the scene and disposes its geometry. */
  removeChunkMesh(key: string): void {
    const mesh = this.meshes.get(key);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    this.meshes.delete(key);
  }

  /** Updates camera position and rotation. */
  updateCamera(
    position: { x: number; y: number; z: number },
    rotation: { x: number; y: number; z: number }
  ): void {
    this.camera.position.set(position.x, position.y, position.z);
    this.camera.rotation.set(rotation.x, rotation.y, rotation.z);
  }

  /** Renders one frame. */
  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Resizes the renderer and updates camera aspect ratio. */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /** Disposes all GPU resources. */
  dispose(): void {
    for (const [key] of this.meshes) {
      this.removeChunkMesh(key);
    }
    this.material?.dispose();
    this.renderer.dispose();
  }
}
