import { beforeEach, describe, expect, it } from "vitest";
import { createSessionCode, isLocalSessionCode, normalizeSessionCode } from "@lib/multiplayer/sessionCode";
import { useMultiplayerStore } from "@store/useMultiplayerStore";

describe("multiplayer session codes", () => {
  it("normalizes user-entered codes", () => {
    expect(normalizeSessionCode("  ab12cd  ")).toBe("AB12CD");
  });

  it("marks local fallback codes with the local prefix", () => {
    const code = createSessionCode(true);
    expect(isLocalSessionCode(code)).toBe(true);
    expect(code.startsWith("L-")).toBe(true);
  });

  it("keeps cloud codes prefix-free", () => {
    const code = createSessionCode(false);
    expect(isLocalSessionCode(code)).toBe(false);
    expect(code).toHaveLength(6);
  });
});

describe("useMultiplayerStore", () => {
  beforeEach(() => {
    useMultiplayerStore.getState().reset();
  });

  it("tracks a connected multiplayer session", () => {
    useMultiplayerStore.getState().beginConnecting();
    useMultiplayerStore.getState().setConnected({
      code: "ABC123",
      seed: "voxelheim",
      worldType: "island",
      worldName: "Island",
      hostName: "ryan",
      createdAt: 123,
      transport: "cloud",
    });

    expect(useMultiplayerStore.getState().status).toBe("connected");
    expect(useMultiplayerStore.getState().session?.code).toBe("ABC123");
    expect(useMultiplayerStore.getState().transport).toBe("cloud");
  });

  it("stores the current player roster", () => {
    useMultiplayerStore.getState().setPlayers([
      {
        playerId: "a",
        name: "Host",
        x: 1,
        y: 2,
        z: 3,
        yaw: 0,
        pitch: 0,
        isCrouching: false,
        updatedAt: 100,
      },
      {
        playerId: "b",
        name: "Guest",
        x: 4,
        y: 5,
        z: 6,
        yaw: 0,
        pitch: 0,
        isCrouching: true,
        updatedAt: 110,
      },
    ]);

    expect(useMultiplayerStore.getState().players).toHaveLength(2);
    expect(useMultiplayerStore.getState().players[1].name).toBe("Guest");
  });
});
