import { BLOCK_ID } from "@data/blocks";

export type ToolType = "pickaxe" | "axe" | "shovel" | "sword";
export type ToolMaterial = "wood" | "stone" | "iron" | "diamond";

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
  [BLOCK_ID.IRON_PICKAXE]: {
    itemId: BLOCK_ID.IRON_PICKAXE,
    toolType: "pickaxe",
    material: "iron",
    durability: 250,
    miningSpeedMultiplier: 6,
    attackDamage: 4,
    effectiveAgainst: [BLOCK_ID.STONE, BLOCK_ID.CRYSTAL, BLOCK_ID.IRON_ORE, BLOCK_ID.DIAMOND_ORE],
  },
  [BLOCK_ID.IRON_AXE]: {
    itemId: BLOCK_ID.IRON_AXE,
    toolType: "axe",
    material: "iron",
    durability: 250,
    miningSpeedMultiplier: 6,
    attackDamage: 5,
    effectiveAgainst: [BLOCK_ID.LOG, BLOCK_ID.PLANKS, BLOCK_ID.CRAFTING_TABLE, BLOCK_ID.LEAVES],
  },
  [BLOCK_ID.IRON_SHOVEL]: {
    itemId: BLOCK_ID.IRON_SHOVEL,
    toolType: "shovel",
    material: "iron",
    durability: 250,
    miningSpeedMultiplier: 6,
    attackDamage: 3,
    effectiveAgainst: [BLOCK_ID.DIRT, BLOCK_ID.GRASS, BLOCK_ID.SAND],
  },
  [BLOCK_ID.IRON_SWORD]: {
    itemId: BLOCK_ID.IRON_SWORD,
    toolType: "sword",
    material: "iron",
    durability: 250,
    miningSpeedMultiplier: 1,
    attackDamage: 6,
    effectiveAgainst: [],
  },
  [BLOCK_ID.DIAMOND_PICKAXE]: {
    itemId: BLOCK_ID.DIAMOND_PICKAXE,
    toolType: "pickaxe",
    material: "diamond",
    durability: 1561,
    miningSpeedMultiplier: 8,
    attackDamage: 5,
    effectiveAgainst: [BLOCK_ID.STONE, BLOCK_ID.CRYSTAL, BLOCK_ID.IRON_ORE, BLOCK_ID.DIAMOND_ORE],
  },
  [BLOCK_ID.DIAMOND_AXE]: {
    itemId: BLOCK_ID.DIAMOND_AXE,
    toolType: "axe",
    material: "diamond",
    durability: 1561,
    miningSpeedMultiplier: 8,
    attackDamage: 6,
    effectiveAgainst: [BLOCK_ID.LOG, BLOCK_ID.PLANKS, BLOCK_ID.CRAFTING_TABLE, BLOCK_ID.LEAVES],
  },
  [BLOCK_ID.DIAMOND_SHOVEL]: {
    itemId: BLOCK_ID.DIAMOND_SHOVEL,
    toolType: "shovel",
    material: "diamond",
    durability: 1561,
    miningSpeedMultiplier: 8,
    attackDamage: 4,
    effectiveAgainst: [BLOCK_ID.DIRT, BLOCK_ID.GRASS, BLOCK_ID.SAND],
  },
  [BLOCK_ID.DIAMOND_SWORD]: {
    itemId: BLOCK_ID.DIAMOND_SWORD,
    toolType: "sword",
    material: "diamond",
    durability: 1561,
    miningSpeedMultiplier: 1,
    attackDamage: 7,
    effectiveAgainst: [],
  },
};

export function isToolItem(itemId: number): boolean {
  return itemId in TOOL_DEFS;
}

export function getToolDef(itemId: number): ToolDef | null {
  return TOOL_DEFS[itemId] ?? null;
}

// ────────────── Armor ──────────────

export type ArmorSlot = "helmet" | "chestplate" | "leggings" | "boots";
export type ArmorMaterial = "iron" | "diamond";

export interface ArmorDef {
  itemId: number;
  slot: ArmorSlot;
  material: ArmorMaterial;
  /** Fraction of incoming damage blocked (0..1). Full set = sum of pieces. */
  damageReduction: number;
  durability: number;
}

export const ARMOR_DEFS: Record<number, ArmorDef> = {
  // Iron: ~60% damage reduction for a full set
  [BLOCK_ID.IRON_HELMET]:     { itemId: BLOCK_ID.IRON_HELMET,     slot: "helmet",     material: "iron", damageReduction: 0.12, durability: 165 },
  [BLOCK_ID.IRON_CHESTPLATE]: { itemId: BLOCK_ID.IRON_CHESTPLATE, slot: "chestplate", material: "iron", damageReduction: 0.24, durability: 240 },
  [BLOCK_ID.IRON_LEGGINGS]:   { itemId: BLOCK_ID.IRON_LEGGINGS,   slot: "leggings",   material: "iron", damageReduction: 0.18, durability: 225 },
  [BLOCK_ID.IRON_BOOTS]:      { itemId: BLOCK_ID.IRON_BOOTS,      slot: "boots",      material: "iron", damageReduction: 0.09, durability: 195 },
  // Diamond: ~80% damage reduction for a full set
  [BLOCK_ID.DIAMOND_HELMET]:     { itemId: BLOCK_ID.DIAMOND_HELMET,     slot: "helmet",     material: "diamond", damageReduction: 0.15, durability: 363 },
  [BLOCK_ID.DIAMOND_CHESTPLATE]: { itemId: BLOCK_ID.DIAMOND_CHESTPLATE, slot: "chestplate", material: "diamond", damageReduction: 0.32, durability: 528 },
  [BLOCK_ID.DIAMOND_LEGGINGS]:   { itemId: BLOCK_ID.DIAMOND_LEGGINGS,   slot: "leggings",   material: "diamond", damageReduction: 0.24, durability: 495 },
  [BLOCK_ID.DIAMOND_BOOTS]:      { itemId: BLOCK_ID.DIAMOND_BOOTS,      slot: "boots",      material: "diamond", damageReduction: 0.12, durability: 429 },
};

export function isArmorItem(itemId: number): boolean {
  return itemId in ARMOR_DEFS;
}

export function getArmorDef(itemId: number): ArmorDef | null {
  return ARMOR_DEFS[itemId] ?? null;
}

export function getArmorSlotIndex(slot: ArmorSlot): number {
  // Matches useHotbarStore armor array: [helmet, chest, legs, boots]
  if (slot === "helmet") return 0;
  if (slot === "chestplate") return 1;
  if (slot === "leggings") return 2;
  return 3;
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
  [BLOCK_ID.IRON_ORE]: "Iron Ore",
  [BLOCK_ID.IRON_INGOT]: "Iron Ingot",
  [BLOCK_ID.DIAMOND_ORE]: "Diamond Ore",
  [BLOCK_ID.DIAMOND]: "Diamond",
  [BLOCK_ID.IRON_PICKAXE]: "Iron Pickaxe",
  [BLOCK_ID.IRON_AXE]: "Iron Axe",
  [BLOCK_ID.IRON_SHOVEL]: "Iron Shovel",
  [BLOCK_ID.IRON_SWORD]: "Iron Sword",
  [BLOCK_ID.DIAMOND_PICKAXE]: "Diamond Pickaxe",
  [BLOCK_ID.DIAMOND_AXE]: "Diamond Axe",
  [BLOCK_ID.DIAMOND_SHOVEL]: "Diamond Shovel",
  [BLOCK_ID.DIAMOND_SWORD]: "Diamond Sword",
  [BLOCK_ID.LAVA]: "Lava",
  [BLOCK_ID.WATER]: "Water",
  [BLOCK_ID.SNOW]: "Snow",
  [BLOCK_ID.ICE]: "Ice",
  [BLOCK_ID.IRON_HELMET]: "Iron Helmet",
  [BLOCK_ID.IRON_CHESTPLATE]: "Iron Chestplate",
  [BLOCK_ID.IRON_LEGGINGS]: "Iron Leggings",
  [BLOCK_ID.IRON_BOOTS]: "Iron Boots",
  [BLOCK_ID.DIAMOND_HELMET]: "Diamond Helmet",
  [BLOCK_ID.DIAMOND_CHESTPLATE]: "Diamond Chestplate",
  [BLOCK_ID.DIAMOND_LEGGINGS]: "Diamond Leggings",
  [BLOCK_ID.DIAMOND_BOOTS]: "Diamond Boots",
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
  [BLOCK_ID.IRON_ORE]: 0x8a7a6a,
  [BLOCK_ID.IRON_INGOT]: 0xd4d4d4,
  [BLOCK_ID.DIAMOND_ORE]: 0x4a9a9a,
  [BLOCK_ID.DIAMOND]: 0x00d4ff,
  [BLOCK_ID.IRON_PICKAXE]: 0xc0c0c0,
  [BLOCK_ID.IRON_AXE]: 0xc0c0c0,
  [BLOCK_ID.IRON_SHOVEL]: 0xc0c0c0,
  [BLOCK_ID.IRON_SWORD]: 0xc0c0c0,
  [BLOCK_ID.DIAMOND_PICKAXE]: 0x55cccc,
  [BLOCK_ID.DIAMOND_AXE]: 0x55cccc,
  [BLOCK_ID.DIAMOND_SHOVEL]: 0x55cccc,
  [BLOCK_ID.DIAMOND_SWORD]: 0x55cccc,
  [BLOCK_ID.LAVA]: 0xff6600,
  [BLOCK_ID.WATER]: 0x3366ff,
  [BLOCK_ID.SNOW]: 0xf0f0ff,
  [BLOCK_ID.ICE]: 0xa0d0ff,
  [BLOCK_ID.IRON_HELMET]: 0xc0c0c0,
  [BLOCK_ID.IRON_CHESTPLATE]: 0xc0c0c0,
  [BLOCK_ID.IRON_LEGGINGS]: 0xc0c0c0,
  [BLOCK_ID.IRON_BOOTS]: 0xc0c0c0,
  [BLOCK_ID.DIAMOND_HELMET]: 0x55cccc,
  [BLOCK_ID.DIAMOND_CHESTPLATE]: 0x55cccc,
  [BLOCK_ID.DIAMOND_LEGGINGS]: 0x55cccc,
  [BLOCK_ID.DIAMOND_BOOTS]: 0x55cccc,
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
  [BLOCK_ID.IRON_ORE]: "#8a7a6a",
  [BLOCK_ID.IRON_INGOT]: "#d4d4d4",
  [BLOCK_ID.DIAMOND_ORE]: "#4a9a9a",
  [BLOCK_ID.DIAMOND]: "#00d4ff",
  [BLOCK_ID.IRON_PICKAXE]: "#c0c0c0",
  [BLOCK_ID.IRON_AXE]: "#c0c0c0",
  [BLOCK_ID.IRON_SHOVEL]: "#c0c0c0",
  [BLOCK_ID.IRON_SWORD]: "#c0c0c0",
  [BLOCK_ID.DIAMOND_PICKAXE]: "#55cccc",
  [BLOCK_ID.DIAMOND_AXE]: "#55cccc",
  [BLOCK_ID.DIAMOND_SHOVEL]: "#55cccc",
  [BLOCK_ID.DIAMOND_SWORD]: "#55cccc",
  [BLOCK_ID.LAVA]: "#ff6600",
  [BLOCK_ID.WATER]: "#3366ff",
  [BLOCK_ID.SNOW]: "#f0f0ff",
  [BLOCK_ID.ICE]: "#a0d0ff",
  [BLOCK_ID.IRON_HELMET]: "#c0c0c0",
  [BLOCK_ID.IRON_CHESTPLATE]: "#c0c0c0",
  [BLOCK_ID.IRON_LEGGINGS]: "#c0c0c0",
  [BLOCK_ID.IRON_BOOTS]: "#c0c0c0",
  [BLOCK_ID.DIAMOND_HELMET]: "#55cccc",
  [BLOCK_ID.DIAMOND_CHESTPLATE]: "#55cccc",
  [BLOCK_ID.DIAMOND_LEGGINGS]: "#55cccc",
  [BLOCK_ID.DIAMOND_BOOTS]: "#55cccc",
};
