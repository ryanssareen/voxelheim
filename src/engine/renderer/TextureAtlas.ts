import * as THREE from "three";
import { ATLAS_UVS } from "@data/atlasUVs";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import type { UVRect } from "@engine/renderer/ChunkMeshBuilder";

/**
 * Manages the block texture atlas: loading, UV lookups, and block face resolution.
 */
export class TextureAtlas {
  private texture: THREE.Texture | null = null;
  private readonly registry = BlockRegistry.getInstance();

  /** Loads the atlas texture with pixel-art filtering. */
  async load(): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        "/textures/atlas.png",
        (tex) => {
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.needsUpdate = true;
          this.texture = tex;
          resolve(tex);
        },
        undefined,
        reject
      );
    });
  }

  /** Returns the UV rectangle for a texture name. */
  getUVs(textureName: string): UVRect {
    const uv = ATLAS_UVS[textureName];
    if (!uv) return { u0: 0, v0: 0, u1: 1, v1: 1 };
    return uv;
  }

  /** Returns the UV rectangle for a specific block face. */
  getBlockFaceUVs(
    blockId: number,
    face: "top" | "bottom" | "side"
  ): UVRect {
    const def = this.registry.getBlock(blockId);
    if (!def) return { u0: 0, v0: 0, u1: 1, v1: 1 };
    return this.getUVs(def.textures[face]);
  }

  /** Returns the loaded texture, or null if not yet loaded. */
  getTexture(): THREE.Texture | null {
    return this.texture;
  }
}
