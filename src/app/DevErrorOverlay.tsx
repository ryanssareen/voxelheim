"use client";

/**
 * Flags that React actually hydrated.
 *
 * Deliberately does no rendering: the visible diagnostic is the plain inline
 * script in layout.tsx, because a React component cannot report that React
 * failed to mount — it would never run in that case.
 */
import { useEffect } from "react";

export function DevErrorOverlay() {
  useEffect(() => {
    (window as unknown as { __reactMounted?: boolean }).__reactMounted = true;
  }, []);
  return null;
}
