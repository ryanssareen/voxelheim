import { describe, it, expect } from "vitest";
import { BLOCK_ID } from "@data/blocks";
import { MAX_STACK, HOTBAR_SLOTS, TOTAL_SLOTS, type ItemStack } from "@store/useHotbarStore";
import { applyPlan, quickMove, type Region, type QuickMoveContext } from "@systems/inventory/transfer";
import { buildLayout, splitLayout } from "@systems/inventory/layout";
import {
  hotbarRegion,
  storageRegion,
  craftInputRegion,
  furnaceInputRegion,
  furnaceFuelRegion,
  armorRegions,
  offhandRegion,
  outputRegion,
  stackable,
} from "@systems/inventory/regions";

const empty = (): ItemStack => ({ blockId: BLOCK_ID.AIR, count: 0 });
const stack = (blockId: number, count: number, durability?: number): ItemStack => ({ blockId, count, durability });

/** A bare 36-slot player array (hotbar+storage) with every slot empty. */
function emptyPlayer(): ItemStack[] {
  return Array.from({ length: TOTAL_SLOTS }, () => empty());
}

function multiset(slots: ReadonlyArray<ItemStack>): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of slots) {
    if (s.count === 0) continue;
    const key = `${s.blockId}`;
    m.set(key, (m.get(key) ?? 0) + s.count);
  }
  return m;
}

function ctxFor(slots: ReadonlyArray<ItemStack>, fromSlot: number): QuickMoveContext {
  return { slots, fromSlot, maxStack: MAX_STACK, stackable };
}

describe("quickMove — merge before empty", () => {
  it("merges into a partial stack first, then spills into the empty slot next to it", () => {
    const player = emptyPlayer();
    // Fill every other hotbar slot so slot 4 is the only empty destination.
    for (const i of [0, 1, 2, 5, 6, 7, 8]) player[i] = stack(BLOCK_ID.DIRT, 1);
    player[3] = stack(BLOCK_ID.STONE, 60);
    player[20] = stack(BLOCK_ID.STONE, 60); // source, sitting in storage

    const layout = buildLayout(player, [], [], empty());
    const hotbar = hotbarRegion(layout);
    const storage = storageRegion(layout);
    const regions: Region[] = [hotbar, storage];

    const item = layout.slots[20];
    const plan = quickMove(item, storage, regions, ctxFor(layout.slots, 20));

    expect(plan.moves).toEqual([
      { from: 20, to: 3, count: 39 },
      { from: 20, to: 4, count: 21 },
    ]);
    expect(plan.remainder).toBe(0);
  });

  it("never exceeds MAX_STACK in any destination slot", () => {
    const player = emptyPlayer();
    player[3] = stack(BLOCK_ID.STONE, 60);
    player[20] = stack(BLOCK_ID.STONE, 60);

    const layout = buildLayout(player, [], [], empty());
    const regions: Region[] = [hotbarRegion(layout), storageRegion(layout)];
    const plan = quickMove(layout.slots[20], regions[1], regions, ctxFor(layout.slots, 20));
    const next = applyPlan(layout.slots, plan);

    for (const s of next) expect(s.count).toBeLessThanOrEqual(MAX_STACK);
  });

  it("is a partial fit when nothing else can take the remainder", () => {
    const player = emptyPlayer();
    for (let i = 0; i < TOTAL_SLOTS; i++) player[i] = stack(BLOCK_ID.DIRT, 1);
    player[3] = stack(BLOCK_ID.STONE, 60);
    player[20] = stack(BLOCK_ID.STONE, 60); // source

    const layout = buildLayout(player, [], [], empty());
    const regions: Region[] = [hotbarRegion(layout), storageRegion(layout)];
    const plan = quickMove(layout.slots[20], regions[1], regions, ctxFor(layout.slots, 20));

    expect(plan.moves).toEqual([{ from: 20, to: 3, count: 39 }]);
    expect(plan.remainder).toBe(21);
  });
});

describe("quickMove — priority order", () => {
  it("prefers furnaceInput over storage for a smeltable item", () => {
    const player = emptyPlayer();
    player[0] = stack(BLOCK_ID.SAND, 5); // source, in hotbar
    const layout = buildLayout(player, [empty(), empty()], [], empty());
    const [containerStart] = layout.ranges.container;
    const regions: Region[] = [
      hotbarRegion(layout),
      storageRegion(layout),
      furnaceInputRegion(containerStart),
      furnaceFuelRegion(containerStart + 1),
    ];
    const hotbar = regions[0];
    const plan = quickMove(layout.slots[0], hotbar, regions, ctxFor(layout.slots, 0));
    expect(plan.moves).toEqual([{ from: 0, to: containerStart, count: 5 }]);
  });

  it("routes fuel to furnaceFuel, not furnaceInput", () => {
    const player = emptyPlayer();
    player[0] = stack(BLOCK_ID.LOG, 5);
    const layout = buildLayout(player, [empty(), empty()], [], empty());
    const [containerStart] = layout.ranges.container;
    const regions: Region[] = [
      hotbarRegion(layout),
      storageRegion(layout),
      furnaceInputRegion(containerStart),
      furnaceFuelRegion(containerStart + 1),
    ];
    const plan = quickMove(layout.slots[0], regions[0], regions, ctxFor(layout.slots, 0));
    expect(plan.moves).toEqual([{ from: 0, to: containerStart + 1, count: 5 }]);
  });

  it("falls back to storage when neither furnace region accepts", () => {
    const player = emptyPlayer();
    player[0] = stack(BLOCK_ID.DIRT, 5);
    const layout = buildLayout(player, [empty(), empty()], [], empty());
    const [containerStart] = layout.ranges.container;
    const regions: Region[] = [
      hotbarRegion(layout),
      storageRegion(layout),
      furnaceInputRegion(containerStart),
      furnaceFuelRegion(containerStart + 1),
    ];
    const plan = quickMove(layout.slots[0], regions[0], regions, ctxFor(layout.slots, 0));
    expect(plan.moves).toHaveLength(1);
    const [move] = plan.moves;
    expect(move.to).toBeGreaterThanOrEqual(layout.ranges.storage[0]);
    expect(move.to).toBeLessThan(layout.ranges.storage[1]);
  });
});

describe("quickMove — output and negative-priority regions are never destinations", () => {
  it("never targets an output region or a priority<0 region", () => {
    const player = emptyPlayer();
    player[0] = stack(BLOCK_ID.DIRT, 5);
    const layout = buildLayout(player, [stack(BLOCK_ID.DIRT, 1), empty()], [], empty());
    const [, containerEnd] = layout.ranges.container;
    const output = outputRegion(containerEnd - 1);
    const offhand = offhandRegion(layout);
    const regions: Region[] = [hotbarRegion(layout), storageRegion(layout), output, offhand];

    const plan = quickMove(layout.slots[0], regions[0], regions, ctxFor(layout.slots, 0));
    for (const move of plan.moves) {
      expect(move.to).not.toBe(output.range[0]);
      expect(move.to).not.toBe(offhand.range[0]);
    }
  });
});

describe("quickMove — craftInput is a prioritized destination", () => {
  it("shift-clicking a storage item lays the whole stack into the crafting grid first", () => {
    const player = emptyPlayer();
    player[9] = stack(BLOCK_ID.DIRT, 5); // storage, not hotbar
    const layout = buildLayout(player, [empty(), empty(), empty(), empty()], [], empty());
    const [containerStart, containerEnd] = layout.ranges.container;
    const craftInput = craftInputRegion([containerStart, containerEnd]);
    const regions: Region[] = [hotbarRegion(layout), storageRegion(layout), craftInput];

    const fromIndex = 9;
    const plan = quickMove(layout.slots[fromIndex], regions[1], regions, ctxFor(layout.slots, fromIndex));
    expect(plan.moves).toEqual([{ from: fromIndex, to: containerStart, count: 5 }]);
  });

  it("overflows to storage once the crafting grid is full", () => {
    const player = emptyPlayer();
    player[9] = stack(BLOCK_ID.DIRT, 5);
    const layout = buildLayout(
      player,
      [stack(BLOCK_ID.STONE, 1), stack(BLOCK_ID.STONE, 1)],
      [],
      empty()
    );
    const [containerStart, containerEnd] = layout.ranges.container;
    const craftInput = craftInputRegion([containerStart, containerEnd]);
    const regions: Region[] = [hotbarRegion(layout), storageRegion(layout), craftInput];

    const fromIndex = 9;
    const plan = quickMove(layout.slots[fromIndex], regions[1], regions, ctxFor(layout.slots, fromIndex));
    // Grid full: falls through to hotbar next (priority 5 > storage's 4).
    expect(plan.moves).toEqual([{ from: fromIndex, to: 0, count: 5 }]);
  });

  it("still lets a shift-clicked grid cell return to the player (craftInput as source)", () => {
    const player = emptyPlayer();
    const layout = buildLayout(player, [stack(BLOCK_ID.DIRT, 3), empty()], [], empty());
    const [containerStart, containerEnd] = layout.ranges.container;
    const craftInput = craftInputRegion([containerStart, containerEnd]);
    const regions: Region[] = [hotbarRegion(layout), storageRegion(layout), craftInput];

    const plan = quickMove(layout.slots[containerStart], craftInput, regions, ctxFor(layout.slots, containerStart));
    expect(plan.moves).toEqual([{ from: containerStart, to: 0, count: 3 }]);
  });
});

describe("quickMove — source region excluded", () => {
  it("moving from hotbar with only storage accepting lands in storage", () => {
    const player = emptyPlayer();
    player[0] = stack(BLOCK_ID.DIRT, 5);
    const layout = buildLayout(player, [], [], empty());
    const regions: Region[] = [hotbarRegion(layout), storageRegion(layout)];
    const plan = quickMove(layout.slots[0], regions[0], regions, ctxFor(layout.slots, 0));
    for (const move of plan.moves) {
      expect(move.to).toBeGreaterThanOrEqual(HOTBAR_SLOTS);
    }
  });

  it("moving from storage with only hotbar accepting lands in hotbar (the swap case)", () => {
    const player = emptyPlayer();
    player[10] = stack(BLOCK_ID.DIRT, 5);
    const layout = buildLayout(player, [], [], empty());
    const regions: Region[] = [hotbarRegion(layout), storageRegion(layout)];
    const plan = quickMove(layout.slots[10], regions[1], regions, ctxFor(layout.slots, 10));
    for (const move of plan.moves) {
      expect(move.to).toBeLessThan(HOTBAR_SLOTS);
    }
  });
});

describe("quickMove — unstackable items", () => {
  it("never merges two tools and only moves into an empty slot", () => {
    const player = emptyPlayer();
    player[0] = stack(BLOCK_ID.WOODEN_PICKAXE, 1, 40); // source
    player[10] = stack(BLOCK_ID.WOODEN_PICKAXE, 1, 59); // existing pickaxe elsewhere in storage
    const layout = buildLayout(player, [], [], empty());
    const regions: Region[] = [hotbarRegion(layout), storageRegion(layout)];
    const plan = quickMove(layout.slots[0], regions[0], regions, ctxFor(layout.slots, 0));

    expect(plan.moves).toHaveLength(1);
    expect(plan.moves[0].to).not.toBe(10);
    expect(plan.moves[0].count).toBe(1);
    expect(plan.remainder).toBe(0);

    const next = applyPlan(layout.slots, plan);
    // the existing pickaxe at 10 is untouched (never merged into)
    expect(next[10]).toEqual({ blockId: BLOCK_ID.WOODEN_PICKAXE, count: 1, durability: 59 });
  });
});

describe("quickMove — armor routing", () => {
  it("routes a helmet only to armor slot 0", () => {
    const player = emptyPlayer();
    player[0] = stack(BLOCK_ID.IRON_HELMET, 1, 165);
    const layout = buildLayout(player, [], [empty(), empty(), empty(), empty()], empty());
    const regions: Region[] = [hotbarRegion(layout), storageRegion(layout), ...armorRegions(layout)];
    const plan = quickMove(layout.slots[0], regions[0], regions, ctxFor(layout.slots, 0));
    expect(plan.moves).toEqual([{ from: 0, to: layout.ranges.armor[0] + 0, count: 1 }]);
  });

  it("routes boots only to armor slot 3", () => {
    const player = emptyPlayer();
    player[0] = stack(BLOCK_ID.IRON_BOOTS, 1, 195);
    const layout = buildLayout(player, [], [empty(), empty(), empty(), empty()], empty());
    const regions: Region[] = [hotbarRegion(layout), storageRegion(layout), ...armorRegions(layout)];
    const plan = quickMove(layout.slots[0], regions[0], regions, ctxFor(layout.slots, 0));
    expect(plan.moves).toEqual([{ from: 0, to: layout.ranges.armor[0] + 3, count: 1 }]);
  });

  it("never merges two armor pieces — an occupied matching slot leaves the item stranded", () => {
    const player = emptyPlayer();
    player[0] = stack(BLOCK_ID.IRON_HELMET, 1, 40); // source, a damaged helmet
    const armor = [stack(BLOCK_ID.IRON_HELMET, 1, 165), empty(), empty(), empty()]; // slot 0 already occupied
    const layout = buildLayout(player, [], armor, empty());
    // Only armor regions as destinations, so the only slot type-gated to
    // accept a helmet (index 0) is the one already occupied.
    const regions: Region[] = [...armorRegions(layout)];
    const plan = quickMove(layout.slots[0], regions[0], regions, ctxFor(layout.slots, 0));

    expect(plan.moves).toEqual([]);
    expect(plan.remainder).toBe(1);
    const next = applyPlan(layout.slots, plan);
    // The existing helmet's durability is untouched — never merged into.
    expect(next[layout.ranges.armor[0]]).toEqual({ blockId: BLOCK_ID.IRON_HELMET, count: 1, durability: 165 });
  });
});

describe("quickMove — declaration-order tie-break", () => {
  it("keeps declaration order when two regions share a priority", () => {
    const player = emptyPlayer();
    const layout = buildLayout(player, [], [], empty());
    // regionB declared first but covers HIGHER indices than regionA declared second.
    const regionB: Region = { role: "storage", range: [10, 12], priority: 4, accepts: () => true };
    const regionA: Region = { role: "storage", range: [0, 2], priority: 4, accepts: () => true };
    const source: Region = { role: "hotbar", range: [20, 21], priority: -1, accepts: () => false };
    const regions: Region[] = [regionB, regionA];
    const ctx = ctxFor(layout.slots, 20);
    const withSource = [...layout.slots];
    withSource[20] = stack(BLOCK_ID.DIRT, 3);
    const plan = quickMove(withSource[20], source, regions, { ...ctx, slots: withSource });
    expect(plan.moves[0].to).toBe(10); // regionB's first slot, not regionA's
  });
});

describe("applyPlan", () => {
  it("preserves durability and conserves the total item count", () => {
    const player = emptyPlayer();
    player[0] = stack(BLOCK_ID.WOODEN_PICKAXE, 1, 12);
    const layout = buildLayout(player, [], [], empty());
    const regions: Region[] = [hotbarRegion(layout), storageRegion(layout)];
    const before = multiset(layout.slots);
    const plan = quickMove(layout.slots[0], regions[0], regions, ctxFor(layout.slots, 0));
    const next = applyPlan(layout.slots, plan);

    expect(multiset(next)).toEqual(before);
    const moved = next.find((s) => s.blockId === BLOCK_ID.WOODEN_PICKAXE);
    expect(moved?.durability).toBe(12);
  });
});

describe("layout round-trip", () => {
  it("inventory screen: hotbar/storage/craftInput/output/armor/offhand index table", () => {
    const player = emptyPlayer();
    const container = [empty(), empty(), empty(), empty(), empty()]; // craftingGrid(4) + output(1)
    const armor = [empty(), empty(), empty(), empty()];
    const offhand = empty();
    const layout = buildLayout(player, container, armor, offhand);

    expect(layout.ranges.hotbar).toEqual([0, 9]);
    expect(layout.ranges.storage).toEqual([9, 36]);
    expect(layout.ranges.container).toEqual([36, 41]);
    expect(layout.ranges.armor).toEqual([41, 45]);
    expect(layout.ranges.offhand).toBe(45);
    expect(layout.slots).toHaveLength(46);

    const split = splitLayout(layout.slots, layout.ranges);
    expect(split.player).toEqual(player);
    expect(split.container).toEqual(container);
    expect(split.armor).toEqual(armor);
    expect(split.offhand).toEqual(offhand);
  });

  it("crafting table screen index table", () => {
    const player = emptyPlayer();
    const container = Array.from({ length: 10 }, () => empty()); // tableGrid(9) + output(1)
    const armor = [empty(), empty(), empty(), empty()];
    const layout = buildLayout(player, container, armor, empty());

    expect(layout.ranges.container).toEqual([36, 46]);
    expect(layout.ranges.armor).toEqual([46, 50]);
    expect(layout.ranges.offhand).toBe(50);
    expect(layout.slots).toHaveLength(51);
  });

  it("furnace screen index table", () => {
    const player = emptyPlayer();
    const container = [empty(), empty(), empty()]; // input + fuel + output
    const armor = [empty(), empty(), empty(), empty()];
    const layout = buildLayout(player, container, armor, empty());

    expect(layout.ranges.container).toEqual([36, 39]);
    expect(layout.ranges.armor).toEqual([39, 43]);
    expect(layout.ranges.offhand).toBe(43);
    expect(layout.slots).toHaveLength(44);
  });

  it("creative screen index table (no container)", () => {
    const player = emptyPlayer();
    const armor = [empty(), empty(), empty(), empty()];
    const layout = buildLayout(player, [], armor, empty());

    expect(layout.ranges.container).toEqual([36, 36]);
    expect(layout.ranges.armor).toEqual([36, 40]);
    expect(layout.ranges.offhand).toBe(40);
    expect(layout.slots).toHaveLength(41);

    const split = splitLayout(layout.slots, layout.ranges);
    expect(split.container).toEqual([]);
    expect(split.player).toEqual(player);
    expect(split.armor).toEqual(armor);
  });
});
