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
  special: "none" | "crystal_shard" | "food" | "tool";
  /** Seconds to break this block. 0 = instant / unbreakable. */
  breakTime: number;
  /** Block ID dropped when broken. */
  dropId: number;
  /** Tool type required for the block to drop an item. If unset, drops with any tool or fist. */
  requiresTool?: "pickaxe" | "axe" | "shovel" | "sword";
  /** Hunger points restored when eaten (food items only). */
  hungerRestore?: number;
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
  RAW_PORK: 8,
  RAW_BEEF: 9,
  RAW_MUTTON: 10,
  PLANKS: 11,
  CRAFTING_TABLE: 12,
  STICK: 13,
  WOODEN_PICKAXE: 14,
  WOODEN_AXE: 15,
  WOODEN_SHOVEL: 16,
  WOODEN_SWORD: 17,
  STONE_PICKAXE: 18,
  STONE_AXE: 19,
  STONE_SHOVEL: 20,
  STONE_SWORD: 21,
  FURNACE: 22,
  COOKED_PORK: 23,
  COOKED_BEEF: 24,
  COOKED_MUTTON: 25,
  IRON_ORE: 26,
  IRON_INGOT: 27,
  DIAMOND_ORE: 28,
  DIAMOND: 29,
  IRON_PICKAXE: 30,
  IRON_AXE: 31,
  IRON_SHOVEL: 32,
  IRON_SWORD: 33,
  DIAMOND_PICKAXE: 34,
  DIAMOND_AXE: 35,
  DIAMOND_SHOVEL: 36,
  DIAMOND_SWORD: 37,
  LAVA: 38,
  WATER: 39,
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
    special: "none", breakTime: 1.5, dropId: BLOCK_ID.STONE, requiresTool: "pickaxe",
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
    special: "none", breakTime: 0.2, dropId: BLOCK_ID.LEAVES, requiresTool: "axe",
  },
  {
    id: BLOCK_ID.CRYSTAL,
    name: "Crystal",
    solid: true, transparent: true, breakable: true,
    textures: { top: "crystal_shard", bottom: "crystal_shard", side: "crystal_shard" },
    special: "crystal_shard", breakTime: 3.0, dropId: BLOCK_ID.CRYSTAL, requiresTool: "pickaxe",
  },
  {
    id: BLOCK_ID.RAW_PORK,
    name: "Raw Pork",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "food", breakTime: 0, dropId: BLOCK_ID.RAW_PORK,
    hungerRestore: 3,
  },
  {
    id: BLOCK_ID.RAW_BEEF,
    name: "Raw Beef",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "food", breakTime: 0, dropId: BLOCK_ID.RAW_BEEF,
    hungerRestore: 3,
  },
  {
    id: BLOCK_ID.RAW_MUTTON,
    name: "Raw Mutton",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "food", breakTime: 0, dropId: BLOCK_ID.RAW_MUTTON,
    hungerRestore: 2,
  },
  {
    id: BLOCK_ID.PLANKS,
    name: "Planks",
    solid: true, transparent: false, breakable: true,
    textures: { top: "planks", bottom: "planks", side: "planks" },
    special: "none", breakTime: 1.0, dropId: BLOCK_ID.PLANKS,
  },
  {
    id: BLOCK_ID.CRAFTING_TABLE,
    name: "Crafting Table",
    solid: true, transparent: false, breakable: true,
    textures: { top: "crafting_table_top", bottom: "planks", side: "crafting_table_side" },
    special: "none", breakTime: 1.2, dropId: BLOCK_ID.CRAFTING_TABLE,
  },
  {
    id: BLOCK_ID.STICK,
    name: "Stick",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "none", breakTime: 0, dropId: BLOCK_ID.STICK,
  },
  {
    id: BLOCK_ID.WOODEN_PICKAXE,
    name: "Wooden Pickaxe",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "tool", breakTime: 0, dropId: BLOCK_ID.WOODEN_PICKAXE,
  },
  {
    id: BLOCK_ID.WOODEN_AXE,
    name: "Wooden Axe",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "tool", breakTime: 0, dropId: BLOCK_ID.WOODEN_AXE,
  },
  {
    id: BLOCK_ID.WOODEN_SHOVEL,
    name: "Wooden Shovel",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "tool", breakTime: 0, dropId: BLOCK_ID.WOODEN_SHOVEL,
  },
  {
    id: BLOCK_ID.WOODEN_SWORD,
    name: "Wooden Sword",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "tool", breakTime: 0, dropId: BLOCK_ID.WOODEN_SWORD,
  },
  {
    id: BLOCK_ID.STONE_PICKAXE,
    name: "Stone Pickaxe",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "tool", breakTime: 0, dropId: BLOCK_ID.STONE_PICKAXE,
  },
  {
    id: BLOCK_ID.STONE_AXE,
    name: "Stone Axe",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "tool", breakTime: 0, dropId: BLOCK_ID.STONE_AXE,
  },
  {
    id: BLOCK_ID.STONE_SHOVEL,
    name: "Stone Shovel",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "tool", breakTime: 0, dropId: BLOCK_ID.STONE_SHOVEL,
  },
  {
    id: BLOCK_ID.STONE_SWORD,
    name: "Stone Sword",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "tool", breakTime: 0, dropId: BLOCK_ID.STONE_SWORD,
  },
  {
    id: BLOCK_ID.FURNACE,
    name: "Furnace",
    solid: true, transparent: false, breakable: true,
    textures: { top: "furnace_top", bottom: "stone", side: "furnace_side" },
    special: "none", breakTime: 1.5, dropId: BLOCK_ID.FURNACE, requiresTool: "pickaxe",
  },
  {
    id: BLOCK_ID.COOKED_PORK,
    name: "Cooked Pork",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "food", breakTime: 0, dropId: BLOCK_ID.COOKED_PORK,
    hungerRestore: 8,
  },
  {
    id: BLOCK_ID.COOKED_BEEF,
    name: "Cooked Beef",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "food", breakTime: 0, dropId: BLOCK_ID.COOKED_BEEF,
    hungerRestore: 8,
  },
  {
    id: BLOCK_ID.COOKED_MUTTON,
    name: "Cooked Mutton",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "food", breakTime: 0, dropId: BLOCK_ID.COOKED_MUTTON,
    hungerRestore: 6,
  },
  {
    id: BLOCK_ID.IRON_ORE,
    name: "Iron Ore",
    solid: true, transparent: false, breakable: true,
    textures: { top: "iron_ore", bottom: "iron_ore", side: "iron_ore" },
    special: "none", breakTime: 3.0, dropId: BLOCK_ID.IRON_ORE, requiresTool: "pickaxe",
  },
  {
    id: BLOCK_ID.IRON_INGOT,
    name: "Iron Ingot",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "none", breakTime: 0, dropId: BLOCK_ID.IRON_INGOT,
  },
  {
    id: BLOCK_ID.DIAMOND_ORE,
    name: "Diamond Ore",
    solid: true, transparent: false, breakable: true,
    textures: { top: "diamond_ore", bottom: "diamond_ore", side: "diamond_ore" },
    special: "none", breakTime: 4.0, dropId: BLOCK_ID.DIAMOND_ORE, requiresTool: "pickaxe",
  },
  {
    id: BLOCK_ID.DIAMOND,
    name: "Diamond",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "none", breakTime: 0, dropId: BLOCK_ID.DIAMOND,
  },
  {
    id: BLOCK_ID.IRON_PICKAXE,
    name: "Iron Pickaxe",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "tool", breakTime: 0, dropId: BLOCK_ID.IRON_PICKAXE,
  },
  {
    id: BLOCK_ID.IRON_AXE,
    name: "Iron Axe",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "tool", breakTime: 0, dropId: BLOCK_ID.IRON_AXE,
  },
  {
    id: BLOCK_ID.IRON_SHOVEL,
    name: "Iron Shovel",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "tool", breakTime: 0, dropId: BLOCK_ID.IRON_SHOVEL,
  },
  {
    id: BLOCK_ID.IRON_SWORD,
    name: "Iron Sword",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "tool", breakTime: 0, dropId: BLOCK_ID.IRON_SWORD,
  },
  {
    id: BLOCK_ID.DIAMOND_PICKAXE,
    name: "Diamond Pickaxe",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "tool", breakTime: 0, dropId: BLOCK_ID.DIAMOND_PICKAXE,
  },
  {
    id: BLOCK_ID.DIAMOND_AXE,
    name: "Diamond Axe",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "tool", breakTime: 0, dropId: BLOCK_ID.DIAMOND_AXE,
  },
  {
    id: BLOCK_ID.DIAMOND_SHOVEL,
    name: "Diamond Shovel",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "tool", breakTime: 0, dropId: BLOCK_ID.DIAMOND_SHOVEL,
  },
  {
    id: BLOCK_ID.DIAMOND_SWORD,
    name: "Diamond Sword",
    solid: false, transparent: true, breakable: false,
    textures: { top: "", bottom: "", side: "" },
    special: "tool", breakTime: 0, dropId: BLOCK_ID.DIAMOND_SWORD,
  },
  {
    id: BLOCK_ID.LAVA,
    name: "Lava",
    solid: false, transparent: true, breakable: false,
    textures: { top: "lava", bottom: "lava", side: "lava" },
    special: "none", breakTime: 0, dropId: 0,
  },
  {
    id: BLOCK_ID.WATER,
    name: "Water",
    solid: false, transparent: true, breakable: false,
    textures: { top: "water", bottom: "water", side: "water" },
    special: "none", breakTime: 0, dropId: 0,
  },
];
