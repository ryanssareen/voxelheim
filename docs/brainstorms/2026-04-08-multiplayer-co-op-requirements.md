---
date: 2026-04-08
topic: multiplayer-co-op
---

# Multiplayer Co-op Survival

## Problem Frame

Voxelheim is a single-player voxel sandbox. Players who want to mine, build, and survive with friends have no way to do so. The game has Firebase auth (accounts exist), a 3rd-person player model, and per-chunk block modification tracking -- but zero networking. Adding 2-4 player real-time co-op via Firebase Realtime Database would be the single most transformative feature for engagement and replayability.

## Requirements

**Session Management**

- R1. A player can create a multiplayer session from their existing world, generating a shareable join code (6-character alphanumeric).
- R2. Other authenticated players can join a session by entering the join code. The host's world loads for all players.
- R3. The host player is authoritative for mob AI, item drops, and world persistence (saves to IndexedDB). Terrain generation is deterministic from seed, so guests generate locally and get identical results. The host is the source of truth for any conflict.
- R4. Sessions support 2-4 simultaneous players.
- R5. When the host leaves or disconnects (no heartbeat for 10 seconds), the session ends for all players with a "Host disconnected" message. Guests return to the menu.

**Player Synchronization**

- R6. Each player's position, rotation (yaw/pitch), and held item are synced to all other players at ~10 updates/second via Firebase RTDB.
- R7. Remote players render using the existing PlayerModel (3rd-person Steve model) at their synced position and rotation.
- R8. Remote player names display above their model.
- R9. Player movement interpolation smooths between sync updates to avoid jittering.

**World Synchronization**

- R10. When any player places or breaks a block, the change is broadcast to all players via Firebase RTDB and applied immediately.
- R11. Guests generate terrain locally from the host's seed. On join, the host sends its block modification log (chunk key -> Uint8Array deltas). Guests apply these over their local generation. During play, new block changes sync in real-time via R10.
- R12. Block changes are throttled to prevent exceeding Firebase RTDB bandwidth limits (target: <50 block changes/second across all players).

**Mob Synchronization**

- R13. The host runs all mob AI (MobManager). Mob positions, health, and death states are broadcast to guests at ~5 updates/second.
- R14. Guests render mobs at synced positions with interpolation.
- R15. When a guest attacks a mob, the hit event is sent to the host, which applies damage and broadcasts the result.
- R16. Mob aggro, pathfinding, and spawning remain host-authoritative.

**Combat & Interaction**

- R17. The host runs all proximity checks for mob attacks using guest positions (received via R6 at ~10/sec). When a mob is close enough to attack a guest, the host sends a damage event to that guest.
- R18. Each player owns their own health, hunger, and inventory locally. These are not synced to other players or the host. Only visible state (position, held item) is shared.
- R19. Item drops are host-authoritative. The host spawns drops and broadcasts their positions. When any player walks over a drop, their client sends a pickup request to the host. The host grants it to the first valid request and broadcasts removal to all clients.

**UI & UX**

- R20. The host enables multiplayer from the in-game pause menu via an "Open to Multiplayer" toggle. This generates a 6-character join code and a shareable URL (e.g., voxelheim.vercel.app/join/ABC123). Both display with a copy button.
- R21. Guests can join via a "Join Game" button on the main menu (enter code) OR by navigating directly to the shareable URL.
- R22. Guests spawn within 5-10 blocks of the host's current position on join.
- R23. If a guest disconnects (page refresh, network drop), they can rejoin the same session via code or URL while it's still active. They re-spawn near the host.
- R24. An in-game player list (Tab key) shows connected player names and ping.
- R25. A simple text chat (T key to open, Enter to send) allows communication between players.

## Success Criteria

- Two players on different devices can join the same world, see each other, and place/break blocks that both see in real-time.
- Mobs attack and are attacked by both players with consistent state.
- Latency under 300ms for block changes and player movement on typical home internet.
- Session creation and joining works without port forwarding or technical setup.

## Scope Boundaries

- No PvP (players cannot damage each other) in MVP.
- No voice chat.
- No shared inventory or chest access between players.
- No dedicated server -- host player must be online.
- No player authentication beyond existing Firebase auth.
- No world transfer (guests cannot become host).
- No anti-cheat or guest validation beyond Firebase auth.
- Mob AI complexity unchanged -- host runs existing MobManager, guests see the result.

## Key Decisions

- **Firebase RTDB over WebRTC:** Simpler implementation, works through all firewalls/NATs, acceptable latency for co-op voxel. WebRTC can be added later as optimization if latency matters.
- **Host-authoritative model:** One player's client is the source of truth for world state, mobs, and terrain. Avoids complex conflict resolution. Tradeoff: host has advantage (zero latency), guests have slight delay.
- **Hybrid chunk sync:** Guests generate terrain locally from the host's seed. On join, the host sends its accumulated modification log. During play, only real-time block changes sync. This minimizes bandwidth while keeping worlds consistent.
- **MVP scope: See + Build + Fight:** Includes player sync, block sync, and mob sync. Defers shared drops priority, shared crafting table access, and PvP to future phases.

## Dependencies / Assumptions

- Firebase Realtime Database must be enabled on the existing Firebase project (currently only Auth is configured).
- Firebase RTDB free tier (1GB stored, 10GB/month transferred, 100 simultaneous connections) is sufficient for 2-4 player sessions.
- All players must have Voxelheim accounts (Firebase auth).

## Outstanding Questions

### Deferred to Planning

- [Affects R6][Needs research] What Firebase RTDB structure minimizes read/write costs while supporting ~10 position updates/sec per player?
- [Affects R12][Technical] What throttling strategy prevents burst block changes from exceeding Firebase bandwidth? Batching? Rate limiting per player?
- [Affects R9, R14][Needs research] What interpolation approach works best for Three.js player/mob rendering at 10 updates/sec? Linear lerp vs hermite?
- [Affects R13][Technical] Can mob state be delta-compressed (only send changed mobs) to reduce host bandwidth?
- [Affects R1][Technical] How should join codes map to Firebase RTDB paths? Direct ID vs lookup table?

## Implementation Status (updated 2026-04-09)

**Foundation landed in PR #1 (merged 2026-04-09):**

| Req | Status | Notes |
|-----|--------|-------|
| R1 | Done | Session creation from create-world page + worlds list. 6-char codes. |
| R2 | Done | Join by code from worlds page. |
| R3 | Partial | Host saves to IndexedDB + syncs world state. Mob AI not synced yet. |
| R4 | Done | No hard player limit enforced, but architecture supports it. |
| R5 | Not started | No heartbeat/disconnect detection yet. |
| R6 | Partial | Position, rotation, crouching synced at ~8/sec. Held item not synced. |
| R7 | Done | Remote PlayerModel with hash-colored clothing. |
| R8 | Done | Canvas-based nametag sprites above remote players. |
| R9 | Done | Exponential lerp interpolation (POSITION_LERP=12, ROTATION_LERP=14). |
| R10 | Done | Block changes broadcast via Firestore/BroadcastChannel, deduped by timestamp. |
| R11 | Done | Host sends world state (chunk modifications) on session create. Guests apply on join. |
| R12 | Not started | No throttling on block changes yet. |
| R13-R16 | Not started | Mob sync not implemented. |
| R17 | Not started | Combat events not synced. |
| R18 | Done | Health/hunger/inventory are local per client. |
| R19 | Done | Drop spawn/claim/pickup protocol with network handlers. |
| R20 | Partial | Host from create-world or worlds list. No in-game toggle. No shareable URL. |
| R21 | Partial | Join by code on worlds page. No direct URL join. |
| R22 | Not started | Guests spawn at world default, not near host. |
| R23 | Not started | No reconnection support. |
| R24 | Not started | No Tab player list. |
| R25 | Not started | No text chat. |

**Transport:** Firestore (cloud) with BroadcastChannel (local) fallback — not Firebase RTDB as originally planned. Firestore chosen by implementation for simpler document model.

## Next Steps

-> Continue with mob sync (R13-R16), host disconnect detection (R5), held item sync (R6), and UI polish
