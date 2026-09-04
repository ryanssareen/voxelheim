import * as THREE from "three";
import { ATLAS_UVS, ATLAS_HASH, ITEM_ATLAS_UVS, ITEM_ATLAS_HASH } from "@data/atlasUVs";
import { BlockRegistry } from "@engine/world/BlockRegistry";
import type { UVRect } from "@engine/renderer/ChunkMeshBuilder";

/**
 * Manages the block texture atlas: loading, UV lookups, and block face resolution.
 */
export class TextureAtlas {
  private texture: THREE.Texture | null = null;
  private itemTexture: THREE.Texture | null = null;
  private readonly registry = BlockRegistry.getInstance();

  /** Loads one texture sheet with pixel-art filtering. */
  private loadTexture(url: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (tex) => {
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.flipY = false; // Atlas UV coords assume top-left origin
          tex.needsUpdate = true;
          resolve(tex);
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Loads the block atlas and the item sheet. A missing/failed item sheet
   * degrades to null rather than rejecting the whole load, so callers that
   * only need block textures (chunk rendering) are unaffected.
   */
  async load(): Promise<THREE.Texture> {
    const [block, items] = await Promise.all([
      this.loadTexture(`/textures/atlas.png?v=${ATLAS_HASH}`),
      this.loadTexture(`/textures/items.png?v=${ITEM_ATLAS_HASH}`).catch(() => null),
    ]);
    this.useTextures(block, items);
    return block;
  }

  /** Installs already-resolved textures. Used by the real load path and by tests. */
  useTextures(block: THREE.Texture, items: THREE.Texture | null): void {
    this.texture = block;
    this.itemTexture = items;
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

  /** Returns the UV rectangle for a non-block item icon, or null if the id has no icon tile. */
  getItemUVs(blockId: number): UVRect | null {
    return ITEM_ATLAS_UVS[blockId] ?? null;
  }

  /** Returns the loaded block texture, or null if not yet loaded. */
  getTexture(): THREE.Texture | null {
    return this.texture;
  }

  /** Returns the loaded item sheet texture, or null if not yet loaded / failed to load. */
  getItemTexture(): THREE.Texture | null {
    return this.itemTexture;
  }
}
