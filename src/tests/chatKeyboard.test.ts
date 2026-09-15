import { describe, it, expect } from "vitest";
import { chatBottomOffset } from "@ui/ChatUI";

/**
 * R25: chat stays usable with the soft keyboard shown.
 *
 * The positioning rule is the whole of what can be tested here — there is no
 * DOM in this environment (`vitest.config.ts` runs `environment: "node"`), and
 * a soft keyboard is not something a test can raise in any case. So this pins
 * the arithmetic, and R32's human on a real phone is what confirms the composer
 * actually lands above the keys.
 *
 * The rule itself is the interesting part. `window.innerHeight` does not change
 * when a keyboard opens; `visualViewport.height` does. Their difference *is*
 * the occlusion — keyboard, suggestion strip, and any browser chrome overlapping
 * the page — which is why nothing here guesses a keyboard height. Keyboards
 * differ by device, by language, and by whether autocorrect is showing.
 */

describe("chatBottomOffset", () => {
  it("rests above the hotbar when nothing occludes the viewport", () => {
    // Every desktop browser, and a phone with the keyboard closed: the two
    // heights agree, so there is nothing to clear.
    expect(chatBottomOffset(820, 820)).toBe(140);
  });

  it("lifts the composer clear of an open keyboard", () => {
    // A landscape phone: 390 tall, roughly 200 of it taken by the keyboard.
    expect(chatBottomOffset(390, 190)).toBe(208);
  });

  it("scales with the occlusion rather than assuming a keyboard height", () => {
    // A taller keyboard (a language with a candidate bar, say) pushes further.
    const short = chatBottomOffset(390, 240);
    const tall = chatBottomOffset(390, 150);
    expect(tall).toBeGreaterThan(short);
    expect(tall - short).toBe(90);
  });

  it("falls back to the resting offset when the visual viewport reads larger", () => {
    // Some browsers briefly report a visual viewport taller than the window
    // mid-rotation. Trusting the subtraction there would yield a negative
    // offset and drop the composer off the bottom of the screen.
    expect(chatBottomOffset(390, 420)).toBe(140);
  });

  it("falls back when a height is not a number", () => {
    // `visualViewport` is absent on older browsers and the env substitutes
    // `window.innerHeight`; this covers the case where neither resolved.
    expect(chatBottomOffset(Number.NaN, 200)).toBe(140);
    expect(chatBottomOffset(800, Number.NaN)).toBe(140);
  });

  it("returns whole pixels", () => {
    // Fractional device pixel ratios make these non-integers, and a
    // sub-pixel `bottom` is a blurry text field on exactly the device that can
    // least afford one.
    expect(Number.isInteger(chatBottomOffset(390.5, 190.25))).toBe(true);
  });
});
