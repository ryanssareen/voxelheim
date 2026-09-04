import { useSettingsStore } from "@store/useSettingsStore";

/**
 * Self-contained mob SFX. This module owns its own lazily-created
 * AudioContext rather than sharing MusicManager's — MusicManager exposes no
 * one-shot API and entities are constructed in headless tests / SSR where
 * neither `window` nor `AudioContext` exist, so every entry point here must
 * degrade to a no-op rather than throw.
 */

export interface SfxHandle {
  stop(): void;
}

let sharedCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  if (!sharedCtx) {
    sharedCtx = new AudioContext();
  }
  if (sharedCtx.state === "suspended" && typeof sharedCtx.resume === "function") {
    // Game start already happened on a user click, so resume() is legal here;
    // if it isn't (or the stub context doesn't return a real promise) this is
    // harmless either way.
    try {
      const resumed = sharedCtx.resume();
      if (resumed && typeof resumed.then === "function") resumed.catch(() => {});
    } catch {
      // Non-fatal: the context may still work for scheduling even unresumed.
    }
  }
  return sharedCtx;
}

// A local LCG, not Math.random — mob AI reads Math.random for its own
// decisions and tests spy on it, so audio noise must not consume from it.
let lcgState = 0x2545f491;
function nextLcgSample(): number {
  lcgState = (lcgState * 1664525 + 1013904223) >>> 0;
  return lcgState / 0xffffffff;
}

/**
 * A hissing noise burst that swells toward detonation, gated by the music
 * settings (there is no separate SFX volume). Returns null in node, when the
 * environment has no AudioContext, or when the player has music disabled.
 */
export function playCreeperHiss(distance: number, seconds: number): SfxHandle | null {
  const settings = useSettingsStore.getState();
  if (!settings.musicEnabled) return null;

  const ctx = getContext();
  if (!ctx) return null;

  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(seconds * sampleRate));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = nextLcgSample() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2400;
  filter.Q.value = 0.7;

  const gain = ctx.createGain();
  const vol = (settings.musicVolume / 100) * 0.35 / (1 + distance / 4);
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(vol, now + 0.05);
  gain.gain.linearRampToValueAtTime(vol * 1.6, now + seconds);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);

  let stopped = false;
  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      try {
        const stopNow = ctx.currentTime;
        gain.gain.cancelScheduledValues(stopNow);
        gain.gain.setTargetAtTime(0, stopNow, 0.03);
        source.stop(stopNow + 0.15);
      } catch {
        // The source may already be stopped or the context closed — nothing
        // further to clean up either way.
      }
    },
  };
}
