import { describe, it, expect, beforeEach } from "vitest";
import { BLOCK_ID } from "@data/blocks";
import { getToolDef } from "@data/items";
import { useHotbarStore, MAX_STACK, type ItemStack } from "@store/useHotbarStore";
import { useInventoryStore } from "@store/useInventoryStore";
import { resolveCraft } from "@systems/crafting/craft";
import { quickMoveAt } from "@systems/inventory/craft";
import { inventoryScreen, tableScreen, furnaceScreen, furnaceFinder } from "@systems/inventory/screens";

const empty = (): ItemStack => ({ blockId: BLOCK_ID.AIR, count: 0 });
const stack = (blockId: number, count: number, durability?: number): ItemStack => ({ blockId, count, durability });

/** Runs the exact single-updater pattern the UI's plain-click handlers use. */
function craftOnceViaResolveCraft(
  grid: "craftingGrid" | "furnaceSlots",
  find?: Parameters<typeof resolveCraft>[3]
) {
  useInventoryStore.setState((state) => {
    const outcome = resolveCraft(state[grid], state.cursorItem, MAX_STACK, find);
    if (!outcome) return state;
    return { ...state, [grid]: outcome.grid, cursorItem: outcome.cursor };
  });
}

beforeEach(() => {
  useHotbarStore.getState().resetSlots();
  useInventoryStore.getState().reset();
});

describe("plain click on a craft result (resolveCraft, single-updater)", () => {
  it("grants the result to an empty cursor and consumes the grid", () => {
    useInventoryStore.setState({ craftingGrid: [stack(BLOCK_ID.LOG, 1), empty(), empty(), empty()] });
    craftOnceViaResolveCraft("craftingGrid");

    expect(useInventoryStore.getState().cursorItem).toEqual(stack(BLOCK_ID.PLANKS, 4));
    expect(useInventoryStore.getState().craftingGrid[0]).toEqual(empty());
  });

  it("merges into a matching cursor stack", () => {
    useInventoryStore.setState({
      craftingGrid: [stack(BLOCK_ID.LOG, 1), empty(), empty(), empty()],
      cursorItem: stack(BLOCK_ID.PLANKS, 10),
    });
    craftOnceViaResolveCraft("craftingGrid");
    expect(useInventoryStore.getState().cursorItem).toEqual(stack(BLOCK_ID.PLANKS, 14));
  });

  it("is a no-op when the cursor holds a foreign item, leaving the grid untouched", () => {
    useInventoryStore.setState({
      craftingGrid: [stack(BLOCK_ID.LOG, 1), empty(), empty(), empty()],
      cursorItem: stack(BLOCK_ID.STONE, 5),
    });
    craftOnceViaResolveCraft("craftingGrid");

    expect(useInventoryStore.getState().craftingGrid[0]).toEqual(stack(BLOCK_ID.LOG, 1));
    expect(useInventoryStore.getState().cursorItem).toEqual(stack(BLOCK_ID.STONE, 5));
  });
});

describe("shift-click on a craft output (craftOnce via quickMoveAt)", () => {
  it("quick-moves the whole result into hotbar/storage and consumes the grid", () => {
    useInventoryStore.setState({ craftingGrid: [stack(BLOCK_ID.LOG, 1), empty(), empty(), empty()] });

    const screen = inventoryScreen();
    const outputIndex = screen.layout.ranges.container[1] - 1;
    const next = quickMoveAt(screen.layout, screen.regions, outputIndex, screen.find, MAX_STACK);
    expect(next).not.toBeNull();
    if (next) screen.write(next);

    expect(useHotbarStore.getState().slots.some((s) => s.blockId === BLOCK_ID.PLANKS && s.count === 4)).toBe(true);
    expect(useInventoryStore.getState().craftingGrid[0]).toEqual(empty());
  });

  it("is a no-op — nothing consumed — when a full inventory can't take the result", () => {
    useHotbarStore.setState({ slots: useHotbarStore.getState().slots.map(() => stack(BLOCK_ID.STONE, MAX_STACK)) });
    useInventoryStore.setState({ craftingGrid: [stack(BLOCK_ID.LOG, 1), empty(), empty(), empty()] });

    const screen = inventoryScreen();
    const outputIndex = screen.layout.ranges.container[1] - 1;
    const next = quickMoveAt(screen.layout, screen.regions, outputIndex, screen.find, MAX_STACK);

    expect(next).toBeNull();
    expect(useInventoryStore.getState().craftingGrid[0]).toEqual(stack(BLOCK_ID.LOG, 1));
    expect(useHotbarStore.getState().slots.every((s) => s.blockId === BLOCK_ID.STONE)).toBe(true);
  });

  it("preserves a crafted tool's durability through the quick-move", () => {
    // Wooden Pickaxe: [P,P,P,_,ST,_,_,ST,_] on the 3x3 table grid.
    const P = BLOCK_ID.PLANKS;
    const ST = BLOCK_ID.STICK;
    useInventoryStore.setState({
      tableOpen: true,
      tableGrid: [stack(P, 1), stack(P, 1), stack(P, 1), empty(), stack(ST, 1), empty(), empty(), stack(ST, 1), empty()],
    });

    const screen = tableScreen();
    const outputIndex = screen.layout.ranges.container[1] - 1;
    const next = quickMoveAt(screen.layout, screen.regions, outputIndex, screen.find, MAX_STACK);
    expect(next).not.toBeNull();
    if (next) screen.write(next);

    const pickaxe = useHotbarStore.getState().slots.find((s) => s.blockId === BLOCK_ID.WOODEN_PICKAXE);
    expect(pickaxe?.durability).toBe(getToolDef(BLOCK_ID.WOODEN_PICKAXE)!.durability);
  });
});

describe("furnace craft result", () => {
  it("plain click: 3 sand + 2 logs -> input 2, fuel 1, +1 stone", () => {
    useInventoryStore.setState({
      furnaceSlots: [stack(BLOCK_ID.SAND, 3), stack(BLOCK_ID.LOG, 2)],
    });
    craftOnceViaResolveCraft("furnaceSlots", furnaceFinder);

    expect(useInventoryStore.getState().furnaceSlots).toEqual([stack(BLOCK_ID.SAND, 2), stack(BLOCK_ID.LOG, 1)]);
    expect(useInventoryStore.getState().cursorItem).toEqual(stack(BLOCK_ID.STONE, 1));
  });

  it("shift-click: quick-moves the smelted result and consumes input+fuel by one each", () => {
    useInventoryStore.setState({
      furnaceOpen: true,
      furnaceSlots: [stack(BLOCK_ID.SAND, 3), stack(BLOCK_ID.LOG, 2)],
    });

    const screen = furnaceScreen();
    const outputIndex = screen.layout.ranges.container[1] - 1;
    const next = quickMoveAt(screen.layout, screen.regions, outputIndex, screen.find, MAX_STACK);
    expect(next).not.toBeNull();
    if (next) screen.write(next);

    expect(useInventoryStore.getState().furnaceSlots).toEqual([stack(BLOCK_ID.SAND, 2), stack(BLOCK_ID.LOG, 1)]);
    expect(useHotbarStore.getState().slots.some((s) => s.blockId === BLOCK_ID.STONE && s.count === 1)).toBe(true);
  });

  it("does not smelt without fuel, or with a non-fuel item in the fuel slot", () => {
    useInventoryStore.setState({ furnaceSlots: [stack(BLOCK_ID.SAND, 3), empty()] });
    craftOnceViaResolveCraft("furnaceSlots", furnaceFinder);
    expect(useInventoryStore.getState().furnaceSlots[0]).toEqual(stack(BLOCK_ID.SAND, 3));

    useInventoryStore.setState({ furnaceSlots: [stack(BLOCK_ID.SAND, 3), stack(BLOCK_ID.STONE, 1)] });
    craftOnceViaResolveCraft("furnaceSlots", furnaceFinder);
    expect(useInventoryStore.getState().furnaceSlots[0]).toEqual(stack(BLOCK_ID.SAND, 3));
  });
});
