---
title: "Recipe Value Invariant: A Potential-Function Test That Fails on Any Value-Creating Recipe"
date: 2026-09-04
category: best-practices
module: systems-crafting
problem_type: best_practice
component: crafting
severity: high
applies_when:
  - "Adding or editing any entry in RECIPES, RECIPES_3x3, or SMELTING_RECIPES"
  - "Adding a new block id (the value table must price it)"
  - "Deciding whether a crafting loop is an exploit"
tags:
  - economy
  - crafting
  - invariant-test
  - potential-function
---

# Recipe Value Invariant

## Context

Recipes were added by hand across several commits with nothing constraining
output against input. That shipped a literal doubler (3 planks -> 6 planks),
leaves -> log (leaves fall off every tree, so wood was unbounded), five recipes
that manufactured the objective block CRYSTAL from stone, and a table bulk
recipe that returned twice its inputs. Individually each edit is trivial; the
durable fix is the test.

## The invariant

Assign every block id an abstract value (`VALUE` in
`src/tests/economy.test.ts`; the table also lives in
`docs/plans/2026-09-03-001-remediation-contract.md`). For every recipe,
`sum(value(input) * count) >= value(output) * count`. Smelting counts the
input plus the cheapest fuel. Because total inventory value is then a
potential that no recipe can raise, no sequence of recipes, including cycles,
can create value. A second, table-independent check walks single-ingredient
edges by count ratio and rejects any cycle whose product exceeds 1, so a
mispriced table still cannot hide a doubler.

Two more data-driven guards ride along: no recipe may output a block whose
definition has `special === "crystal_shard"` (the objective), and every
`BLOCK_ID`, recipe output, and fuel must be priced.

## How to apply

- Price a new block before adding recipes for it; the hygiene test names the
  unpriced id.
- When the invariant test fails it prints the recipe, its inputs, the delta,
  and the cycle path. Reprice or remove; do not weaken the table to fit.
- Pickaxe-bypass recipes (stone from sand or planks without a tool) are
  value-neutral and pass this test. Progression is guarded separately by the
  reachability fixpoint in `src/tests/toolTiers.test.ts`, which also requires a
  furnace to be owned before any smelt counts.
- Shovels and swords use fewer materials than pickaxes; price each tool at its
  own input sum rather than copying the pickaxe row.
