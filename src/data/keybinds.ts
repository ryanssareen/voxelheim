export interface KeybindGroup {
  title: string;
  binds: ReadonlyArray<{ keys: string; action: string }>;
}

/** Mirrors the handlers in PlayerController, Engine, HUD and MinimapUI. */
export const KEYBIND_GROUPS: ReadonlyArray<KeybindGroup> = [
  {
    title: "Moving",
    binds: [
      { keys: "W A S D", action: "Walk" },
      { keys: "Arrows", action: "Walk" },
      { keys: "Space", action: "Jump / fly up" },
      { keys: "Shift", action: "Sprint / fly faster" },
      { keys: "Ctrl / CapsLock", action: "Sneak / fly down" },
      { keys: "Double-tap Space", action: "Toggle flying (creative)" },
      { keys: "Mouse", action: "Look around" },
    ],
  },
  {
    title: "Building",
    binds: [
      { keys: "Left click", action: "Break block" },
      { keys: "Right click", action: "Place block" },
      { keys: "1 - 9", action: "Pick hotbar slot" },
      { keys: "E", action: "Inventory" },
      { keys: "Q", action: "Drop held item" },
    ],
  },
  {
    title: "View",
    binds: [
      { keys: "V", action: "Zoom" },
      { keys: "P", action: "Change camera" },
      { keys: "M", action: "Toggle minimap" },
      { keys: "T", action: "Chat" },
      { keys: "F3", action: "Debug info" },
      { keys: "Esc", action: "Pause" },
    ],
  },
];
