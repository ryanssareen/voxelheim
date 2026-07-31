import { NAME_ADJECTIVES, NAME_NOUNS } from "@data/playerNames";
import { useAuthStore } from "@store/useAuthStore";

export const PLAYER_ID_STORAGE_KEY = "voxelheim-multiplayer-player-id";
export const PLAYER_NAME_STORAGE_KEY = "voxelheim-player-name";
export const MAX_PLAYER_NAME_LENGTH = 16;

const OFFLINE_PLAYER_ID = "offline-player";

/**
 * FNV-1a followed by a murmur3 finalizer. The avalanche step matters: name
 * indices are taken mod 32, and raw FNV low bits cluster badly for short
 * similar inputs like sequential guest ids.
 */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * Per-tab fallback so a denied or failing localStorage degrades to a stable id
 * for the session instead of minting a new one on every call.
 */
let cachedGuestId: string | null = null;

/** Test-only: clears the per-tab cache so cases start from a known state. */
export function __resetIdentityCache() {
  cachedGuestId = null;
}

function readStoredGuestId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PLAYER_ID_STORAGE_KEY);
  } catch {
    // Blocked site data or a sandboxed iframe throws on mere access.
    return null;
  }
}

/**
 * Stable identifier for this player. Prefers the auth uid when signed in, and
 * otherwise uses a local-only `guest-` id that never leaves the device.
 *
 * Pass `persist` on the first action that needs a durable identity (creating a
 * world, hosting or joining a session). Display-only callers leave it false so
 * merely loading the page writes nothing.
 */
export function resolvePlayerId(persist = false): string {
  const authUser = useAuthStore.getState().user;
  if (authUser?.uid) return authUser.uid;

  if (typeof window === "undefined") return OFFLINE_PLAYER_ID;

  const stored = readStoredGuestId();
  if (stored) {
    cachedGuestId = stored;
    return stored;
  }

  if (!cachedGuestId) {
    cachedGuestId = `guest-${Math.random().toString(36).slice(2, 10)}`;
  }
  if (persist) {
    try {
      window.localStorage.setItem(PLAYER_ID_STORAGE_KEY, cachedGuestId);
    } catch {}
  }
  return cachedGuestId;
}

/**
 * Deterministic adjective-noun name derived from the player id, so the same
 * browser always renders the same name without storing a second value.
 */
export function generateName(playerId: string): string {
  const hash = hashString(playerId);
  const adjective = NAME_ADJECTIVES[hash % NAME_ADJECTIVES.length];
  const noun = NAME_NOUNS[hashString(`${playerId}:noun`) % NAME_NOUNS.length];
  return `${adjective}${noun}`.slice(0, MAX_PLAYER_NAME_LENGTH);
}

export function readPlayerNameOverride(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY);
    const trimmed = raw?.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Stores a display-name override. An empty or whitespace-only value clears it,
 * restoring the generated name.
 */
export function writePlayerNameOverride(name: string): string | null {
  const trimmed = name.trim().slice(0, MAX_PLAYER_NAME_LENGTH);
  if (typeof window === "undefined") return trimmed || null;
  try {
    if (trimmed) {
      window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, trimmed);
    } else {
      window.localStorage.removeItem(PLAYER_NAME_STORAGE_KEY);
    }
  } catch {}
  return trimmed || null;
}

/** Display name for this player: the override when set, otherwise generated. */
export function resolvePlayerName(persist = false): string {
  return readPlayerNameOverride() ?? generateName(resolvePlayerId(persist));
}
