/**
 * A* pathfinder for mobs on a 2D XZ grid with Y awareness.
 * 4-directional, max 200 nodes, 16-block search radius.
 * Can step up +1 block and drop down -1/-2 blocks.
 */

interface PathNode {
  x: number;
  z: number;
  y: number;
  g: number;
  f: number;
  parentKey: string | null;
}

type GetBlock = (x: number, y: number, z: number) => number;
type IsSolid = (blockId: number) => boolean;

const MAX_NODES = 200;
const MAX_RADIUS = 16;
const NEIGHBORS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function nodeKey(x: number, z: number): string {
  return `${x},${z}`;
}

/**
 * Find the ground Y at column (x, z) near reference Y.
 * Scans downward from refY+2 to refY-3 to find the top of the highest solid block.
 * Returns the Y where a mob would stand (top of solid block), or null if no ground.
 */
function resolveY(
  x: number,
  z: number,
  refY: number,
  getBlock: GetBlock,
  isSolid: IsSolid
): number | null {
  const scanTop = Math.floor(refY) + 2;
  const scanBottom = Math.floor(refY) - 3;
  for (let y = scanTop; y >= scanBottom; y--) {
    if (isSolid(getBlock(x, y, z))) {
      return y + 1; // stand on top of this block
    }
  }
  return null;
}

/**
 * Check if a mob (2 blocks tall) can stand at (x, standY, z).
 * The two blocks at standY and standY+1 must be non-solid.
 */
function isPassable(
  x: number,
  standY: number,
  z: number,
  getBlock: GetBlock,
  isSolid: IsSolid
): boolean {
  return !isSolid(getBlock(x, standY, z)) && !isSolid(getBlock(x, standY + 1, z));
}

export interface PathPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Find a path from start to goal using A* on the XZ plane.
 * Returns an array of waypoints (centered in blocks) or null if no path.
 */
export function findPath(
  startX: number,
  startY: number,
  startZ: number,
  goalX: number,
  goalY: number,
  goalZ: number,
  getBlock: GetBlock,
  isSolid: IsSolid
): PathPoint[] | null {
  const sx = Math.floor(startX);
  const sz = Math.floor(startZ);
  const gx = Math.floor(goalX);
  const gz = Math.floor(goalZ);

  const sY = resolveY(sx, sz, startY, getBlock, isSolid);
  if (sY === null) return null;

  const startKey = nodeKey(sx, sz);
  const goalKey = nodeKey(gx, gz);

  const heuristic = (x: number, z: number) => Math.abs(x - gx) + Math.abs(z - gz);

  const startNode: PathNode = {
    x: sx, z: sz, y: sY,
    g: 0, f: heuristic(sx, sz),
    parentKey: null,
  };

  const open: PathNode[] = [startNode];
  const allNodes = new Map<string, PathNode>();
  allNodes.set(startKey, startNode);
  const closed = new Set<string>();

  let expanded = 0;

  while (open.length > 0 && expanded < MAX_NODES) {
    // Pop node with lowest f (simple linear scan — fast for small N)
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const current = open[bestIdx];
    open.splice(bestIdx, 1);

    const currentKey = nodeKey(current.x, current.z);
    if (currentKey === goalKey) {
      return reconstructPath(current, allNodes);
    }

    closed.add(currentKey);
    expanded++;

    for (const [dx, dz] of NEIGHBORS) {
      const nx = current.x + dx;
      const nz = current.z + dz;
      const nKey = nodeKey(nx, nz);

      if (closed.has(nKey)) continue;

      // Radius check from start
      if (Math.abs(nx - sx) > MAX_RADIUS || Math.abs(nz - sz) > MAX_RADIUS) continue;

      const nY = resolveY(nx, nz, current.y, getBlock, isSolid);
      if (nY === null) continue; // no ground (cliff/void)

      // Check height difference
      const dy = nY - current.y;
      let moveCost: number;
      if (dy === 0) {
        moveCost = 1.0;
      } else if (dy === 1) {
        // Step up — need headroom at the higher level
        if (!isPassable(nx, nY, nz, getBlock, isSolid)) continue;
        moveCost = 1.5;
      } else if (dy === -1) {
        moveCost = 1.0;
      } else if (dy === -2) {
        moveCost = 1.2;
      } else {
        continue; // too steep
      }

      // Check body space is clear at destination
      if (dy !== 1 && !isPassable(nx, nY, nz, getBlock, isSolid)) continue;

      const newG = current.g + moveCost;
      const existing = allNodes.get(nKey);
      if (existing && existing.g <= newG) continue;

      const node: PathNode = {
        x: nx, z: nz, y: nY,
        g: newG, f: newG + heuristic(nx, nz),
        parentKey: currentKey,
      };
      allNodes.set(nKey, node);

      // Add to open list (or it's already there with worse g and will be skipped)
      if (!existing || closed.has(nKey)) {
        open.push(node);
      } else {
        // Update in-place in open list
        const idx = open.indexOf(existing);
        if (idx >= 0) open[idx] = node;
        else open.push(node);
      }
    }
  }

  return null; // no path found
}

function reconstructPath(
  goal: PathNode,
  allNodes: Map<string, PathNode>
): PathPoint[] {
  const path: PathPoint[] = [];
  let current: PathNode | undefined = goal;
  while (current) {
    path.push({ x: current.x + 0.5, y: current.y, z: current.z + 0.5 });
    current = current.parentKey ? allNodes.get(current.parentKey) : undefined;
  }
  path.reverse();
  // Skip first node (it's where we already are)
  return path.slice(1);
}

/**
 * Find the nearest column with a solid block overhead (shade/cover).
 * Searches in a spiral pattern from the mob's position.
 */
export function findNearestCover(
  startX: number,
  startY: number,
  startZ: number,
  getBlock: GetBlock,
  isSolid: IsSolid
): PathPoint | null {
  const sx = Math.floor(startX);
  const sy = Math.floor(startY);
  const sz = Math.floor(startZ);

  // Spiral search up to 12 blocks
  for (let r = 1; r <= 12; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue; // only ring
        const cx = sx + dx;
        const cz = sz + dz;

        // Check if there's a roof above this column
        const groundY = resolveY(cx, cz, startY, getBlock, isSolid);
        if (groundY === null) continue;

        // Check for solid block above head (within 4 blocks)
        let hasCover = false;
        for (let above = groundY + 2; above <= groundY + 5; above++) {
          if (isSolid(getBlock(cx, above, cz))) {
            hasCover = true;
            break;
          }
        }
        if (hasCover && isPassable(cx, groundY, cz, getBlock, isSolid)) {
          return { x: cx + 0.5, y: groundY, z: cz + 0.5 };
        }
      }
    }
  }
  return null;
}
