import { openDB, type IDBPDatabase } from "idb";

export interface WorldMeta {
  id: string;
  name: string;
  seed: string;
  createdAt: number;
  lastPlayedAt: number;
  playerPos: { x: number; y: number; z: number };
  playerYaw: number;
  playerPitch: number;
  shardsCollected: number;
  hotbarSlots: Array<{ blockId: number; count: number }>;
  health?: number;
  hunger?: number;
  worldType?: string;
  gameMode?: "survival" | "creative";
}

interface ChunkRecord {
  worldId: string;
  chunkKey: string;
  data: Uint8Array;
}

const DB_NAME = "voxelheim-db";
const DB_VERSION = 1;

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("worlds")) {
        db.createObjectStore("worlds", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("chunks")) {
        const store = db.createObjectStore("chunks", {
          keyPath: ["worldId", "chunkKey"],
        });
        store.createIndex("byWorld", "worldId");
      }
    },
  });
}

/** Save world metadata and modified chunk data. */
export async function saveWorld(
  meta: WorldMeta,
  modifiedChunks: Map<string, Uint8Array>
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["worlds", "chunks"], "readwrite");
  await tx.objectStore("worlds").put({ ...meta, lastPlayedAt: Date.now() });

  const chunkStore = tx.objectStore("chunks");
  for (const [key, data] of modifiedChunks) {
    await chunkStore.put({
      worldId: meta.id,
      chunkKey: key,
      data: new Uint8Array(data),
    } as ChunkRecord);
  }
  await tx.done;
}

/** Load world metadata. Returns null if not found. */
export async function loadWorldMeta(
  worldId: string
): Promise<WorldMeta | null> {
  const db = await getDB();
  const meta = await db.get("worlds", worldId);
  return (meta as WorldMeta) ?? null;
}

/** Load modified chunk data for a world. */
export async function loadWorldChunks(
  worldId: string
): Promise<Map<string, Uint8Array>> {
  const db = await getDB();
  const tx = db.transaction("chunks", "readonly");
  const index = tx.objectStore("chunks").index("byWorld");
  const records = await index.getAll(worldId);
  await tx.done;

  const result = new Map<string, Uint8Array>();
  for (const rec of records) {
    const r = rec as ChunkRecord;
    result.set(r.chunkKey, new Uint8Array(r.data));
  }
  return result;
}

/** List all saved worlds, sorted by last played. */
export async function listWorlds(): Promise<WorldMeta[]> {
  const db = await getDB();
  const all = (await db.getAll("worlds")) as WorldMeta[];
  return all.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
}

/** Delete a world and all its chunk data. */
export async function deleteWorld(worldId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["worlds", "chunks"], "readwrite");
  await tx.objectStore("worlds").delete(worldId);

  const chunkStore = tx.objectStore("chunks");
  const index = chunkStore.index("byWorld");
  const keys = await index.getAllKeys(worldId);
  for (const key of keys) {
    await chunkStore.delete(key);
  }
  await tx.done;
}

/** Generate a simple unique ID. */
export function generateWorldId(): string {
  return `world-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
