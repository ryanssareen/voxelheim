/** Texture paths for each face of a block. */
export interface BlockTextures {
  top: string;
  bottom: string;
  side: string;
}

/** Full definition of a block type in the world. */
export interface BlockDefinition {
  /** Unique numeric identifier for this block type. */
  id: number;
  /** Human-readable name. */
  name: string;
  /** Whether the block prevents entity movement. */
  solid: boolean;
  /** Whether the block allows light to pass through. */
  transparent: boolean;
  /** Whether the player can break this block. */
  breakable: boolean;
  /** Texture paths for each face. */
  textures: BlockTextures;
  /** Special behavior tag for gameplay systems. */
  special: "none" | "crystal_shard";
  /** Seconds to break this block. 0 = instant / unbreakable. */
  breakTime: number;
  /** Block ID dropped when broken. */
  dropId: number;
}

/** Canonical block type IDs. */
export const BLOCK_ID = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  LOG: 5,
  LEAVES: 6,
  CRYSTAL: 7,
} as const;

/** All block definitions indexed by their ID. */
export const BLOCK_DEFINITIONS: readonly BlockDefinition[] = [
  {
    id: BLOCK_ID.AIR,
    name: "Air",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "none", breakTime: 0, dropId: 0,
  },
  {
    id: BLOCK_ID.GRASS,
    name: "Grass",
    solid: true, transparent: false, breakable: true,
    textures: { top: "grass_top", bottom: "dirt", side: "grass_side" },
    special: "none", breakTime: 0.6, dropId: BLOCK_ID.DIRT,
  },
  {
    id: BLOCK_ID.DIRT,
    name: "Dirt",
    solid: true, transparent: false, breakable: true,
    textures: { top: "dirt", bottom: "dirt", side: "dirt" },
    special: "none", breakTime: 0.5, dropId: BLOCK_ID.DIRT,
  },
  {
    id: BLOCK_ID.STONE,
    name: "Stone",
    solid: true, transparent: false, breakable: true,
    textures: { top: "stone", bottom: "stone", side: "stone" },
    special: "none", breakTime: 1.5, dropId: BLOCK_ID.STONE,
  },
  {
    id: BLOCK_ID.SAND,
    name: "Sand",
    solid: true, transparent: false, breakable: true,
    textures: { top: "sand", bottom: "sand", side: "sand" },
    special: "none", breakTime: 0.5, dropId: BLOCK_ID.SAND,
  },
  {
    id: BLOCK_ID.LOG,
    name: "Log",
    solid: true, transparent: false, breakable: true,
    textures: { top: "log_top", bottom: "log_top", side: "log_side" },
    special: "none", breakTime: 2.0, dropId: BLOCK_ID.LOG,
  },
  {
    id: BLOCK_ID.LEAVES,
    name: "Leaves",
    solid: true, transparent: true, breakable: true,
    textures: { top: "leaves", bottom: "leaves", side: "leaves" },
    special: "none", breakTime: 0.2, dropId: BLOCK_ID.LEAVES,
  },
  {
    id: BLOCK_ID.CRYSTAL,
    name: "Crystal",
    solid: true, transparent: true, breakable: true,
    textures: { top: "crystal_shard", bottom: "crystal_shard", side: "crystal_shard" },
    special: "crystal_shard", breakTime: 3.0, dropId: BLOCK_ID.CRYSTAL,
  },
];
