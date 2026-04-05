import { BLOCK_DEFINITIONS, type BlockDefinition } from "@data/blocks";

/**
 * Singleton registry providing fast lookups for block definitions.
 *
 * Usage:
 * ```ts
 * const registry = BlockRegistry.getInstance();
 * registry.isSolid(BLOCK_ID.STONE); // true
 * ```
 */
export class BlockRegistry {
  private static instance: BlockRegistry | null = null;
  private readonly blocks: ReadonlyMap<number, BlockDefinition>;

  private constructor() {
    this.blocks = new Map(BLOCK_DEFINITIONS.map((b) => [b.id, b]));
  }

  /** Returns the singleton BlockRegistry instance. */
  static getInstance(): BlockRegistry {
    if (!BlockRegistry.instance) {
      BlockRegistry.instance = new BlockRegistry();
    }
    return BlockRegistry.instance;
  }

  /** Returns the full block definition for the given ID, or `undefined` if not found. */
  getBlock(id: number): BlockDefinition | undefined {
    return this.blocks.get(id);
  }

  /** Returns `true` if the block is solid. Returns `false` for unknown IDs. */
  isSolid(id: number): boolean {
    return this.blocks.get(id)?.solid ?? false;
  }

  /** Returns `true` if the block is transparent. Returns `false` for unknown IDs. */
  isTransparent(id: number): boolean {
    return this.blocks.get(id)?.transparent ?? false;
  }

  /** Returns `true` if the block is breakable. Returns `false` for unknown IDs. */
  isBreakable(id: number): boolean {
    return this.blocks.get(id)?.breakable ?? false;
  }

  /** Returns `true` if the block has the given special type. Returns `false` for unknown IDs. */
  isSpecial(id: number, type: BlockDefinition["special"]): boolean {
    return this.blocks.get(id)?.special === type;
  }
}
