import { describe, it, expect } from "vitest";
import { BLOCK_ID, BLOCK_DEFINITIONS } from "@data/blocks";
import { RECIPES, RECIPES_3x3 } from "@systems/crafting/recipes";
import { SMELTING_RECIPES, FUEL_ITEMS, findSmeltingRecipe } from "@systems/crafting/smelting";

/** Reverse lookup: block id -> display name, for failure messages. */
const NAME: Record<number, string> = Object.fromEntries(
  BLOCK_DEFINITIONS.map((d) => [d.id, d.name])
);

/**
 * Abstract "effort units" per the remediation contract's economy value
 * table (docs/plans/2026-09-03-001-remediation-contract.md), with the
 * shovel/sword rows corrected to their input sums (A5).
 *
 * This doubles as a potential function over inventory state:
 * V(inventory) = sum(VALUE[blockId] * count). Every recipe below is required
 * to satisfy inputValue >= outputValue, i.e. every recipe has ΔV <= 0. A
 * cycle's total ΔV is the sum of its edges' ΔV, so once every edge is <= 0,
 * no cycle — single-ingredient or multi-input — can be net-positive under
 * this table. That is the whole proof; the recipe-flow-graph test below adds
 * a second, table-independent guard over single-ingredient edges only.
 */
const VALUE: Record<number, number> = {
  [BLOCK_ID.AIR]: 0,
  [BLOCK_ID.LAVA]: 0,
  [BLOCK_ID.WATER]: 0,
  [BLOCK_ID.LEAVES]: 0.05,
  [BLOCK_ID.DIRT]: 0.5,
  [BLOCK_ID.GRASS]: 0.5,
  [BLOCK_ID.SAND]: 0.5,
  [BLOCK_ID.STONE]: 0.5,
  [BLOCK_ID.SNOW]: 0.5,
  [BLOCK_ID.ICE]: 0.5,
  [BLOCK_ID.LOG]: 1,
  [BLOCK_ID.PLANKS]: 0.25,
  [BLOCK_ID.STICK]: 0.125,
  [BLOCK_ID.CRAFTING_TABLE]: 1,
  [BLOCK_ID.FURNACE]: 4,
  [BLOCK_ID.WOODEN_PICKAXE]: 1,
  [BLOCK_ID.WOODEN_AXE]: 1,
  [BLOCK_ID.WOODEN_SHOVEL]: 0.5,
  [BLOCK_ID.WOODEN_SWORD]: 0.625,
  [BLOCK_ID.STONE_PICKAXE]: 1.75,
  [BLOCK_ID.STONE_AXE]: 1.75,
  [BLOCK_ID.STONE_SHOVEL]: 0.75,
  [BLOCK_ID.STONE_SWORD]: 1.125,
  [BLOCK_ID.IRON_ORE]: 4,
  [BLOCK_ID.IRON_INGOT]: 4,
  [BLOCK_ID.DIAMOND_ORE]: 16,
  [BLOCK_ID.DIAMOND]: 16,
  [BLOCK_ID.IRON_PICKAXE]: 12,
  [BLOCK_ID.IRON_AXE]: 12,
  [BLOCK_ID.IRON_SHOVEL]: 4.25,
  [BLOCK_ID.IRON_SWORD]: 8.125,
  [BLOCK_ID.DIAMOND_PICKAXE]: 48,
  [BLOCK_ID.DIAMOND_AXE]: 48,
  [BLOCK_ID.DIAMOND_SHOVEL]: 16.25,
  [BLOCK_ID.DIAMOND_SWORD]: 32.125,
  [BLOCK_ID.IRON_HELMET]: 20,
  [BLOCK_ID.IRON_CHESTPLATE]: 32,
  [BLOCK_ID.IRON_LEGGINGS]: 28,
  [BLOCK_ID.IRON_BOOTS]: 16,
  [BLOCK_ID.DIAMOND_HELMET]: 80,
  [BLOCK_ID.DIAMOND_CHESTPLATE]: 128,
  [BLOCK_ID.DIAMOND_LEGGINGS]: 112,
  [BLOCK_ID.DIAMOND_BOOTS]: 64,
  [BLOCK_ID.CRYSTAL]: 8,
  [BLOCK_ID.RAW_PORK]: 2,
  [BLOCK_ID.RAW_BEEF]: 2,
  [BLOCK_ID.RAW_MUTTON]: 1.5,
  [BLOCK_ID.COOKED_PORK]: 2,
  [BLOCK_ID.COOKED_BEEF]: 2,
  [BLOCK_ID.COOKED_MUTTON]: 1.5,
};

/** cheapest fuel per smelt: FurnaceUI consumes exactly one fuel item per smelt, no burn-time model. */
const cheapestFuel = Math.min(...[...FUEL_ITEMS].map((id) => VALUE[id]));

/** A normalised production edge: `inputs` items in, `count` of `output` out. */
interface Flow {
  kind: "2x2" | "3x3" | "smelt";
  name: string;
  inputs: Map<number, number>;
  output: number;
  count: number;
}

function inputsFromGrid(grid: readonly number[]): Map<number, number> {
  const inputs = new Map<number, number>();
  for (const id of grid) {
    if (id === 0) continue;
    inputs.set(id, (inputs.get(id) ?? 0) + 1);
  }
  return inputs;
}

const FLOWS: Flow[] = [
  ...RECIPES.map(
    (r): Flow => ({ kind: "2x2", name: r.name, inputs: inputsFromGrid(r.grid), output: r.result, count: r.count })
  ),
  ...RECIPES_3x3.map(
    (r): Flow => ({ kind: "3x3", name: r.name, inputs: inputsFromGrid(r.grid), output: r.result, count: r.count })
  ),
  ...SMELTING_RECIPES.map(
    (r): Flow => ({ kind: "smelt", name: r.name, inputs: new Map([[r.input, 1]]), output: r.result, count: r.count })
  ),
];

describe("value table", () => {
  it("prices every block id", () => {
    const missing = Object.values(BLOCK_ID).filter((id) => !Number.isFinite(VALUE[id]));
    expect(missing.map((id) => `block id ${id} (${NAME[id]}) has no economy value — add it to VALUE in src/tests/economy.test.ts`)).toEqual([]);
  });

  it("gives every recipe output a positive value", () => {
    const zero = FLOWS.filter((f) => !(VALUE[f.output] > 0)).map(
      (f) => `[${f.kind}] ${f.name} outputs ${NAME[f.output]} with VALUE ${VALUE[f.output]}`
    );
    expect(zero).toEqual([]);
  });

  it("prices every fuel item", () => {
    const missing = [...FUEL_ITEMS]
      .filter((id) => !Number.isFinite(VALUE[id]))
      .map((id) => `fuel item ${id} (${NAME[id]}) has no economy value`);
    expect(missing).toEqual([]);
  });
});

describe("recipes never create value", () => {
  it("never nets positive value (potential function ΔV <= 0 for every recipe)", () => {
    const violations: string[] = [];
    for (const flow of FLOWS) {
      let inputValue = 0;
      const parts: string[] = [];
      for (const [id, n] of flow.inputs) {
        inputValue += VALUE[id] * n;
        parts.push(`${n}×${NAME[id]}(${VALUE[id]})`);
      }
      if (flow.kind === "smelt") {
        inputValue += cheapestFuel;
        parts.push(`fuel(${cheapestFuel})`);
      }
      const outputValue = VALUE[flow.output] * flow.count;
      if (inputValue + 1e-9 < outputValue) {
        const delta = outputValue - inputValue;
        violations.push(
          `[${flow.kind}] ${flow.name}: ${parts.join(" + ")} = ${inputValue} < ${flow.count}×${NAME[flow.output]}(${VALUE[flow.output]}) = ${outputValue} (+${delta})`
        );
      }
    }
    expect(violations).toEqual([]);
  });

  it("never outputs an objective block", () => {
    const objective = new Set(
      BLOCK_DEFINITIONS.filter((d) => d.special === "crystal_shard").map((d) => d.id)
    );
    const violations = FLOWS.filter((f) => objective.has(f.output)).map(
      (f) => `[${f.kind}] ${f.name} outputs objective block ${NAME[f.output]}`
    );
    expect(violations).toEqual([]);
  });

  it("smelts diamond ore", () => {
    expect(findSmeltingRecipe(BLOCK_ID.DIAMOND_ORE)?.result).toBe(BLOCK_ID.DIAMOND);
  });
});

/** A single-ingredient production edge, table-independent (no VALUE reference). */
interface Edge {
  from: number;
  to: number;
  name: string;
  n: number;
  count: number;
}

/**
 * Edges only from flows with exactly one distinct input id: single-ingredient
 * crafting recipes, plus every smelting flow with fuel ignored (conservative,
 * since fuel is near-free). Multi-input recipes deliberately contribute no
 * edge here — a per-input count ratio is only meaningful when nothing else is
 * consumed, so the value-potential test above is what covers them.
 */
const EDGES: Edge[] = FLOWS.filter((f) => f.inputs.size === 1).map((f) => {
  const [[from, n]] = [...f.inputs];
  return { from, to: f.output, name: f.name, n, count: f.count };
});

/** Simple cycles by DFS from each start node, pruned to `to >= start` so each cycle is found once. */
function findPositiveCycles(edges: Edge[]): string[] {
  const byFrom = new Map<number, Edge[]>();
  for (const e of edges) {
    const arr = byFrom.get(e.from) ?? [];
    arr.push(e);
    byFrom.set(e.from, arr);
  }
  const violations: string[] = [];
  const starts = [...new Set(edges.map((e) => e.from))];
  for (const start of starts) {
    const path: Edge[] = [];
    const onStack = new Set<number>([start]);
    const walk = (node: number, product: number) => {
      for (const e of byFrom.get(node) ?? []) {
        if (e.to < start) continue;
        const nextProduct = product * (e.count / e.n);
        if (e.to === start) {
          if (nextProduct > 1 + 1e-9) {
            const full = [...path, e];
            violations.push(
              `×${nextProduct.toFixed(3)}: ${full
                .map((pe) => `${NAME[pe.from]} -[${pe.name} ${pe.n}→${pe.count}]-> ${NAME[pe.to]}`)
                .join("; ")}`
            );
          }
          continue;
        }
        if (onStack.has(e.to)) continue;
        onStack.add(e.to);
        path.push(e);
        walk(e.to, nextProduct);
        path.pop();
        onStack.delete(e.to);
      }
    };
    walk(start, 1);
  }
  return violations;
}

describe("recipe flow graph", () => {
  it("has no net-positive single-ingredient cycle", () => {
    expect(findPositiveCycles(EDGES)).toEqual([]);
  });
});
