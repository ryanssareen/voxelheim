import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { WorldMeta } from "@systems/persistence/WorldStorage";

const store = new Map<string, WorldMeta>();

vi.mock("@systems/persistence/WorldStorage", () => ({
  loadWorldMeta: async (id: string) => store.get(id) ?? null,
  saveWorld: async (meta: WorldMeta) => void store.set(meta.id, meta),
}));

import {
  DEMO_WORLD_ID,
  DEMO_WORLD_SEED,
  ensureDemoWorld,
} from "@lib/demoWorld";

beforeEach(() => {
  store.clear();
  (globalThis as { window?: unknown }).window = {
    sessionStorage: { setItem: () => {} },
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("ensureDemoWorld", () => {
  // Covers AE1.
  it("creates the demo record on first call with the fixed seed", async () => {
    const id = await ensureDemoWorld();
    expect(id).toBe(DEMO_WORLD_ID);
    expect(store.get(DEMO_WORLD_ID)?.seed).toBe(DEMO_WORLD_SEED);
  });

  // Covers AE1 — a returning visitor must not lose their block changes.
  it("does not overwrite an existing demo record", async () => {
    await ensureDemoWorld();
    const first = store.get(DEMO_WORLD_ID)!;
    store.set(DEMO_WORLD_ID, { ...first, shardsCollected: 3 });

    await ensureDemoWorld();

    expect(store.get(DEMO_WORLD_ID)?.shardsCollected).toBe(3);
  });

  it("produces an identical seed and world type for two fresh visitors", async () => {
    await ensureDemoWorld();
    const a = store.get(DEMO_WORLD_ID)!;
    store.clear();
    await ensureDemoWorld();
    const b = store.get(DEMO_WORLD_ID)!;

    expect(a.seed).toBe(b.seed);
    expect(a.worldType).toBe(b.worldType);
  });

  it("creates an island world with a spawn inside the island footprint", async () => {
    await ensureDemoWorld();
    const meta = store.get(DEMO_WORLD_ID)!;

    expect(meta.worldType).toBe("island");
    expect(meta.islandSize).toBeGreaterThan(0);
    expect(meta.playerPos.x).toBeGreaterThan(0);
    expect(meta.playerPos.x).toBeLessThan(meta.islandSize!);
    expect(meta.playerPos.z).toBeLessThan(meta.islandSize!);
  });
});
