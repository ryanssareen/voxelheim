/**
 * Converts world coordinates to chunk coordinates.
 * Each chunk spans 16 blocks along every axis.
 */
export function worldToChunk(
  wx: number,
  wy: number,
  wz: number
): { cx: number; cy: number; cz: number } {
  return {
    cx: Math.floor(wx / 16),
    cy: Math.floor(wy / 16),
    cz: Math.floor(wz / 16),
  };
}

/**
 * Converts world coordinates to local (intra-chunk) coordinates.
 * Always returns values in [0, 15]. Handles negative world coords correctly.
 */
export function worldToLocal(
  wx: number,
  wy: number,
  wz: number
): { lx: number; ly: number; lz: number } {
  return {
    lx: ((wx % 16) + 16) % 16,
    ly: ((wy % 16) + 16) % 16,
    lz: ((wz % 16) + 16) % 16,
  };
}

/**
 * Flattens local (lx, ly, lz) coordinates into a 1D array index.
 * Layout: X varies fastest, then Z, then Y (vertical slices contiguous).
 */
export function localToIndex(lx: number, ly: number, lz: number): number {
  return lx + lz * 16 + ly * 256;
}

/**
 * Expands a flat array index back into local (lx, ly, lz) coordinates.
 * Inverse of {@link localToIndex}.
 */
export function indexToLocal(index: number): {
  lx: number;
  ly: number;
  lz: number;
} {
  return {
    lx: index % 16,
    lz: Math.floor(index / 16) % 16,
    ly: Math.floor(index / 256),
  };
}

/**
 * Returns a deterministic string key for a chunk position,
 * suitable for use as a Map/Object key.
 */
export function chunkKey(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`;
}
