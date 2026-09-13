import { test, expect, type Page } from "@playwright/test";

/**
 * Plays Voxelheim through the real homepage Play button in a real Chromium
 * (via CDP), asserting against the dev-only `window.__test` debug hook rather
 * than screenshots — see docs/plans/2026-09-08-001-feat-playwright-e2e-macro-plan.md.
 *
 * Accommodations for automated Chromium environments, discovered while
 * building this macro:
 *
 * 1. `requestPointerLock()` can be refused outright (observed here as a
 *    `WrongDocumentError`, reproducible even on a bare page with no app code
 *    involved) and can also flicker (briefly toggle `pointerLockElement`
 *    before failing), which the app reads as "lock lost" and pauses on.
 *    Mouse-look itself is gated behind lock in `src/engine/InputManager.ts`,
 *    so with no real lock there's no way to aim by moving the mouse either.
 *    `window.__test.setLook()` sets aim directly instead, and every wait loop
 *    below clicks "Resume" whenever it observes the game paused.
 * 2. The demo island's terrain is not flat near spawn (slopes and drop-offs),
 *    so aiming downward at an arbitrary angle can target a block on a cliff
 *    edge — breaking it lets the drop fall out of item-pickup range before
 *    it can be collected. The yaw/pitch below was found by scanning several
 *    angles from the deterministic demo-world spawn point for one that hits
 *    a block one pace away on level ground; it is specific to this seed's
 *    spawn, not a general-purpose look direction.
 */

const SAFE_LOOK_YAW = 3.2;
const SAFE_LOOK_PITCH = -0.4;

type E2EState = {
  position: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  isPaused: boolean;
  heldItem: { blockId: number; count: number } | null;
  hotbar: Array<{ blockId: number; count: number } | null>;
  inventory: Array<{ blockId: number; count: number } | null>;
  targetedBlock: { blockId: number; x: number; y: number; z: number } | null;
};

declare global {
  interface Window {
    __test?: {
      getState: () => E2EState;
      setLook: (yaw: number, pitch: number) => void;
    };
  }
}

async function getState(page: Page): Promise<E2EState> {
  return page.evaluate(() => {
    if (!window.__test) throw new Error("window.__test is not installed — is NODE_ENV production?");
    return window.__test.getState();
  });
}

/** Clicks Resume if the game is paused. Never throws when there's nothing to resume. */
async function resumeIfPaused(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Resume" })
    .click({ timeout: 500 })
    .catch(() => {});
}

async function waitForState(
  page: Page,
  predicate: (s: E2EState) => boolean,
  message: string,
  timeoutMs = 15_000
): Promise<E2EState> {
  const start = Date.now();
  for (;;) {
    const s = await getState(page);
    if (s.isPaused) await resumeIfPaused(page);
    else if (predicate(s)) return s;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for: ${message}`);
    await page.waitForTimeout(150);
  }
}

test("move, break, and place through the homepage Play flow", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // Disable fullscreen-on-play before the app boots: requestFullscreen commonly
  // fails in an automated context, and it's not part of what this macro verifies.
  await page.addInitScript(() => {
    window.localStorage.setItem("voxelheim-settings", JSON.stringify({ fullscreenOnPlay: false }));
  });

  await page.goto("/");
  await page.getByRole("button", { name: /^Play$/ }).click();
  await page.waitForURL(/\/game\?worldId=/);

  // First-run visits show a one-time "Controls" popup over the canvas. A
  // returning session (this world played before) may skip it.
  await page
    .getByRole("button", { name: "Got it" })
    .click({ timeout: 15_000 })
    .catch(() => {});

  const canvas = page.locator("canvas").first();
  await canvas.waitFor({ state: "visible" });
  await canvas.click().catch(() => {});
  await page.waitForTimeout(500);
  await resumeIfPaused(page);

  const baseline = await waitForState(page, () => true, "engine state available");

  // Aim (via the debug hook, not mouse-look — see file header) at a block
  // one pace away on level ground, before moving away from the deterministic
  // spawn point this look direction was tuned for.
  await page.evaluate(
    ([yaw, pitch]) => window.__test!.setLook(yaw, pitch),
    [SAFE_LOOK_YAW, SAFE_LOOK_PITCH]
  );
  const aimed = await waitForState(page, (s) => s.targetedBlock !== null, "spawn look direction targets a block");
  const target = aimed.targetedBlock!;

  // Break: hold the primary button until the targeted block is gone.
  await page.mouse.down();
  await waitForState(
    page,
    (s) =>
      s.targetedBlock === null ||
      s.targetedBlock.x !== target.x ||
      s.targetedBlock.y !== target.y ||
      s.targetedBlock.z !== target.z,
    "the targeted block breaks",
    10_000
  );
  await page.mouse.up();

  const afterBreak = await waitForState(
    page,
    (s) => s.hotbar.some((slot) => slot !== null) || s.inventory.some((slot) => slot !== null),
    "the broken block's drop is picked up",
    10_000
  );

  // Place: select the picked-up stack and place it against the block that's
  // now targeted (the one behind the hole we just made).
  const heldIndex = afterBreak.hotbar.findIndex((s) => s !== null);
  expect(heldIndex).toBeGreaterThanOrEqual(0);
  await page.keyboard.press(`Digit${heldIndex + 1}`);

  const selected = await getState(page);
  const countBefore = selected.heldItem?.count ?? 0;
  expect(countBefore).toBeGreaterThan(0);
  expect(selected.targetedBlock).not.toBeNull();

  await page.mouse.click(640, 360, { button: "right" });

  const afterPlace = await waitForState(
    page,
    (s) => (s.heldItem?.count ?? 0) < countBefore,
    "the held stack decrements after placing"
  );
  expect(afterPlace.heldItem?.count ?? 0).toBeLessThan(countBefore);

  // Move: confirmed last, since it's the one step that doesn't depend on the
  // tuned spawn-relative look direction still pointing at anything useful.
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(800);
  await page.keyboard.up("KeyW");
  const afterMove = await getState(page);
  const distanceMoved = Math.hypot(
    afterMove.position.x - baseline.position.x,
    afterMove.position.z - baseline.position.z
  );
  expect(distanceMoved).toBeGreaterThan(0.2);

  expect(consoleErrors, `Unexpected console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
});
