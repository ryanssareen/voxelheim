"use client";

import { useEffect, useRef } from "react";
import type { Engine } from "@engine/Engine";
import type { EdgeIntent } from "@engine/input/intents";
import type { IntentSnapshot } from "@engine/input/snapshot";
import {
  UI_PRIORITY,
  UiIntentRouter,
  movementIntended,
  type UiBlocker,
  type UiInputState,
} from "@engine/input/uiIntents";
import { useChatStore } from "@store/useChatStore";
import { useGameStore } from "@store/useGameStore";
import { useInventoryStore } from "@store/useInventoryStore";

/**
 * React's side of the intent layer: the one place an overlay subscribes to a
 * named press, and the one place the four guard conditions are read from the
 * stores.
 *
 * Everything that decides *whether* a press counts lives in
 * `@engine/input/uiIntents`, which imports no stores and no DOM so it can be
 * exercised in the node test environment. This file is the plumbing that could
 * not be tested there anyway.
 */

export type EngineRef = React.RefObject<Engine | null>;

/** Samples the four blocker conditions from the stores, at press time. */
export function readUiInputState(): UiInputState {
  const game = useGameStore.getState();
  const inv = useInventoryStore.getState();
  return {
    dead: game.isDead,
    paused: game.isPaused,
    chatComposing: useChatStore.getState().composing,
    panelOpen: inv.isOpen || inv.tableOpen || inv.furnaceOpen || inv.creativeOpen,
  };
}

/**
 * One router per intent state, so priority and exclusivity are resolved across
 * all consumers rather than per component.
 *
 * Keyed weakly and never torn down: the `IntentState` belongs to the engine and
 * dies with it, and a router with no registrations dispatches nothing. Ref
 * counting the subscription would buy an unsubscribe that only ever runs when
 * the object holding it is already unreachable.
 */
const routers = new WeakMap<IntentSnapshot, UiIntentRouter>();

export function uiIntentRouterFor(intents: IntentSnapshot): UiIntentRouter {
  const existing = routers.get(intents);
  if (existing) return existing;

  const router = new UiIntentRouter();
  routers.set(intents, router);
  intents.onEdge((edge) => router.dispatch(edge, readUiInputState));
  return router;
}

export interface IntentEdgeOptions {
  /** Registration is skipped while false — e.g. a modal that is closed. */
  enabled?: boolean;
  /** See `UI_PRIORITY`. Defaults to the ordinary HUD level. */
  priority?: number;
  /** Stop lower-priority consumers from seeing this edge once this one fires. */
  exclusive?: boolean;
}

/**
 * Runs `onFire` when the named press happens and this consumer's blockers allow
 * it.
 *
 * `blockers` must be a module-level constant: it is a dependency of the
 * registration effect, and a fresh array every render would unregister and
 * re-register on every render. The declared lists in `@engine/input/uiIntents`
 * are exactly that.
 *
 * `onFire` is held in a ref rather than depended on, so a handler closing over
 * fresh props does not churn the registration.
 */
export function useIntentEdge(
  engineRef: EngineRef | undefined,
  intent: EdgeIntent,
  blockers: readonly UiBlocker[],
  onFire: () => void,
  options: IntentEdgeOptions = {},
): void {
  const { enabled = true, priority = UI_PRIORITY.hud, exclusive = false } = options;

  const handlerRef = useRef(onFire);
  useEffect(() => {
    handlerRef.current = onFire;
  }, [onFire]);

  useEffect(() => {
    if (!enabled) return;
    const intents = engineRef?.current?.intents;
    if (!intents) return;
    return uiIntentRouterFor(intents).register({
      intent,
      blockers,
      priority,
      exclusive,
      run: () => handlerRef.current(),
    });
  }, [engineRef, intent, blockers, priority, exclusive, enabled]);
}

/** How often the walkthrough asks whether the player is moving. */
const MOVE_POLL_MS = 100;

/**
 * Calls `onMove` while a movement intent is active.
 *
 * Held state has no edge to subscribe to, so this polls — at the same cadence
 * the debug overlay already polls the engine. The walkthrough step it drives is
 * one-shot (`notify` is a no-op once the step has advanced), so repeat calls
 * cost a store read.
 */
export function useMovementIntent(
  engineRef: EngineRef | undefined,
  enabled: boolean,
  onMove: () => void,
): void {
  const handlerRef = useRef(onMove);
  useEffect(() => {
    handlerRef.current = onMove;
  }, [onMove]);

  useEffect(() => {
    if (!enabled) return;
    const intents = engineRef?.current?.intents;
    if (!intents) return;
    const id = setInterval(() => {
      if (movementIntended(intents)) handlerRef.current();
    }, MOVE_POLL_MS);
    return () => clearInterval(id);
  }, [engineRef, enabled]);
}
