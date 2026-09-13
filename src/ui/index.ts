// Design-system barrel for the Claude Design sync.
// Game UI panels (HUD, Inventory, Hotbar, crafting/furnace, chat, overlays).
// GameCanvas is intentionally excluded — it mounts a WebGL/Three.js engine and
// cannot render statically.

export { ItemIcon, DurabilityBar, InventorySlot, ITEM_COLORS, FOOD_IDS } from "./ItemIcon";
export { LoadingScreen } from "./LoadingScreen";
export { HUD } from "./HUD";
export { HotbarUI } from "./HotbarUI";
export { InventoryUI } from "./InventoryUI";
export { CraftingTableUI } from "./CraftingTableUI";
export { FurnaceUI } from "./FurnaceUI";
export { CreativeInventoryUI } from "./CreativeInventoryUI";
export { ChatUI } from "./ChatUI";
export { MinimapUI } from "./MinimapUI";
export { TouchControls } from "./TouchControls";

// NOTE: AuthLayout (next/link), DeathScreen and PauseMenu (next/navigation) are
// intentionally excluded. The Next.js runtime modules they import reference
// process.env.__NEXT_* at module-eval time, which throws "process is not defined"
// in the static browser bundle and takes the whole IIFE down. They are router-
// coupled overlays that render null from default store state anyway.
