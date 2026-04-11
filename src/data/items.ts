import { BLOCK_ID } from "@data/blocks";

export type ToolType = "pickaxe" | "axe" | "shovel" | "sword";
export type ToolMaterial = "wood" | "stone";

export interface ToolDef {
  itemId: number;
  toolType: ToolType;
  material: ToolMaterial;
  durability: number;
  miningSpeedMultiplier: number;
  attackDamage: number;
  effectiveAgainst: number[];
}

export const TOOL_DEFS: Record<number, ToolDef> = {
  [BLOCK_ID.WOODEN_PICKAXE]: {
    itemId: BLOCK_ID.WOODEN_PICKAXE,
    toolType: "pickaxe",
    material: "wood",
    durability: 59,
    miningSpeedMultiplier: 2,
    attackDamage: 2,
    effectiveAgainst: [BLOCK_ID.STONE, BLOCK_ID.CRYSTAL],
  },
  [BLOCK_ID.WOODEN_AXE]: {
    itemId: BLOCK_ID.WOODEN_AXE,
    toolType: "axe",
    material: "wood",
    durability: 59,
    miningSpeedMultiplier: 2,
    attackDamage: 3,
    effectiveAgainst: [BLOCK_ID.LOG, BLOCK_ID.PLANKS, BLOCK_ID.CRAFTING_TABLE, BLOCK_ID.LEAVES],
  },
  [BLOCK_ID.WOODEN_SHOVEL]: {
    itemId: BLOCK_ID.WOODEN_SHOVEL,
    toolType: "shovel",
    material: "wood",
    durability: 59,
    miningSpeedMultiplier: 2,
    attackDamage: 1,
    effectiveAgainst: [BLOCK_ID.DIRT, BLOCK_ID.GRASS, BLOCK_ID.SAND],
  },
  [BLOCK_ID.WOODEN_SWORD]: {
    itemId: BLOCK_ID.WOODEN_SWORD,
    toolType: "sword",
    material: "wood",
    durability: 59,
    miningSpeedMultiplier: 1,
    attackDamage: 4,
    effectiveAgainst: [],
  },
  [BLOCK_ID.STONE_PICKAXE]: {
    itemId: BLOCK_ID.STONE_PICKAXE,
    toolType: "pickaxe",
    material: "stone",
    durability: 131,
    miningSpeedMultiplier: 4,
    attackDamage: 3,
    effectiveAgainst: [BLOCK_ID.STONE, BLOCK_ID.CRYSTAL],
  },
  [BLOCK_ID.STONE_AXE]: {
    itemId: BLOCK_ID.STONE_AXE,
    toolType: "axe",
    material: "stone",
    durability: 131,
    miningSpeedMultiplier: 4,
    attackDamage: 4,
    effectiveAgainst: [BLOCK_ID.LOG, BLOCK_ID.PLANKS, BLOCK_ID.CRAFTING_TABLE, BLOCK_ID.LEAVES],
  },
  [BLOCK_ID.STONE_SHOVEL]: {
    itemId: BLOCK_ID.STONE_SHOVEL,
    toolType: "shovel",
    material: "stone",
    durability: 131,
    miningSpeedMultiplier: 4,
    attackDamage: 2,
    effectiveAgainst: [BLOCK_ID.DIRT, BLOCK_ID.GRASS, BLOCK_ID.SAND],
  },
  [BLOCK_ID.STONE_SWORD]: {
    itemId: BLOCK_ID.STONE_SWORD,
    toolType: "sword",
    material: "stone",
    durability: 131,
    miningSpeedMultiplier: 1,
    attackDamage: 5,
    effectiveAgainst: [],
  },
};

export function isToolItem(itemId: number): boolean {
  return itemId in TOOL_DEFS;
}

export function getToolDef(itemId: number): ToolDef | null {
  return TOOL_DEFS[itemId] ?? null;
}

export const ITEM_NAMES: Record<number, string> = {
  [BLOCK_ID.AIR]: "Air",
  [BLOCK_ID.GRASS]: "Grass",
  [BLOCK_ID.DIRT]: "Dirt",
  [BLOCK_ID.STONE]: "Stone",
  [BLOCK_ID.SAND]: "Sand",
  [BLOCK_ID.LOG]: "Log",
  [BLOCK_ID.LEAVES]: "Leaves",
  [BLOCK_ID.CRYSTAL]: "Crystal",
  [BLOCK_ID.RAW_PORK]: "Raw Pork",
  [BLOCK_ID.RAW_BEEF]: "Raw Beef",
  [BLOCK_ID.RAW_MUTTON]: "Raw Mutton",
  [BLOCK_ID.PLANKS]: "Planks",
  [BLOCK_ID.CRAFTING_TABLE]: "Crafting Table",
  [BLOCK_ID.STICK]: "Stick",
  [BLOCK_ID.WOODEN_PICKAXE]: "Wooden Pickaxe",
  [BLOCK_ID.WOODEN_AXE]: "Wooden Axe",
  [BLOCK_ID.WOODEN_SHOVEL]: "Wooden Shovel",
  [BLOCK_ID.WOODEN_SWORD]: "Wooden Sword",
  [BLOCK_ID.STONE_PICKAXE]: "Stone Pickaxe",
  [BLOCK_ID.STONE_AXE]: "Stone Axe",
  [BLOCK_ID.STONE_SHOVEL]: "Stone Shovel",
  [BLOCK_ID.STONE_SWORD]: "Stone Sword",
  [BLOCK_ID.FURNACE]: "Furnace",
  [BLOCK_ID.COOKED_PORK]: "Cooked Pork",
  [BLOCK_ID.COOKED_BEEF]: "Cooked Beef",
  [BLOCK_ID.COOKED_MUTTON]: "Cooked Mutton",
};

/** Numeric hex colors for Three.js renderers (hand, offhand, item drops). */
export const BLOCK_HEX_COLORS: Record<number, number> = {
  [BLOCK_ID.GRASS]: 0x5cb85c,
  [BLOCK_ID.DIRT]: 0x8d6e63,
  [BLOCK_ID.STONE]: 0x9e9e9e,
  [BLOCK_ID.SAND]: 0xfdd835,
  [BLOCK_ID.LOG]: 0x5d4037,
  [BLOCK_ID.LEAVES]: 0x2e7d32,
  [BLOCK_ID.CRYSTAL]: 0x00e5ff,
  [BLOCK_ID.RAW_PORK]: 0xf0a0a0,
  [BLOCK_ID.RAW_BEEF]: 0xc45050,
  [BLOCK_ID.RAW_MUTTON]: 0xd4836a,
  [BLOCK_ID.PLANKS]: 0xc8a55a,
  [BLOCK_ID.CRAFTING_TABLE]: 0x9b7653,
  [BLOCK_ID.STICK]: 0xb8945a,
  [BLOCK_ID.WOODEN_PICKAXE]: 0xa0783c,
  [BLOCK_ID.WOODEN_AXE]: 0xa0783c,
  [BLOCK_ID.WOODEN_SHOVEL]: 0xa0783c,
  [BLOCK_ID.WOODEN_SWORD]: 0xa0783c,
  [BLOCK_ID.STONE_PICKAXE]: 0xaaaaaa,
  [BLOCK_ID.STONE_AXE]: 0xaaaaaa,
  [BLOCK_ID.STONE_SHOVEL]: 0xaaaaaa,
  [BLOCK_ID.STONE_SWORD]: 0xaaaaaa,
  [BLOCK_ID.FURNACE]: 0x808080,
  [BLOCK_ID.COOKED_PORK]: 0xc87040,
  [BLOCK_ID.COOKED_BEEF]: 0x8b4020,
  [BLOCK_ID.COOKED_MUTTON]: 0xa06040,
};

export const ITEM_COLORS: Record<number, string> = {
  [BLOCK_ID.GRASS]: "#5cb85c",
  [BLOCK_ID.DIRT]: "#9b7653",
  [BLOCK_ID.STONE]: "#aaaaaa",
  [BLOCK_ID.SAND]: "#ffe082",
  [BLOCK_ID.LOG]: "#5D4037",
  [BLOCK_ID.LEAVES]: "#2E7D32",
  [BLOCK_ID.CRYSTAL]: "#00e5ff",
  [BLOCK_ID.RAW_PORK]: "#f0a0a0",
  [BLOCK_ID.RAW_BEEF]: "#c45050",
  [BLOCK_ID.RAW_MUTTON]: "#d4836a",
  [BLOCK_ID.PLANKS]: "#c8a55a",
  [BLOCK_ID.CRAFTING_TABLE]: "#9b7653",
  [BLOCK_ID.STICK]: "#b8945a",
  [BLOCK_ID.WOODEN_PICKAXE]: "#a0783c",
  [BLOCK_ID.WOODEN_AXE]: "#a0783c",
  [BLOCK_ID.WOODEN_SHOVEL]: "#a0783c",
  [BLOCK_ID.WOODEN_SWORD]: "#a0783c",
  [BLOCK_ID.STONE_PICKAXE]: "#aaaaaa",
  [BLOCK_ID.STONE_AXE]: "#aaaaaa",
  [BLOCK_ID.STONE_SHOVEL]: "#aaaaaa",
  [BLOCK_ID.STONE_SWORD]: "#aaaaaa",
  [BLOCK_ID.FURNACE]: "#808080",
  [BLOCK_ID.COOKED_PORK]: "#c87040",
  [BLOCK_ID.COOKED_BEEF]: "#8b4020",
  [BLOCK_ID.COOKED_MUTTON]: "#a06040",
};
