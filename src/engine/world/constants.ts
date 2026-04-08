/** Number of blocks along each axis of a chunk. */
export const CHUNK_SIZE = 16;

/** Total number of blocks in a chunk (16^3). */
export const CHUNK_VOLUME = 4096;

/** Number of chunks along each horizontal axis of the world. */
export const WORLD_SIZE_CHUNKS = 4;

/** Number of chunks along the vertical axis of the world. */
export const WORLD_HEIGHT_CHUNKS = 4;

/** Total blocks along each horizontal axis (WORLD_SIZE_CHUNKS * CHUNK_SIZE). */
export const WORLD_SIZE_BLOCKS = 64;

/** Total blocks along the vertical axis (WORLD_HEIGHT_CHUNKS * CHUNK_SIZE). */
export const WORLD_HEIGHT_BLOCKS = 64;

/** Y-level of the sea surface for terrain generation. */
export const SEA_LEVEL = 20;

/** Number of crystal shards placed per world generation pass. */
export const CRYSTAL_SHARD_COUNT = 5;

/** Minimum depth below surface at which crystal shards can spawn. */
export const CRYSTAL_MIN_DEPTH = 4;

/** Number of vertical chunk layers for infinite worlds (128 blocks). */
export const WORLD_HEIGHT_CHUNKS_INFINITE = 8;

/** Max ms per frame allowed for chunk generation work. */
export const CHUNK_GEN_BUDGET_MS = 4;

/** Max ms per frame allowed for mesh building work. */
export const CHUNK_MESH_BUDGET_MS = 3;

/** Supported world generation types. */
export type WorldType = "island" | "flat" | "infinite";
